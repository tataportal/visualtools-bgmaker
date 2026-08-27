import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 4177);
const host = process.env.HOST || "127.0.0.1";
const tmpDir = path.join(__dirname, ".tmp");
const exportsDir = path.join(__dirname, "exports");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp4", "video/mp4"],
]);

await mkdir(tmpDir, { recursive: true });
await mkdir(exportsDir, { recursive: true });

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 90_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function safeId(value) {
  return typeof value === "string" && /^[a-f0-9]{16}$/.test(value);
}

function sessionPath(id) {
  return path.join(tmpDir, id);
}

function makeId() {
  return createHash("sha256")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 16);
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/") pathname = "/index.html";

  let filePath;
  if (pathname.startsWith("/exports/")) {
    const filename = path.basename(pathname);
    filePath = path.join(exportsDir, filename);
  } else {
    filePath = path.join(__dirname, pathname);
  }

  if (!filePath.startsWith(__dirname)) return notFound(res);

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes.get(ext) || "application/octet-stream",
      "Content-Length": file.length,
      "Cache-Control": "no-store",
    });
    res.end(file);
  } catch {
    notFound(res);
  }
}

async function handleApi(req, res) {
  try {
    if (req.url === "/api/session" && req.method === "POST") {
      const id = makeId();
      const dir = sessionPath(id);
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      return json(res, 200, { id });
    }

    if (req.url === "/api/frame-batch" && req.method === "POST") {
      const body = await readJson(req);
      if (!safeId(body.id) || !Array.isArray(body.frames)) {
        return json(res, 400, { error: "Invalid frame batch" });
      }

      const dir = sessionPath(body.id);
      await stat(dir);

      await Promise.all(
        body.frames.map(async (frame) => {
          const index = Number(frame.index);
          const dataUrl = String(frame.dataUrl || "");
          const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
          if (!Number.isInteger(index) || index < 0 || !match) {
            throw new Error("Invalid frame");
          }
          const filename = path.join(dir, `frame_${String(index).padStart(4, "0")}.png`);
          await writeFile(filename, Buffer.from(match[1], "base64"));
        })
      );

      return json(res, 200, { ok: true });
    }

    if (req.url === "/api/encode" && req.method === "POST") {
      const body = await readJson(req);
      if (!safeId(body.id)) return json(res, 400, { error: "Invalid session" });

      const width = Number(body.width || 1080);
      const height = Number(body.height || 1920);
      const fps = Number(body.fps || 30);
      const frameCount = Number(body.frameCount || 0);
      if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 512 ||
        height < 512 ||
        width > 3840 ||
        height > 3840 ||
        width % 2 !== 0 ||
        height % 2 !== 0
      ) {
        return json(res, 400, { error: "Invalid size" });
      }
      if (![24, 30, 60].includes(fps) || frameCount < fps || frameCount > fps * 20) {
        return json(res, 400, { error: "Invalid timing" });
      }

      const dir = sessionPath(body.id);
      await stat(path.join(dir, "frame_0000.png"));

      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
      const filename = `sale-bg-${width}x${height}-${stamp}.mp4`;
      const outputPath = path.join(exportsDir, filename);

      const args = [
        "-y",
        "-framerate",
        String(fps),
        "-i",
        path.join(dir, "frame_%04d.png"),
        "-frames:v",
        String(frameCount),
        "-vf",
        `scale=${width}:${height}:flags=lanczos`,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(fps),
        "-movflags",
        "+faststart",
        outputPath,
      ];

      const result = await new Promise((resolve) => {
        const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.on("close", (code) => resolve({ code, stderr }));
      });

      if (result.code !== 0) {
        return json(res, 500, { error: "ffmpeg failed", detail: result.stderr.slice(-1600) });
      }

      return json(res, 200, {
        ok: true,
        url: `/exports/${filename}`,
        file: outputPath,
      });
    }

    return notFound(res);
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error" });
  }
}

const server = createServer((req, res) => {
  if (req.url?.startsWith("/api/")) return handleApi(req, res);
  return serveStatic(req, res);
});

server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Sale Type Generator running at http://${host}:${port}`);
});

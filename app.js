import * as THREE from "./node_modules/three/build/three.module.js";

const $ = (selector) => document.querySelector(selector);

const preview = $("#preview");
const controls = {
  text: $("#text"),
  format: $("#format"),
  orientation: $("#orientation"),
  motion: $("#motion"),
  spacing: $("#spacing"),
  scale: $("#scale"),
  depth: $("#depth"),
  bgMode: $("#bgMode"),
  bgColorA: $("#bgColorA"),
  bgColorB: $("#bgColorB"),
  textColor: $("#textColor"),
  angle: $("#angle"),
  duration: $("#duration"),
};

const outputs = {
  motion: $("#motionOut"),
  spacing: $("#spacingOut"),
  scale: $("#scaleOut"),
  depth: $("#depthOut"),
  angle: $("#angleOut"),
  duration: $("#durationOut"),
};

const exportBtn = $("#exportBtn");
const downloadLink = $("#downloadLink");
const statusEl = $("#status");
const movementInputs = [...document.querySelectorAll('input[name="movementType"]')];

const formats = {
  "1x1": [1, 1],
  "3x2": [3, 2],
  "3x4": [3, 4],
  "4x5": [4, 5],
  "16x9": [16, 9],
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function even(value) {
  return Math.round(value / 2) * 2;
}

function dimensionsFor(format, orientation) {
  let [a, b] = formats[format] || formats["16x9"];
  if (orientation === "vertical" && a > b) [a, b] = [b, a];
  if (orientation === "horizontal" && a < b) [a, b] = [b, a];
  if (a === b) return { width: 1080, height: 1080 };
  if (a > b) return { width: even(1080 * (a / b)), height: 1080 };
  return { width: 1080, height: even(1080 * (b / a)) };
}

function settingsNow() {
  const dimensions = dimensionsFor(controls.format.value, controls.orientation.value);
  return {
    text: (controls.text.value || "SALE").trim().toUpperCase() || "SALE",
    format: controls.format.value,
    orientation: controls.orientation.value,
    width: dimensions.width,
    height: dimensions.height,
    fps: 30,
    duration: Number(controls.duration.value),
    movementType: document.querySelector('input[name="movementType"]:checked')?.value || "depth",
    motion: Number(controls.motion.value),
    spacing: Number(controls.spacing.value),
    scale: Number(controls.scale.value),
    depth: Number(controls.depth.value),
    bgMode: controls.bgMode.value,
    bgColorA: controls.bgColorA.value,
    bgColorB: controls.bgColorB.value,
    textColor: controls.textColor.value,
    angle: Number(controls.angle.value),
  };
}

function syncUi() {
  const settings = settingsNow();
  outputs.motion.value = settings.motion.toFixed(2);
  outputs.spacing.value = settings.spacing.toFixed(2);
  outputs.scale.value = settings.scale.toFixed(2);
  outputs.depth.value = settings.depth.toFixed(2);
  outputs.angle.value = String(settings.angle);
  outputs.duration.value = `${settings.duration}s`;
  statusEl.textContent = `${settings.width} x ${settings.height} listo.`;
}

function makeBackgroundTexture(settings) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d", { alpha: false });

  if (settings.bgMode === "gradient") {
    const radians = ((settings.angle - 90) * Math.PI) / 180;
    const distance = Math.hypot(canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const dx = Math.cos(radians) * distance * 0.5;
    const dy = Math.sin(radians) * distance * 0.5;
    const gradient = context.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    gradient.addColorStop(0, settings.bgColorA);
    gradient.addColorStop(1, settings.bgColorB);
    context.fillStyle = gradient;
  } else {
    context.fillStyle = settings.bgColorA;
  }

  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function drawRepeatedText(context, text, start, end, y, fontSize, gap) {
  context.font = `${fontSize}px Didot, "Bodoni 72", Georgia, serif`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  const wordWidth = context.measureText(text).width;
  const available = Math.max(1, end - start);
  const count = Math.max(1, Math.floor((available + gap) / (wordWidth + gap)));
  const totalWidth = count * wordWidth + Math.max(0, count - 1) * gap;
  let x = start + (available - totalWidth) / 2;

  context.save();
  context.beginPath();
  context.rect(start, y - fontSize * 0.56, available, fontSize * 1.12);
  context.clip();
  for (let index = 0; index < count; index += 1) {
    context.fillText(text, x, y);
    x += wordWidth + gap;
  }
  context.restore();
}

function makeFrameTexture(settings, aspect, frameWidth, frameHeight, textHeight) {
  const canvas = document.createElement("canvas");
  if (aspect >= 1) {
    canvas.width = 2048;
    canvas.height = Math.max(640, Math.round(2048 / aspect));
  } else {
    canvas.height = 2048;
    canvas.width = Math.max(640, Math.round(2048 * aspect));
  }

  const context = canvas.getContext("2d");
  const fontSize = Math.max(18, (textHeight / frameHeight) * canvas.height * 0.96);
  const cornerGap = fontSize * (0.62 + settings.spacing * 0.54);
  const wordGap = fontSize * (0.14 + settings.spacing * 0.26);
  const baseline = fontSize * 0.54;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = settings.textColor;

  drawRepeatedText(
    context,
    settings.text,
    cornerGap,
    canvas.width - cornerGap,
    baseline,
    fontSize,
    wordGap,
  );

  context.save();
  context.translate(canvas.width, canvas.height);
  context.rotate(Math.PI);
  drawRepeatedText(
    context,
    settings.text,
    cornerGap,
    canvas.width - cornerGap,
    baseline,
    fontSize,
    wordGap,
  );
  context.restore();

  context.save();
  context.translate(0, canvas.height);
  context.rotate(-Math.PI / 2);
  drawRepeatedText(
    context,
    settings.text,
    cornerGap,
    canvas.height - cornerGap,
    baseline,
    fontSize,
    wordGap,
  );
  context.restore();

  context.save();
  context.translate(canvas.width, 0);
  context.rotate(Math.PI / 2);
  drawRepeatedText(
    context,
    settings.text,
    cornerGap,
    canvas.height - cornerGap,
    baseline,
    fontSize,
    wordGap,
  );
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function textMaterial(texture) {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.025,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

class TunnelRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.1, 100);
    this.camera.position.set(0, 0, 0);
    this.scene.add(this.camera);
    this.ringRoot = new THREE.Group();
    this.portalRoot = new THREE.Group();
    this.scene.add(this.portalRoot);
    this.scene.add(this.ringRoot);
    this.rings = [];
    this.resources = [];
    this.designKey = "";
    this.width = 0;
    this.height = 0;
  }

  setSize(width, height) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.designKey = "";
  }

  clearDesign() {
    this.ringRoot.clear();
    this.portalRoot.clear();
    this.rings = [];
    for (const resource of this.resources) resource.dispose();
    this.resources = [];
    if (this.scene.background?.dispose) this.scene.background.dispose();
    this.scene.background = null;
  }

  rebuild(settings) {
    this.clearDesign();

    const aspect = this.width / this.height;
    const depthT = clamp((settings.depth - 0.25) / 0.7, 0, 1);
    const spacingT = clamp((settings.spacing - 0.45) / 1.95, 0, 1);
    const fov = lerp(70, 48, depthT);
    const tangent = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const halfHeight = 1;
    const halfWidth = aspect;
    const shortAxisScale = Math.min(1, aspect);
    const frameWidth = halfWidth * 2.08;
    const frameHeight = halfHeight * 2.08;
    const nearDistance = halfHeight / (tangent * 1.08);
    const farRatio = lerp(3.65, 4.55, depthT);
    const depthStep = lerp(1.1, 1.34, spacingT);
    const requestedTextHeight = 0.205 * shortAxisScale * settings.scale;
    const availableBandHeight = halfHeight * (1 - 1 / depthStep) * 1.3;
    const textHeight = Math.min(requestedTextHeight, availableBandHeight);
    const ringCount = clamp(
      Math.floor(Math.log(farRatio) / Math.log(depthStep)) + 1,
      7,
      22,
    );

    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.nearDistance = nearDistance;
    this.depthStep = depthStep;
    this.ringCount = ringCount;
    this.halfWidth = halfWidth;
    this.halfHeight = halfHeight;
    this.scene.background = makeBackgroundTexture(settings);

    const frameTexture = makeFrameTexture(
      settings,
      aspect,
      frameWidth,
      frameHeight,
      textHeight,
    );
    const frameMaterial = textMaterial(frameTexture);
    const frameGeometry = new THREE.PlaneGeometry(frameWidth, frameHeight);
    this.resources.push(frameTexture, frameMaterial, frameGeometry);

    for (let index = 0; index < ringCount; index += 1) {
      const frame = new THREE.Mesh(frameGeometry, frameMaterial);
      this.ringRoot.add(frame);
      this.rings.push(frame);
    }

    const portalDistance = nearDistance * depthStep ** ringCount;
    const stripeWidth = halfWidth * 2 * 0.07;
    const stripeHeight = halfHeight * 2 * 0.78;
    const baseColor = new THREE.Color(
      settings.bgMode === "gradient" ? settings.bgColorB : settings.bgColorA,
    );
    const stripeColor = baseColor.clone().lerp(new THREE.Color("#ffffff"), 0.38);
    const stripeGeometry = new THREE.PlaneGeometry(stripeWidth, stripeHeight);
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: stripeColor, toneMapped: false });
    const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
    stripe.position.z = -portalDistance;
    this.portalRoot.add(stripe);
    this.resources.push(stripeGeometry, stripeMaterial);
  }

  render(time, settings, width, height) {
    this.setSize(width, height);
    const designKey = [
      settings.text,
      settings.spacing,
      settings.scale,
      settings.depth,
      settings.bgMode,
      settings.bgColorA,
      settings.bgColorB,
      settings.textColor,
      settings.angle,
      width,
      height,
    ].join("|");

    if (designKey !== this.designKey) {
      this.rebuild(settings);
      this.designKey = designKey;
    }

    for (let index = 0; index < this.rings.length; index += 1) {
      const frame = this.rings[index];
      let distance;

      frame.position.set(0, 0, 0);
      frame.rotation.set(0, 0, 0);
      frame.scale.setScalar(1);

      if (settings.movementType === "pulse") {
        const baseDistance = this.nearDistance * this.depthStep ** index;
        const phase = time * settings.motion * 1.35 + index * 0.42;
        distance = baseDistance * (1 + Math.sin(phase) * 0.07);
        frame.scale.setScalar(1 + Math.sin(phase * 0.82) * 0.025);
      } else if (settings.movementType === "spin") {
        const progress = time * settings.motion * 0.28;
        const depthIndex = mod(index - progress, this.ringCount);
        distance = this.nearDistance * this.depthStep ** depthIndex;
        frame.rotation.z = time * settings.motion * 0.32 + index * 0.055;
      } else if (settings.movementType === "wave") {
        const baseDistance = this.nearDistance * this.depthStep ** index;
        const phase = time * settings.motion * 1.15 + index * 0.55;
        distance = baseDistance * (1 + Math.sin(phase) * 0.045);
        frame.position.x = Math.sin(phase) * this.halfWidth * 0.065;
        frame.position.y = Math.cos(phase * 0.83) * this.halfHeight * 0.045;
        frame.rotation.z = Math.sin(phase * 0.72) * 0.075;
      } else {
        const progress = time * settings.motion * 0.62;
        const depthIndex = mod(index - progress, this.ringCount);
        distance = this.nearDistance * this.depthStep ** depthIndex;
      }

      frame.position.z = -distance;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.clearDesign();
    this.renderer.dispose();
  }
}

let previewTunnel;

try {
  previewTunnel = new TunnelRenderer(preview);
} catch (error) {
  statusEl.textContent = "Este navegador no pudo iniciar el render 3D.";
  throw error;
}

function drawPreview(time = performance.now()) {
  const settings = settingsNow();
  const rect = preview.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ratio = settings.width / settings.height;
  preview.style.aspectRatio = `${settings.width} / ${settings.height}`;
  preview.style.setProperty("--preview-ratio", ratio);

  let canvasWidth = Math.max(2, Math.round(rect.width * dpr));
  let canvasHeight = Math.max(2, Math.round(canvasWidth / ratio));
  if (canvasHeight > window.innerHeight * dpr - 36) {
    canvasHeight = Math.max(2, Math.round(window.innerHeight * dpr - 36));
    canvasWidth = Math.max(2, Math.round(canvasHeight * ratio));
  }

  previewTunnel.render(time / 1000, settings, canvasWidth, canvasHeight);
  requestAnimationFrame(drawPreview);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.detail || json.error || "Request failed");
  return json;
}

function waitForBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo renderizar el frame."));
    }, "image/png");
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function exportMp4() {
  const settings = settingsNow();
  const frameCount = settings.duration * settings.fps;
  const exportCanvas = document.createElement("canvas");
  const exportTunnel = new TunnelRenderer(exportCanvas);
  const batchSize = Math.max(2, Math.floor(8_000_000 / (settings.width * settings.height)));

  exportBtn.disabled = true;
  downloadLink.hidden = true;
  statusEl.textContent = "Preparando export...";

  try {
    const session = await postJson("/api/session", {});
    let batch = [];

    for (let index = 0; index < frameCount; index += 1) {
      exportTunnel.render(index / settings.fps, settings, settings.width, settings.height);
      const blob = await waitForBlob(exportCanvas);
      batch.push({ index, dataUrl: await blobToDataUrl(blob) });

      if (batch.length === batchSize || index === frameCount - 1) {
        await postJson("/api/frame-batch", { id: session.id, frames: batch });
        batch = [];
      }

      const progress = Math.round(((index + 1) / frameCount) * 100);
      statusEl.textContent = `Renderizando frames: ${progress}%`;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    statusEl.textContent = "Codificando MP4...";
    const encoded = await postJson("/api/encode", {
      id: session.id,
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      frameCount,
    });

    downloadLink.href = encoded.url;
    downloadLink.hidden = false;
    downloadLink.setAttribute("download", "");
    statusEl.textContent = `Export listo: ${encoded.file}`;
  } catch (error) {
    statusEl.textContent = error.message || "Export fallido.";
  } finally {
    exportTunnel.dispose();
    exportBtn.disabled = false;
  }
}

Object.values(controls).forEach((control) => {
  control.addEventListener("input", syncUi);
});

movementInputs.forEach((input) => {
  input.addEventListener("change", syncUi);
});

exportBtn.addEventListener("click", exportMp4);
syncUi();
requestAnimationFrame(drawPreview);

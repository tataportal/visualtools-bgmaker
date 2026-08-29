import * as THREE from "./vendor/three.module.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";
import { ArrayBufferTarget, Muxer } from "./vendor/mp4-muxer.mjs";

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
  depthOrigin: $("#depthOrigin"),
  density: $("#density"),
  variation: $("#variation"),
  amplitude: $("#amplitude"),
  frequency: $("#frequency"),
  twist: $("#twist"),
  seed: $("#seed"),
  vanishX: $("#vanishX"),
  vanishY: $("#vanishY"),
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
  depthOrigin: $("#depthOriginOut"),
  density: $("#densityOut"),
  variation: $("#variationOut"),
  amplitude: $("#amplitudeOut"),
  frequency: $("#frequencyOut"),
  twist: $("#twistOut"),
  seed: $("#seedOut"),
  vanishX: $("#vanishXOut"),
  vanishY: $("#vanishYOut"),
  angle: $("#angleOut"),
  duration: $("#durationOut"),
};

const exportBtn = $("#exportBtn");
const randomBtn = $("#randomBtn");
const downloadLink = $("#downloadLink");
const statusEl = $("#status");
const depthOriginField = $("#depthOriginField");
const colorBField = $("#colorBField");
const angleField = $("#angleField");
const compositionInputs = [...document.querySelectorAll('input[name="compositionType"]')];
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

function random01(seed, index, salt = 0) {
  let value = (seed | 0) ^ Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt + 1, 0x27d4eb2d);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function signedRandom(seed, index, salt = 0) {
  return random01(seed, index, salt) * 2 - 1;
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

function setRangeValue(control, value) {
  const min = Number(control.min);
  const max = Number(control.max);
  const step = Number(control.step) || 1;
  const snapped = min + Math.round((clamp(value, min, max) - min) / step) * step;
  control.value = String(clamp(snapped, min, max));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function settingsNow() {
  const dimensions = dimensionsFor(controls.format.value, controls.orientation.value);
  const textParts = (controls.text.value || "SALE")
    .split("|")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 8);

  if (!textParts.length) textParts.push("SALE");

  return {
    text: textParts[0],
    textParts,
    format: controls.format.value,
    orientation: controls.orientation.value,
    width: dimensions.width,
    height: dimensions.height,
    fps: 30,
    duration: Number(controls.duration.value),
    compositionType:
      document.querySelector('input[name="compositionType"]:checked')?.value || "tunnel",
    movementType: document.querySelector('input[name="movementType"]:checked')?.value || "depth",
    motion: Number(controls.motion.value),
    spacing: Number(controls.spacing.value),
    scale: Number(controls.scale.value),
    depth: Number(controls.depth.value),
    depthOrigin: Number(controls.depthOrigin.value),
    density: Number(controls.density.value),
    variation: Number(controls.variation.value),
    amplitude: Number(controls.amplitude.value),
    frequency: Number(controls.frequency.value),
    twist: Number(controls.twist.value),
    seed: Number(controls.seed.value),
    vanishX: Number(controls.vanishX.value),
    vanishY: Number(controls.vanishY.value),
    bgMode: controls.bgMode.value,
    bgColorA: controls.bgColorA.value,
    bgColorB: controls.bgColorB.value,
    textColor: controls.textColor.value,
    angle: Number(controls.angle.value),
  };
}

function syncUi() {
  const settings = settingsNow();
  outputs.motion.value = `${settings.motion.toFixed(1)}x`;
  outputs.spacing.value = settings.spacing.toFixed(2);
  outputs.scale.value = settings.scale.toFixed(2);
  outputs.depth.value = settings.depth.toFixed(2);
  outputs.depthOrigin.value = settings.depthOrigin.toFixed(1);
  outputs.density.value = String(settings.density);
  outputs.variation.value = settings.variation.toFixed(2);
  outputs.amplitude.value = settings.amplitude.toFixed(2);
  outputs.frequency.value = settings.frequency.toFixed(2);
  outputs.twist.value = settings.twist.toFixed(2);
  outputs.seed.value = String(settings.seed);
  outputs.vanishX.value = settings.vanishX.toFixed(2);
  outputs.vanishY.value = settings.vanishY.toFixed(2);
  outputs.angle.value = String(settings.angle);
  outputs.duration.value = `${settings.duration}s`;
  const gradientEnabled = settings.bgMode === "gradient";
  depthOriginField.hidden = settings.compositionType !== "tunnel";
  colorBField.hidden = !gradientEnabled;
  angleField.hidden = !gradientEnabled;
  statusEl.textContent = `${settings.width} x ${settings.height} listo.`;
}

function randomizeSelectedComposition() {
  const composition =
    document.querySelector('input[name="compositionType"]:checked')?.value || "tunnel";
  const movements = ["depth", "pulse", "spin", "wave"];
  const densityRanges = {
    tunnel: [5, 28],
    rows: [4, 26],
    columns: [4, 24],
    grid: [6, 32],
  };
  const labels = {
    tunnel: "Tunel",
    rows: "Filas",
    columns: "Columnas",
    grid: "Reticula",
  };
  const direction = Math.random() < 0.5 ? -1 : 1;
  const movement = movements[Math.floor(Math.random() * movements.length)];
  const densityRange = densityRanges[composition];

  setRangeValue(controls.motion, direction * randomBetween(0.5, 5.8));
  setRangeValue(controls.spacing, Math.pow(Math.random(), 1.55) * 6.5);
  setRangeValue(controls.scale, randomBetween(0.35, 2.6));
  setRangeValue(controls.depth, randomBetween(0.12, 1.9));
  setRangeValue(controls.density, randomBetween(densityRange[0], densityRange[1]));
  setRangeValue(controls.variation, Math.pow(Math.random(), 1.4) * 1.2);
  setRangeValue(controls.amplitude, randomBetween(0.25, 2.6));
  setRangeValue(controls.frequency, randomBetween(0.25, 4.8));
  setRangeValue(controls.twist, randomBetween(-2.5, 2.5));
  setRangeValue(controls.seed, Math.floor(randomBetween(0, 1000)));
  setRangeValue(controls.vanishX, randomBetween(-0.78, 0.78));
  setRangeValue(controls.vanishY, randomBetween(-0.78, 0.78));

  if (composition === "tunnel") {
    setRangeValue(controls.depthOrigin, randomBetween(4, 68));
  }

  document.querySelector(
    `input[name="movementType"][value="${movement}"]`,
  ).checked = true;
  downloadLink.hidden = true;
  syncUi();
  statusEl.textContent = `${labels[composition]} random listo.`;
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

function makeLabelTexture(text, settings) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  let fontSize = 300 * settings.scale;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = settings.textColor;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${fontSize}px Didot, "Bodoni 72", Georgia, serif`;

  const measured = context.measureText(text).width;
  if (measured > canvas.width * 0.88) {
    fontSize *= (canvas.width * 0.88) / measured;
    context.font = `${fontSize}px Didot, "Bodoni 72", Georgia, serif`;
  }

  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function makeWordAsset(text, settings, textHeight) {
  const canvas = document.createElement("canvas");
  const fontSize = 192;
  const paddingX = 38;
  const paddingY = 28;
  let context = canvas.getContext("2d");

  context.font = `${fontSize}px Didot, "Bodoni 72", Georgia, serif`;
  const metrics = context.measureText(text);
  canvas.width = Math.max(180, Math.ceil(metrics.width + paddingX * 2));
  canvas.height = fontSize + paddingY * 2;

  context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = settings.textColor;
  context.font = `${fontSize}px Didot, "Bodoni 72", Georgia, serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + fontSize * 0.035);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  const aspect = canvas.width / canvas.height;
  const geometry = new THREE.PlaneGeometry(textHeight * aspect, textHeight);
  const material = textMaterial(texture);

  return {
    texture,
    material,
    geometry,
    width: textHeight * aspect,
    height: textHeight,
  };
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
    this.rings = [];
    for (const resource of this.resources) resource.dispose();
    this.resources = [];
    if (this.scene.background?.dispose) this.scene.background.dispose();
    this.scene.background = null;
  }

  rebuild(settings) {
    this.clearDesign();

    const aspect = this.width / this.height;
    const depthT = clamp(settings.depth / 2, 0, 1);
    const fov = lerp(26, 108, Math.pow(depthT, 0.82));
    const tangent = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const halfHeight = 1;
    const halfWidth = aspect;

    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.halfWidth = halfWidth;
    this.halfHeight = halfHeight;
    this.depthStrength = depthT;
    this.patternDistance = halfHeight / tangent;
    this.compositionType = settings.compositionType;
    this.scene.background = makeBackgroundTexture(settings);

    if (settings.compositionType === "rows") {
      this.buildRows(settings);
    } else if (settings.compositionType === "columns") {
      this.buildColumns(settings);
    } else if (settings.compositionType === "grid") {
      this.buildGrid(settings);
    } else {
      this.buildTunnel(settings, aspect, tangent, depthT);
    }
  }

  buildTunnel(settings, aspect, tangent, depthT) {
    const halfHeight = this.halfHeight;
    const halfWidth = this.halfWidth;
    const shortAxisScale = Math.min(1, aspect);
    const frameWidth = halfWidth * 2.08;
    const frameHeight = halfHeight * 2.08;
    const nearDistance = halfHeight / (tangent * 1.08);
    const textHeight = 0.205 * shortAxisScale * settings.scale;
    const ringCount = clamp(Math.round(settings.density), 2, 36);

    this.nearDistance = nearDistance;
    this.ringCount = ringCount;
    this.tunnelFarRatio = settings.depthOrigin;
    this.tunnelCurve = lerp(0.42, 3.4, depthT);

    const asset = makeWordAsset(settings.text, settings, textHeight);
    asset.material.depthWrite = true;
    const wordGap = textHeight * settings.spacing;
    const cornerGap = textHeight * (0.35 + settings.spacing * 0.5);
    const wordGeometries = [];

    const addSide = (length, fixed, rotation, vertical) => {
      const available = Math.max(asset.width, length - cornerGap * 2);
      const count = Math.max(1, Math.floor((available + wordGap) / (asset.width + wordGap)));
      const total = count * asset.width + Math.max(0, count - 1) * wordGap;
      const start = -total / 2 + asset.width / 2;

      for (let index = 0; index < count; index += 1) {
        const position = start + index * (asset.width + wordGap);
        const geometry = asset.geometry.clone();
        const matrix = new THREE.Matrix4();
        const translation = vertical
          ? new THREE.Vector3(fixed, position, 0)
          : new THREE.Vector3(position, fixed, 0);
        matrix.compose(
          translation,
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotation),
          new THREE.Vector3(1, 1, 1),
        );
        geometry.applyMatrix4(matrix);
        wordGeometries.push(geometry);
      }
    };

    addSide(frameWidth, halfHeight, 0, false);
    addSide(frameWidth, -halfHeight, Math.PI, false);
    addSide(frameHeight, -halfWidth, Math.PI / 2, true);
    addSide(frameHeight, halfWidth, -Math.PI / 2, true);

    const frameGeometry = mergeGeometries(wordGeometries, false);
    for (const geometry of wordGeometries) geometry.dispose();
    if (!frameGeometry) throw new Error("No se pudo construir el marco tipografico.");
    this.resources.push(asset.texture, asset.material, asset.geometry, frameGeometry);

    for (let index = 0; index < ringCount; index += 1) {
      const frame = new THREE.Mesh(frameGeometry, asset.material);
      frame.userData = {
        index,
        depthJitter: signedRandom(settings.seed, index, 1) * settings.variation * 0.22,
        xJitter: signedRandom(settings.seed, index, 2) * settings.variation * 0.22,
        yJitter: signedRandom(settings.seed, index, 3) * settings.variation * 0.22,
        rotationJitter: signedRandom(settings.seed, index, 4) * settings.variation * 0.42,
        scaleJitter: signedRandom(settings.seed, index, 5) * settings.variation * 0.38,
        phaseJitter: random01(settings.seed, index, 6) * Math.PI * 2,
      };
      this.ringRoot.add(frame);
      this.rings.push(frame);
    }

  }

  buildRows(settings) {
    const rowCount = clamp(Math.round(settings.density), 2, 36);
    const laneHeight = (this.halfHeight * 2) / rowCount;

    for (let index = 0; index < rowCount; index += 1) {
      const text = settings.textParts[index % settings.textParts.length];
      const textHeight = laneHeight * 0.74 * settings.scale;
      const asset = makeWordAsset(text, settings, textHeight);
      asset.material.depthWrite = false;
      const gap = textHeight * settings.spacing;
      const wordStep = asset.width + gap;
      const normalizedY = rowCount === 1 ? 0 : (index / (rowCount - 1)) * 2 - 1;
      const distanceBase = this.patternDistance * (
        1 + Math.abs(normalizedY) * this.depthStrength * 1.15
      );
      const distance = distanceBase * Math.max(
        0.32,
        1 + signedRandom(settings.seed, index, 10) * settings.variation * 0.24,
      );
      const projectionScale = distance / this.patternDistance;
      const screenY = this.halfHeight - laneHeight * (index + 0.5);
      const baseY = screenY * projectionScale;
      const span = this.halfWidth * 4.2 * projectionScale;
      const wordCount = clamp(Math.ceil(span / wordStep) + 3, 3, 80);
      const start = -(wordCount * wordStep) / 2 + wordStep / 2;
      const row = new THREE.Group();

      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        const word = new THREE.Mesh(asset.geometry, asset.material);
        const randomIndex = index * 1000 + wordIndex;
        word.position.x = start + wordIndex * wordStep +
          signedRandom(settings.seed, randomIndex, 11) * wordStep * settings.variation * 0.15;
        word.position.y = signedRandom(settings.seed, randomIndex, 12) *
          textHeight * settings.variation * 0.58;
        word.rotation.z = signedRandom(settings.seed, randomIndex, 13) *
          settings.variation * 0.38;
        word.scale.setScalar(Math.max(
          0.12,
          1 + signedRandom(settings.seed, randomIndex, 14) * settings.variation * 0.42,
        ));
        row.add(word);
      }

      row.position.set(0, baseY, -distance);
      row.userData = {
        kind: "row",
        index,
        baseY,
        baseDistance: distance,
        laneHeight: laneHeight * projectionScale,
        wordStep,
        baseOffset: mod(random01(settings.seed, index, 15) * wordStep, wordStep),
        xJitter: signedRandom(settings.seed, index, 16) * settings.variation,
        yJitter: signedRandom(settings.seed, index, 17) * settings.variation,
        rotationJitter: signedRandom(settings.seed, index, 18) * settings.variation,
        scaleJitter: signedRandom(settings.seed, index, 19) * settings.variation,
        phaseJitter: random01(settings.seed, index, 20) * Math.PI * 2,
      };
      this.ringRoot.add(row);
      this.rings.push(row);
      this.resources.push(asset.texture, asset.material, asset.geometry);
    }
  }

  buildColumns(settings) {
    const columnCount = clamp(Math.round(settings.density), 2, 36);
    const laneWidth = (this.halfWidth * 2) / columnCount;

    for (let index = 0; index < columnCount; index += 1) {
      const text = settings.textParts[index % settings.textParts.length];
      const textHeight = laneWidth * 0.76 * settings.scale;
      const asset = makeWordAsset(text, settings, textHeight);
      asset.material.depthWrite = false;
      const gap = textHeight * settings.spacing;
      const wordStep = asset.width + gap;
      const normalizedX = columnCount === 1 ? 0 : (index / (columnCount - 1)) * 2 - 1;
      const distanceBase = this.patternDistance * (
        1 + Math.abs(normalizedX) * this.depthStrength * 1.15
      );
      const distance = distanceBase * Math.max(
        0.32,
        1 + signedRandom(settings.seed, index, 30) * settings.variation * 0.24,
      );
      const projectionScale = distance / this.patternDistance;
      const screenX = -this.halfWidth + laneWidth * (index + 0.5);
      const baseX = screenX * projectionScale;
      const span = this.halfHeight * 4.2 * projectionScale;
      const wordCount = clamp(Math.ceil(span / wordStep) + 3, 3, 80);
      const start = -(wordCount * wordStep) / 2 + wordStep / 2;
      const column = new THREE.Group();

      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        const word = new THREE.Mesh(asset.geometry, asset.material);
        const randomIndex = index * 1000 + wordIndex;
        word.position.y = start + wordIndex * wordStep +
          signedRandom(settings.seed, randomIndex, 31) * wordStep * settings.variation * 0.15;
        word.position.x = signedRandom(settings.seed, randomIndex, 32) *
          textHeight * settings.variation * 0.58;
        word.rotation.z = -Math.PI / 2 + signedRandom(settings.seed, randomIndex, 33) *
          settings.variation * 0.38;
        word.scale.setScalar(Math.max(
          0.12,
          1 + signedRandom(settings.seed, randomIndex, 34) * settings.variation * 0.42,
        ));
        column.add(word);
      }

      column.position.set(baseX, 0, -distance);
      column.userData = {
        kind: "column",
        index,
        baseX,
        baseDistance: distance,
        laneWidth: laneWidth * projectionScale,
        wordStep,
        baseOffset: mod(random01(settings.seed, index, 35) * wordStep, wordStep),
        xJitter: signedRandom(settings.seed, index, 36) * settings.variation,
        yJitter: signedRandom(settings.seed, index, 37) * settings.variation,
        rotationJitter: signedRandom(settings.seed, index, 38) * settings.variation,
        scaleJitter: signedRandom(settings.seed, index, 39) * settings.variation,
        phaseJitter: random01(settings.seed, index, 40) * Math.PI * 2,
      };
      this.ringRoot.add(column);
      this.rings.push(column);
      this.resources.push(asset.texture, asset.material, asset.geometry);
    }
  }

  buildGrid(settings) {
    const densityT = clamp((settings.density - 2) / 34, 0, 1);
    const columnCount = clamp(Math.round(lerp(2, 12, densityT)), 2, 12);
    const rowCount = clamp(
      Math.round((columnCount / Math.max(this.halfWidth, 0.4)) * 0.7),
      2,
      24,
    );
    const cellWidth = (this.halfWidth * 2) / columnCount;
    const cellHeight = (this.halfHeight * 2) / rowCount;
    const cellFill = clamp(1 / (1 + settings.spacing * 0.18), 0.28, 1);
    const geometry = new THREE.PlaneGeometry(
      cellWidth * cellFill,
      cellHeight * cellFill * 0.86,
    );
    const variants = settings.textParts.map((text) => {
      const texture = makeLabelTexture(text, settings);
      const material = textMaterial(texture);
      material.depthWrite = false;
      this.resources.push(texture, material);
      return material;
    });
    this.resources.push(geometry);

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const index = rowIndex * columnCount + columnIndex;
        const variantIndex = Math.floor(
          random01(settings.seed, index, 50) * variants.length,
        ) % variants.length;
        const cell = new THREE.Mesh(geometry, variants[variantIndex]);
        const screenX = -this.halfWidth + cellWidth * (columnIndex + 0.5);
        const screenY = this.halfHeight - cellHeight * (rowIndex + 0.5);
        const normalizedX = screenX / Math.max(this.halfWidth, 0.001);
        const normalizedY = screenY / this.halfHeight;
        const radial = Math.min(1, Math.hypot(normalizedX, normalizedY) / Math.SQRT2);
        const distanceBase = this.patternDistance * (1 + radial * this.depthStrength * 1.55);
        const distance = distanceBase * Math.max(
          0.3,
          1 + signedRandom(settings.seed, index, 51) * settings.variation * 0.28,
        );
        const projectionScale = distance / this.patternDistance;
        const baseX = (
          screenX + signedRandom(settings.seed, index, 52) * cellWidth * settings.variation * 0.5
        ) * projectionScale;
        const baseY = (
          screenY + signedRandom(settings.seed, index, 53) * cellHeight * settings.variation * 0.5
        ) * projectionScale;
        const scaleJitter = Math.max(
          0.1,
          1 + signedRandom(settings.seed, index, 54) * settings.variation * 0.48,
        );
        const rotationJitter = signedRandom(settings.seed, index, 55) * settings.variation * 0.6;
        cell.position.set(baseX, baseY, -distance);
        cell.rotation.z = rotationJitter;
        cell.scale.setScalar(scaleJitter);
        cell.userData = {
          kind: "cell",
          index,
          rowIndex,
          columnIndex,
          rowCount,
          columnCount,
          cellWidth,
          cellHeight,
          baseX,
          baseY,
          baseDistance: distance,
          projectionScale,
          scaleJitter,
          rotationJitter,
          phaseJitter: random01(settings.seed, index, 56) * Math.PI * 2,
        };
        this.ringRoot.add(cell);
        this.rings.push(cell);
      }
    }
  }

  render(time, settings, width, height) {
    this.setSize(width, height);
    const designKey = [
      settings.textParts.join("~"),
      settings.compositionType,
      settings.spacing,
      settings.scale,
      settings.depth,
      settings.depthOrigin,
      settings.density,
      settings.variation,
      settings.seed,
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

    if (this.compositionType === "rows") {
      this.renderRows(time, settings);
    } else if (this.compositionType === "columns") {
      this.renderColumns(time, settings);
    } else if (this.compositionType === "grid") {
      this.renderGrid(time, settings);
    } else {
      this.renderTunnel(time, settings);
    }

    this.renderer.render(this.scene, this.camera);
  }

  tunnelDistance(depthIndex) {
    const normalized = clamp(
      depthIndex / Math.max(1, this.ringCount - 0.001),
      0,
      1,
    );
    const curved = Math.pow(normalized, this.tunnelCurve);
    return this.nearDistance * Math.pow(this.tunnelFarRatio, curved);
  }

  renderTunnel(time, settings) {
    const speed = settings.motion * 1.35;
    const amplitude = settings.amplitude;
    const frequency = settings.frequency;

    for (let index = 0; index < this.rings.length; index += 1) {
      const frame = this.rings[index];
      const data = frame.userData;
      let depthIndex = index;
      let modeRotation = 0;
      let modeScale = 1;
      let waveX = 0;
      let waveY = 0;

      if (settings.movementType === "spin") {
        depthIndex = mod(index - time * speed * 0.72, this.ringCount);
        modeRotation = time * speed * 0.42 + depthIndex * 0.055;
      } else if (settings.movementType === "depth") {
        depthIndex = mod(index - time * speed, this.ringCount);
      }

      const phase = time * speed * frequency + index * 0.48 + data.phaseJitter;
      let distance = this.tunnelDistance(depthIndex);

      if (settings.movementType === "pulse") {
        distance *= Math.max(0.16, 1 + Math.sin(phase) * 0.22 * amplitude);
        modeScale = Math.max(0.12, 1 + Math.sin(phase * 0.82) * 0.18 * amplitude);
      } else if (settings.movementType === "wave") {
        distance *= Math.max(0.16, 1 + Math.sin(phase) * 0.16 * amplitude);
        waveX = Math.sin(phase) * this.halfWidth * 0.16 * amplitude;
        waveY = Math.cos(phase * 0.83) * this.halfHeight * 0.12 * amplitude;
        modeRotation = Math.sin(phase * 0.72) * 0.18 * amplitude;
      }

      distance *= Math.max(0.16, 1 + data.depthJitter);
      const projectionScale = distance / this.patternDistance;
      const vanishX = settings.vanishX * this.halfWidth * 0.9;
      const vanishY = settings.vanishY * this.halfHeight * 0.9;
      const jitterX = data.xJitter * this.halfWidth;
      const jitterY = data.yJitter * this.halfHeight;
      const twist = settings.twist * (depthIndex / Math.max(1, this.ringCount)) * 0.72;

      frame.position.set(
        (vanishX + jitterX + waveX) * projectionScale,
        (vanishY + jitterY + waveY) * projectionScale,
        -distance,
      );
      frame.rotation.set(0, 0, twist + data.rotationJitter + modeRotation);
      frame.scale.setScalar(Math.max(0.08, (1 + data.scaleJitter) * modeScale));
    }
  }

  renderRows(time, settings) {
    for (const row of this.rings) {
      const {
        index,
        baseY,
        baseDistance,
        laneHeight,
        wordStep,
        baseOffset,
        xJitter,
        yJitter,
        rotationJitter,
        scaleJitter,
        phaseJitter,
      } = row.userData;
      const direction = index % 2 === 0 ? 1 : -1;
      const speed = settings.motion * 1.45;
      const phase = time * speed * settings.frequency + index * 0.72 + phaseJitter;
      const travel = time * speed * wordStep * 0.44 * direction;
      const loopX = mod(baseOffset - travel, wordStep) - wordStep * 0.5;
      const restingX = mod(baseOffset, wordStep) - wordStep * 0.5;
      const projectionScale = baseDistance / this.patternDistance;
      const vanishX = settings.vanishX * this.halfWidth * 0.9 * projectionScale;
      const vanishY = settings.vanishY * this.halfHeight * 0.9 * projectionScale;
      const randomX = xJitter * this.halfWidth * 0.2 * projectionScale;
      const randomY = yJitter * laneHeight * 0.7;
      const baseRotation = rotationJitter * 0.28 +
        settings.twist * (index / Math.max(1, this.rings.length - 1) - 0.5) * 0.48;
      const baseScale = Math.max(0.12, 1 + scaleJitter * 0.34);

      row.position.set(
        (settings.movementType === "depth" ? loopX : restingX) + vanishX + randomX,
        baseY + vanishY + randomY,
        -baseDistance,
      );
      row.rotation.set(0, 0, baseRotation);
      row.scale.set(baseScale, baseScale, 1);

      if (settings.movementType === "pulse") {
        row.scale.x *= Math.max(0.08, 1 + Math.sin(phase) * 0.34 * settings.amplitude);
        row.scale.y *= Math.max(0.08, 1 + Math.cos(phase * 0.8) * 0.2 * settings.amplitude);
      } else if (settings.movementType === "spin") {
        row.rotation.z += Math.sin(phase * 0.72) *
          (0.15 + this.depthStrength * 0.2) * settings.amplitude;
        row.position.x += Math.cos(phase) * this.halfWidth * 0.18 * settings.amplitude;
      } else if (settings.movementType === "wave") {
        row.position.y += Math.sin(phase) * laneHeight * 0.58 * settings.amplitude;
        row.position.x = loopX + vanishX + randomX +
          Math.cos(phase * 0.68) * this.halfWidth * 0.14 * settings.amplitude;
        row.rotation.z += Math.sin(phase * 0.58) * 0.1 * settings.amplitude;
      }
    }
  }

  renderColumns(time, settings) {
    for (const column of this.rings) {
      const {
        index,
        baseX,
        baseDistance,
        laneWidth,
        wordStep,
        baseOffset,
        xJitter,
        yJitter,
        rotationJitter,
        scaleJitter,
        phaseJitter,
      } = column.userData;
      const direction = index % 2 === 0 ? 1 : -1;
      const speed = settings.motion * 1.45;
      const phase = time * speed * settings.frequency + index * 0.77 + phaseJitter;
      const travel = time * speed * wordStep * 0.42 * direction;
      const loopY = mod(baseOffset + travel, wordStep) - wordStep * 0.5;
      const restingY = mod(baseOffset, wordStep) - wordStep * 0.5;
      const projectionScale = baseDistance / this.patternDistance;
      const vanishX = settings.vanishX * this.halfWidth * 0.9 * projectionScale;
      const vanishY = settings.vanishY * this.halfHeight * 0.9 * projectionScale;
      const randomX = xJitter * laneWidth * 0.7;
      const randomY = yJitter * this.halfHeight * 0.2 * projectionScale;
      const baseRotation = rotationJitter * 0.28 +
        settings.twist * (index / Math.max(1, this.rings.length - 1) - 0.5) * 0.48;
      const baseScale = Math.max(0.12, 1 + scaleJitter * 0.34);

      column.position.set(
        baseX + vanishX + randomX,
        (settings.movementType === "depth" ? loopY : restingY) + vanishY + randomY,
        -baseDistance,
      );
      column.rotation.set(0, 0, baseRotation);
      column.scale.set(baseScale, baseScale, 1);

      if (settings.movementType === "pulse") {
        column.scale.x *= Math.max(0.08, 1 + Math.sin(phase) * 0.36 * settings.amplitude);
        column.scale.y *= Math.max(0.08, 1 + Math.cos(phase * 0.74) * 0.2 * settings.amplitude);
      } else if (settings.movementType === "spin") {
        column.rotation.z += Math.sin(phase * 0.66) *
          (0.16 + this.depthStrength * 0.2) * settings.amplitude;
        column.position.y += Math.cos(phase) * this.halfHeight * 0.17 * settings.amplitude;
      } else if (settings.movementType === "wave") {
        column.position.x += Math.sin(phase) * laneWidth * 0.62 * settings.amplitude;
        column.position.y = loopY + vanishY + randomY +
          Math.cos(phase * 0.62) * this.halfHeight * 0.14 * settings.amplitude;
        column.rotation.z += Math.sin(phase * 0.53) * 0.11 * settings.amplitude;
      }
    }
  }

  renderGrid(time, settings) {
    for (const cell of this.rings) {
      const {
        index,
        rowIndex,
        columnIndex,
        rowCount,
        columnCount,
        cellWidth,
        cellHeight,
        baseX,
        baseY,
        baseDistance,
        projectionScale,
        scaleJitter,
        rotationJitter,
        phaseJitter,
      } = cell.userData;
      const speed = settings.motion * 1.45;
      const phase = time * speed * settings.frequency +
        rowIndex * 0.58 + columnIndex * 0.71 + phaseJitter;
      const vanishX = settings.vanishX * this.halfWidth * 0.9 * projectionScale;
      const vanishY = settings.vanishY * this.halfHeight * 0.9 * projectionScale;
      const twist = settings.twist *
        (index / Math.max(1, this.rings.length - 1) - 0.5) * 0.62;

      cell.position.set(baseX + vanishX, baseY + vanishY, -baseDistance);
      cell.rotation.set(0, 0, rotationJitter + twist);
      cell.scale.setScalar(scaleJitter);

      if (settings.movementType === "pulse") {
        const pulse = Math.max(0.08, 1 + Math.sin(phase) * 0.38 * settings.amplitude);
        cell.scale.multiplyScalar(pulse);
        cell.position.z = -baseDistance * Math.max(
          0.16,
          1 + Math.sin(phase) * 0.14 * settings.amplitude,
        );
      } else if (settings.movementType === "spin") {
        const direction = (rowIndex + columnIndex) % 2 === 0 ? 1 : -1;
        cell.rotation.z += time * speed * 0.48 * direction * settings.amplitude;
        cell.scale.multiplyScalar(Math.max(
          0.08,
          1 + Math.sin(phase * 0.7) * 0.2 * settings.amplitude,
        ));
      } else if (settings.movementType === "wave") {
        cell.position.x += Math.sin(phase * 0.84) *
          cellWidth * projectionScale * 0.5 * settings.amplitude;
        cell.position.y += Math.cos(phase) *
          cellHeight * projectionScale * 0.65 * settings.amplitude;
        cell.rotation.z += Math.sin(phase * 0.62) * 0.22 * settings.amplitude;
        cell.position.z = -baseDistance * Math.max(
          0.16,
          1 + Math.sin(phase) * 0.16 * settings.amplitude,
        );
      } else {
        const xTrack = columnCount * cellWidth * projectionScale;
        const yTrack = rowCount * cellHeight * projectionScale;
        const xStart = (-this.halfWidth + cellWidth * 0.5) * projectionScale;
        const yStart = (this.halfHeight - cellHeight * 0.5) * projectionScale;
        const xTravel = time * speed * cellWidth * projectionScale * 0.68;
        const yTravel = time * speed * cellHeight * projectionScale * 0.42;
        cell.position.x = vanishX + xStart + mod(
          columnIndex * cellWidth * projectionScale + xTravel,
          xTrack,
        );
        cell.position.y = vanishY + yStart - mod(
          rowIndex * cellHeight * projectionScale + yTravel,
          yTrack,
        );
      }
    }
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

let downloadUrl = "";

async function supportedAvcConfig(settings) {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new Error(
      "Este navegador no soporta exportacion MP4. Usa Chrome o Safari actualizado.",
    );
  }

  const baseConfig = {
    width: settings.width,
    height: settings.height,
    bitrate: Math.max(
      4_000_000,
      Math.round(settings.width * settings.height * settings.fps * 0.16),
    ),
    framerate: settings.fps,
    avc: { format: "avc" },
  };

  for (const codec of ["avc1.640028", "avc1.4d4028", "avc1.420028"]) {
    const support = await VideoEncoder.isConfigSupported({ ...baseConfig, codec });
    if (support.supported) return support.config;
  }

  throw new Error("Este equipo no tiene un codificador H.264 disponible.");
}

function exportFilename(settings) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `sale-bg-${settings.width}x${settings.height}-${stamp}.mp4`;
}

async function exportMp4() {
  const settings = settingsNow();
  const frameCount = settings.duration * settings.fps;
  const exportCanvas = document.createElement("canvas");
  const exportTunnel = new TunnelRenderer(exportCanvas);

  exportBtn.disabled = true;
  downloadLink.hidden = true;
  statusEl.textContent = "Preparando export...";

  try {
    const encoderConfig = await supportedAvcConfig(settings);
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: {
        codec: "avc",
        width: settings.width,
        height: settings.height,
        frameRate: settings.fps,
      },
      fastStart: "in-memory",
    });
    let encoderError = null;
    const encoder = new VideoEncoder({
      output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
      error: (error) => {
        encoderError = error;
      },
    });
    encoder.configure(encoderConfig);
    const frameDuration = Math.round(1_000_000 / settings.fps);

    for (let index = 0; index < frameCount; index += 1) {
      exportTunnel.render(index / settings.fps, settings, settings.width, settings.height);
      const frame = new VideoFrame(exportCanvas, {
        timestamp: index * frameDuration,
        duration: frameDuration,
      });
      encoder.encode(frame, { keyFrame: index % (settings.fps * 2) === 0 });
      frame.close();

      while (encoder.encodeQueueSize > 4) {
        if (encoderError) throw encoderError;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const progress = Math.round(((index + 1) / frameCount) * 100);
      statusEl.textContent = `Renderizando frames: ${progress}%`;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    statusEl.textContent = "Codificando MP4...";
    await encoder.flush();
    if (encoderError) throw encoderError;
    encoder.close();
    muxer.finalize();

    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    const file = exportFilename(settings);
    downloadUrl = URL.createObjectURL(new Blob([target.buffer], { type: "video/mp4" }));
    downloadLink.href = downloadUrl;
    downloadLink.download = file;
    downloadLink.textContent = "Descargar MP4";
    downloadLink.hidden = false;
    statusEl.textContent = `Export listo: ${file}`;
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

compositionInputs.forEach((input) => {
  input.addEventListener("change", syncUi);
});

randomBtn.addEventListener("click", randomizeSelectedComposition);
exportBtn.addEventListener("click", exportMp4);
syncUi();
requestAnimationFrame(drawPreview);

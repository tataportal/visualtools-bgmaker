import * as THREE from "./node_modules/three/build/three.module.js";
import { mergeGeometries } from "./node_modules/three/examples/jsm/utils/BufferGeometryUtils.js";

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
  outputs.angle.value = String(settings.angle);
  outputs.duration.value = `${settings.duration}s`;
  const gradientEnabled = settings.bgMode === "gradient";
  colorBField.hidden = !gradientEnabled;
  angleField.hidden = !gradientEnabled;
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
    const depthT = clamp(settings.depth, 0, 1);
    const spacingT = clamp((settings.spacing - 0.15) / 2.85, 0, 1);
    const fov = lerp(38, 82, depthT);
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
      this.buildRows(settings, spacingT);
    } else if (settings.compositionType === "columns") {
      this.buildColumns(settings, spacingT);
    } else if (settings.compositionType === "grid") {
      this.buildGrid(settings, spacingT);
    } else {
      this.buildTunnel(settings, aspect, tangent, depthT, spacingT);
    }
  }

  buildTunnel(settings, aspect, tangent, depthT, spacingT) {
    const halfHeight = this.halfHeight;
    const halfWidth = this.halfWidth;
    const shortAxisScale = Math.min(1, aspect);
    const frameWidth = halfWidth * 2.08;
    const frameHeight = halfHeight * 2.08;
    const nearDistance = halfHeight / (tangent * 1.08);
    const farRatio = lerp(4.5, 7.2, depthT);
    const depthStep = clamp(
      lerp(1.12, 1.52, depthT) * lerp(0.97, 1.06, spacingT),
      1.085,
      1.68,
    );
    const textHeight = 0.205 * shortAxisScale * settings.scale;
    const ringCount = clamp(
      Math.floor(Math.log(farRatio) / Math.log(depthStep)) + 1,
      6,
      12,
    );

    this.nearDistance = nearDistance;
    this.depthStep = depthStep;
    this.ringCount = ringCount;

    const asset = makeWordAsset(settings.text, settings, textHeight);
    asset.material.depthWrite = true;
    const wordGap = textHeight * lerp(0.08, 2.7, spacingT);
    const cornerGap = textHeight * lerp(0.5, 2.4, spacingT);
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
      this.ringRoot.add(frame);
      this.rings.push(frame);
    }

  }

  buildRows(settings, spacingT) {
    const rowCount = clamp(Math.round(lerp(15, 4, spacingT)), 4, 15);
    const laneHeight = (this.halfHeight * 2) / rowCount;

    for (let index = 0; index < rowCount; index += 1) {
      const text = settings.textParts[index % settings.textParts.length];
      const textHeight = laneHeight * 0.74 * settings.scale;
      const asset = makeWordAsset(text, settings, textHeight);
      asset.material.depthWrite = false;
      const gap = textHeight * lerp(0.08, 3.2, spacingT);
      const wordStep = asset.width + gap;
      const normalizedY = rowCount === 1 ? 0 : (index / (rowCount - 1)) * 2 - 1;
      const distance = this.patternDistance * (
        1 + Math.abs(normalizedY) * this.depthStrength * 1.15
      );
      const projectionScale = distance / this.patternDistance;
      const screenY = this.halfHeight - laneHeight * (index + 0.5);
      const baseY = screenY * projectionScale;
      const span = this.halfWidth * 4.2 * projectionScale;
      const wordCount = Math.ceil(span / wordStep) + 3;
      const start = -(wordCount * wordStep) / 2 + wordStep / 2;
      const row = new THREE.Group();

      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        const word = new THREE.Mesh(asset.geometry, asset.material);
        word.position.x = start + wordIndex * wordStep;
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
        baseOffset: mod(index * wordStep * 0.37, wordStep),
      };
      this.ringRoot.add(row);
      this.rings.push(row);
      this.resources.push(asset.texture, asset.material, asset.geometry);
    }
  }

  buildColumns(settings, spacingT) {
    const columnCount = clamp(Math.round(lerp(12, 3, spacingT)), 3, 12);
    const laneWidth = (this.halfWidth * 2) / columnCount;

    for (let index = 0; index < columnCount; index += 1) {
      const text = settings.textParts[index % settings.textParts.length];
      const textHeight = laneWidth * 0.76 * settings.scale;
      const asset = makeWordAsset(text, settings, textHeight);
      asset.material.depthWrite = false;
      const gap = textHeight * lerp(0.08, 3.2, spacingT);
      const wordStep = asset.width + gap;
      const normalizedX = columnCount === 1 ? 0 : (index / (columnCount - 1)) * 2 - 1;
      const distance = this.patternDistance * (
        1 + Math.abs(normalizedX) * this.depthStrength * 1.15
      );
      const projectionScale = distance / this.patternDistance;
      const screenX = -this.halfWidth + laneWidth * (index + 0.5);
      const baseX = screenX * projectionScale;
      const span = this.halfHeight * 4.2 * projectionScale;
      const wordCount = Math.ceil(span / wordStep) + 3;
      const start = -(wordCount * wordStep) / 2 + wordStep / 2;
      const column = new THREE.Group();

      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        const word = new THREE.Mesh(asset.geometry, asset.material);
        word.position.y = start + wordIndex * wordStep;
        word.rotation.z = -Math.PI / 2;
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
        baseOffset: mod(index * wordStep * 0.41, wordStep),
      };
      this.ringRoot.add(column);
      this.rings.push(column);
      this.resources.push(asset.texture, asset.material, asset.geometry);
    }
  }

  buildGrid(settings, spacingT) {
    const columnCount = clamp(Math.round(lerp(9, 3, spacingT)), 3, 9);
    const rowCount = clamp(
      Math.round((columnCount / Math.max(this.halfWidth, 0.4)) * 0.7),
      3,
      12,
    );
    const cellWidth = (this.halfWidth * 2) / columnCount;
    const cellHeight = (this.halfHeight * 2) / rowCount;
    const cellFill = lerp(0.96, 0.5, spacingT);
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
        const cell = new THREE.Mesh(geometry, variants[index % variants.length]);
        const screenX = -this.halfWidth + cellWidth * (columnIndex + 0.5);
        const screenY = this.halfHeight - cellHeight * (rowIndex + 0.5);
        const normalizedX = screenX / Math.max(this.halfWidth, 0.001);
        const normalizedY = screenY / this.halfHeight;
        const radial = Math.min(1, Math.hypot(normalizedX, normalizedY) / Math.SQRT2);
        const distance = this.patternDistance * (1 + radial * this.depthStrength * 1.05);
        const projectionScale = distance / this.patternDistance;
        const baseX = screenX * projectionScale;
        const baseY = screenY * projectionScale;
        cell.position.set(baseX, baseY, -distance);
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

  renderTunnel(time, settings) {
    const speed = settings.motion * 1.8;

    for (let index = 0; index < this.rings.length; index += 1) {
      const frame = this.rings[index];
      let distance;

      frame.position.set(0, 0, 0);
      frame.rotation.set(0, 0, 0);
      frame.scale.setScalar(1);

      if (settings.movementType === "pulse") {
        const baseDistance = this.nearDistance * this.depthStep ** index;
        const phase = time * speed * 1.35 + index * 0.42;
        distance = baseDistance * (1 + Math.sin(phase) * 0.13);
        frame.scale.setScalar(1 + Math.sin(phase * 0.82) * 0.055);
      } else if (settings.movementType === "spin") {
        const progress = time * speed * 0.46;
        const depthIndex = mod(index - progress, this.ringCount);
        distance = this.nearDistance * this.depthStep ** depthIndex;
        frame.rotation.z = time * speed * 0.34 + index * 0.055;
      } else if (settings.movementType === "wave") {
        const baseDistance = this.nearDistance * this.depthStep ** index;
        const phase = time * speed * 1.15 + index * 0.55;
        distance = baseDistance * (1 + Math.sin(phase) * 0.09);
        frame.position.x = Math.sin(phase) * this.halfWidth * 0.1;
        frame.position.y = Math.cos(phase * 0.83) * this.halfHeight * 0.075;
        frame.rotation.z = Math.sin(phase * 0.72) * 0.1;
      } else {
        const progress = time * speed * 0.78;
        const depthIndex = mod(index - progress, this.ringCount);
        distance = this.nearDistance * this.depthStep ** depthIndex;
      }

      frame.position.z = -distance;
    }
  }

  renderRows(time, settings) {
    for (const row of this.rings) {
      const { index, baseY, baseDistance, laneHeight, wordStep, baseOffset } = row.userData;
      const direction = index % 2 === 0 ? 1 : -1;
      const speed = settings.motion * 2;
      const phase = time * speed * 1.15 + index * 0.72;
      const travel = time * speed * wordStep * 0.44 * direction;
      const loopX = mod(baseOffset - travel, wordStep) - wordStep * 0.5;
      const restingX = mod(baseOffset, wordStep) - wordStep * 0.5;

      row.position.set(settings.movementType === "depth" ? loopX : restingX, baseY, -baseDistance);
      row.rotation.set(0, 0, 0);
      row.scale.set(1, 1, 1);

      if (settings.movementType === "pulse") {
        row.scale.x = 0.78 + (Math.sin(phase) + 1) * 0.16;
        row.scale.y = 0.86 + (Math.cos(phase * 0.8) + 1) * 0.09;
      } else if (settings.movementType === "spin") {
        row.rotation.z = Math.sin(phase * 0.72) * (0.09 + this.depthStrength * 0.13);
        row.position.x = restingX + Math.cos(phase) * this.halfWidth * 0.12;
      } else if (settings.movementType === "wave") {
        row.position.y = baseY + Math.sin(phase) * laneHeight * 0.34;
        row.position.x = loopX + Math.cos(phase * 0.68) * this.halfWidth * 0.09;
        row.rotation.z = Math.sin(phase * 0.58) * 0.065;
      }
    }
  }

  renderColumns(time, settings) {
    for (const column of this.rings) {
      const { index, baseX, baseDistance, laneWidth, wordStep, baseOffset } = column.userData;
      const direction = index % 2 === 0 ? 1 : -1;
      const speed = settings.motion * 2;
      const phase = time * speed * 1.12 + index * 0.77;
      const travel = time * speed * wordStep * 0.42 * direction;
      const loopY = mod(baseOffset + travel, wordStep) - wordStep * 0.5;
      const restingY = mod(baseOffset, wordStep) - wordStep * 0.5;

      column.position.set(baseX, settings.movementType === "depth" ? loopY : restingY, -baseDistance);
      column.rotation.set(0, 0, 0);
      column.scale.set(1, 1, 1);

      if (settings.movementType === "pulse") {
        column.scale.x = 0.76 + (Math.sin(phase) + 1) * 0.18;
        column.scale.y = 0.86 + (Math.cos(phase * 0.74) + 1) * 0.09;
      } else if (settings.movementType === "spin") {
        column.rotation.z = Math.sin(phase * 0.66) * (0.1 + this.depthStrength * 0.12);
        column.position.y = restingY + Math.cos(phase) * this.halfHeight * 0.11;
      } else if (settings.movementType === "wave") {
        column.position.x = baseX + Math.sin(phase) * laneWidth * 0.36;
        column.position.y = loopY + Math.cos(phase * 0.62) * this.halfHeight * 0.09;
        column.rotation.z = Math.sin(phase * 0.53) * 0.075;
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
      } = cell.userData;
      const speed = settings.motion * 2;
      const phase = time * speed * 1.2 + rowIndex * 0.58 + columnIndex * 0.71;

      cell.position.set(baseX, baseY, -baseDistance);
      cell.rotation.set(0, 0, 0);
      cell.scale.set(1, 1, 1);

      if (settings.movementType === "pulse") {
        const pulse = 0.78 + (Math.sin(phase) + 1) * 0.16;
        cell.scale.setScalar(pulse);
        cell.position.z = -baseDistance * (1 + Math.sin(phase) * 0.075);
      } else if (settings.movementType === "spin") {
        const direction = (rowIndex + columnIndex) % 2 === 0 ? 1 : -1;
        cell.rotation.z = time * speed * 0.48 * direction + index * 0.025;
        cell.scale.setScalar(0.88 + Math.sin(phase * 0.7) * 0.08);
      } else if (settings.movementType === "wave") {
        cell.position.x = baseX + Math.sin(phase * 0.84) * cellWidth * projectionScale * 0.28;
        cell.position.y = baseY + Math.cos(phase) * cellHeight * projectionScale * 0.38;
        cell.rotation.z = Math.sin(phase * 0.62) * 0.12;
        cell.position.z = -baseDistance * (1 + Math.sin(phase) * 0.08);
      } else {
        const xTrack = columnCount * cellWidth * projectionScale;
        const yTrack = rowCount * cellHeight * projectionScale;
        const xStart = (-this.halfWidth + cellWidth * 0.5) * projectionScale;
        const yStart = (this.halfHeight - cellHeight * 0.5) * projectionScale;
        const xTravel = time * speed * cellWidth * projectionScale * 0.52;
        const yTravel = time * speed * cellHeight * projectionScale * 0.31;
        cell.position.x = xStart + mod(
          columnIndex * cellWidth * projectionScale + xTravel,
          xTrack,
        );
        cell.position.y = yStart - mod(
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

compositionInputs.forEach((input) => {
  input.addEventListener("change", syncUi);
});

exportBtn.addEventListener("click", exportMp4);
syncUi();
requestAnimationFrame(drawPreview);

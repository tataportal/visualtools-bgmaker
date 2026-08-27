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

function makeStripTexture(text, settings, axis) {
  const canvas = document.createElement("canvas");
  const horizontal = axis === "horizontal";
  canvas.width = horizontal ? 2048 : 512;
  canvas.height = horizontal ? 320 : 2048;

  const crossSize = horizontal ? canvas.height : canvas.width;
  const fontSize = clamp(crossSize * 0.58 * settings.scale, 42, crossSize * 0.88);
  const gap = fontSize * (0.25 + settings.spacing * 0.48);
  let context = canvas.getContext("2d");

  context.font = `${fontSize}px Didot, "Bodoni 72", Georgia, serif`;
  const wordWidth = context.measureText(text).width;
  const step = Math.max(fontSize * 1.2, wordWidth + gap);
  const longSize = horizontal ? canvas.width : canvas.height;
  const slotCount = Math.max(2, Math.round(longSize / step));

  if (horizontal) canvas.width = Math.max(256, Math.round(slotCount * step));
  else canvas.height = Math.max(256, Math.round(slotCount * step));

  context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = settings.textColor;
  context.font = `${fontSize}px Didot, "Bodoni 72", Georgia, serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  if (horizontal) {
    for (let index = 0; index < slotCount; index += 1) {
      context.fillText(text, step * (index + 0.5), canvas.height / 2);
    }
  } else {
    for (let index = 0; index < slotCount; index += 1) {
      context.save();
      context.translate(canvas.width / 2, step * (index + 0.5));
      context.rotate(-Math.PI / 2);
      context.fillText(text, 0, 0);
      context.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
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

    this.nearDistance = nearDistance;
    this.depthStep = depthStep;
    this.ringCount = ringCount;

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

  buildRows(settings, spacingT) {
    const rowCount = clamp(Math.round(lerp(12, 5, spacingT)), 5, 12);
    const laneHeight = (this.halfHeight * 2) / rowCount;
    const geometry = new THREE.PlaneGeometry(this.halfWidth * 3.1, laneHeight * 0.94);
    this.resources.push(geometry);

    for (let index = 0; index < rowCount; index += 1) {
      const text = settings.textParts[index % settings.textParts.length];
      const texture = makeStripTexture(text, settings, "horizontal");
      texture.repeat.set(1.65, 1);
      const material = textMaterial(texture);
      material.depthWrite = false;
      const row = new THREE.Mesh(geometry, material);
      const baseY = this.halfHeight - laneHeight * (index + 0.5);
      row.position.set(0, baseY, -this.patternDistance);
      row.userData = {
        kind: "row",
        index,
        baseY,
        laneHeight,
        texture,
        baseOffset: mod(index * 0.137, 1),
      };
      texture.offset.x = row.userData.baseOffset;
      this.ringRoot.add(row);
      this.rings.push(row);
      this.resources.push(texture, material);
    }
  }

  buildColumns(settings, spacingT) {
    const columnCount = clamp(Math.round(lerp(10, 4, spacingT)), 4, 10);
    const laneWidth = (this.halfWidth * 2) / columnCount;
    const geometry = new THREE.PlaneGeometry(laneWidth * 0.92, this.halfHeight * 3.1);
    this.resources.push(geometry);

    for (let index = 0; index < columnCount; index += 1) {
      const text = settings.textParts[index % settings.textParts.length];
      const texture = makeStripTexture(text, settings, "vertical");
      texture.repeat.set(1, 1.65);
      const material = textMaterial(texture);
      material.depthWrite = false;
      const column = new THREE.Mesh(geometry, material);
      const baseX = -this.halfWidth + laneWidth * (index + 0.5);
      column.position.set(baseX, 0, -this.patternDistance);
      column.userData = {
        kind: "column",
        index,
        baseX,
        laneWidth,
        texture,
        baseOffset: mod(index * 0.163, 1),
      };
      texture.offset.y = column.userData.baseOffset;
      this.ringRoot.add(column);
      this.rings.push(column);
      this.resources.push(texture, material);
    }
  }

  buildGrid(settings, spacingT) {
    const columnCount = clamp(Math.round(lerp(7, 3, spacingT)), 3, 7);
    const rowCount = clamp(
      Math.round((columnCount / Math.max(this.halfWidth, 0.4)) * 0.7),
      3,
      12,
    );
    const cellWidth = (this.halfWidth * 2) / columnCount;
    const cellHeight = (this.halfHeight * 2) / rowCount;
    const geometry = new THREE.PlaneGeometry(cellWidth * 0.94, cellHeight * 0.78);
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
        const baseX = -this.halfWidth + cellWidth * (columnIndex + 0.5);
        const baseY = this.halfHeight - cellHeight * (rowIndex + 0.5);
        cell.position.set(baseX, baseY, -this.patternDistance);
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
  }

  renderRows(time, settings) {
    for (const row of this.rings) {
      const { index, baseY, laneHeight, texture, baseOffset } = row.userData;
      const direction = index % 2 === 0 ? 1 : -1;
      const phase = time * settings.motion * 1.35 + index * 0.72;
      const travel = time * settings.motion * 0.075 * direction;

      row.position.set(0, baseY, -this.patternDistance);
      row.rotation.set(0, 0, 0);
      row.scale.set(1, 1, 1);
      texture.offset.x = mod(baseOffset - travel, 1);

      if (settings.movementType === "pulse") {
        row.scale.x = 0.88 + Math.sin(phase) * 0.12;
        row.scale.y = 0.92 + Math.cos(phase * 0.8) * 0.08;
      } else if (settings.movementType === "spin") {
        row.rotation.z = Math.sin(phase * 0.72) * (0.06 + this.depthStrength * 0.08);
        row.position.x = Math.cos(phase) * this.halfWidth * 0.08;
      } else if (settings.movementType === "wave") {
        row.position.y = baseY + Math.sin(phase) * laneHeight * 0.34;
        row.position.x = Math.cos(phase * 0.68) * this.halfWidth * 0.065;
        row.rotation.z = Math.sin(phase * 0.58) * 0.045;
      }
    }
  }

  renderColumns(time, settings) {
    for (const column of this.rings) {
      const { index, baseX, laneWidth, texture, baseOffset } = column.userData;
      const direction = index % 2 === 0 ? 1 : -1;
      const phase = time * settings.motion * 1.28 + index * 0.77;
      const travel = time * settings.motion * 0.07 * direction;

      column.position.set(baseX, 0, -this.patternDistance);
      column.rotation.set(0, 0, 0);
      column.scale.set(1, 1, 1);
      texture.offset.y = mod(baseOffset + travel, 1);

      if (settings.movementType === "pulse") {
        column.scale.x = 0.84 + Math.sin(phase) * 0.16;
        column.scale.y = 0.94 + Math.cos(phase * 0.74) * 0.06;
      } else if (settings.movementType === "spin") {
        column.rotation.z = Math.sin(phase * 0.66) * (0.07 + this.depthStrength * 0.07);
        column.position.y = Math.cos(phase) * this.halfHeight * 0.07;
      } else if (settings.movementType === "wave") {
        column.position.x = baseX + Math.sin(phase) * laneWidth * 0.36;
        column.position.y = Math.cos(phase * 0.62) * this.halfHeight * 0.065;
        column.rotation.z = Math.sin(phase * 0.53) * 0.052;
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
      } = cell.userData;
      const phase = time * settings.motion * 1.42 + rowIndex * 0.58 + columnIndex * 0.71;

      cell.position.set(baseX, baseY, -this.patternDistance);
      cell.rotation.set(0, 0, 0);
      cell.scale.set(1, 1, 1);

      if (settings.movementType === "pulse") {
        const pulse = 0.78 + (Math.sin(phase) + 1) * 0.16;
        cell.scale.setScalar(pulse);
        cell.position.z = -this.patternDistance * (1 + Math.sin(phase) * 0.035);
      } else if (settings.movementType === "spin") {
        const direction = (rowIndex + columnIndex) % 2 === 0 ? 1 : -1;
        cell.rotation.z = time * settings.motion * 0.48 * direction + index * 0.025;
        cell.scale.setScalar(0.88 + Math.sin(phase * 0.7) * 0.08);
      } else if (settings.movementType === "wave") {
        cell.position.x = baseX + Math.sin(phase * 0.84) * cellWidth * 0.24;
        cell.position.y = baseY + Math.cos(phase) * cellHeight * 0.34;
        cell.rotation.z = Math.sin(phase * 0.62) * 0.12;
        cell.position.z = -this.patternDistance * (1 + Math.sin(phase) * 0.045);
      } else {
        const xTrack = columnCount * cellWidth;
        const yTrack = rowCount * cellHeight;
        const xStart = -this.halfWidth + cellWidth * 0.5;
        const yStart = this.halfHeight - cellHeight * 0.5;
        const xTravel = time * settings.motion * cellWidth * 0.48;
        const yTravel = time * settings.motion * cellHeight * 0.26;
        cell.position.x = xStart + mod(columnIndex * cellWidth + xTravel, xTrack);
        cell.position.y = yStart - mod(rowIndex * cellHeight + yTravel, yTrack);
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

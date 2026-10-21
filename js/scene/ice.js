// A sheet of ice on the ground while a wheel slips (lesson 6, free driving
// with "right wheel slips"): laid out ahead of the chariot along its way,
// glassy and pale, so the sky and the sun glint off it and the ground reads
// as slippery. It stays where it was laid; when the chariot drives off it,
// it fades away and is laid again ahead of it.

import * as THREE from "three";

/** The sheet: how long (along the way the chariot faces when it is laid), how wide, and how far it starts behind the chariot. */
const LEN = 76, WIDTH = 18, BACK = 9;
/** fades in or out in about this many seconds */
const FADE = 0.6;
const OPACITY = 0.9;

/** Small seeded random numbers, so the sheet looks the same every time. @param {number} seed */
function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * Where the sheet is (alpha: a hard, broken edge, as a sheet of ice has, the
 * same all over inside it) and its surface (pale blue-white with a bright
 * rim where the ice is thick at its edge, long sheen streaks the light
 * catches, frost along the way the wheels go and fine white cracks). Long
 * side along the canvas height.
 */
function iceTextures() {
  const w = 128, h = 512, r = rand(7);
  // the outline: jagged long sides and ends, a little in from the canvas edge
  /** @type {[number, number][]} */
  const edge = [];
  const side = (/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x1, /** @type {number} */ y1, /** @type {number} */ n, /** @type {number} */ jag) => {
    for (let i = 0; i < n; i++) {
      const t = i / n, nx = y1 - y0, ny = x0 - x1, l = Math.hypot(nx, ny);
      const o = (r() - 0.35) * jag;
      edge.push([x0 + (x1 - x0) * t + (nx / l) * o, y0 + (y1 - y0) * t + (ny / l) * o]);
    }
  };
  const m = 12;
  side(m, m, w - m, m, 5, 9);
  side(w - m, m, w - m, h - m, 26, 14);
  side(w - m, h - m, m, h - m, 5, 9);
  side(m, h - m, m, m, 26, 14);
  const trace = (/** @type {CanvasRenderingContext2D} */ g) => {
    g.beginPath();
    g.moveTo(...edge[0]);
    for (const p of edge.slice(1)) g.lineTo(...p);
    g.closePath();
  };
  const a = document.createElement("canvas");
  a.width = w;
  a.height = h;
  const ga = /** @type {CanvasRenderingContext2D} */ (a.getContext("2d"));
  ga.fillStyle = "#000";
  ga.fillRect(0, 0, w, h);
  trace(ga);
  ga.fillStyle = "#d8d8d8";
  ga.fill();
  // the rim is thicker, so less see-through
  ga.strokeStyle = "#fff";
  ga.lineWidth = 3;
  ga.stroke();
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const gc = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  gc.fillStyle = "#a9cfe6";
  gc.fillRect(0, 0, w, h);
  // sheen: long soft bands across the sheet, the way a light glides on ice
  for (let i = 0; i < 7; i++) {
    const y = r() * h, tilt = 40 + r() * 50, wide = 6 + r() * 16;
    const g = gc.createLinearGradient(0, y, 0, y + wide);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${0.35 + r() * 0.3})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    gc.fillStyle = g;
    gc.save();
    gc.transform(1, 0, -tilt / w, 1, 0, 0);
    gc.fillRect(0, y, w * 2, wide);
    gc.restore();
  }
  // frost: faint streaks along the way the wheels go
  for (let i = 0; i < 120; i++) {
    gc.strokeStyle = `rgba(255,255,255,${0.06 + r() * 0.18})`;
    gc.lineWidth = 0.5 + r() * 1.5;
    const x = r() * w, y = r() * h, len = 10 + r() * 60;
    gc.beginPath();
    gc.moveTo(x, y);
    gc.lineTo(x + (r() - 0.5) * 8, y + len);
    gc.stroke();
  }
  // fine cracks, sharp and branching
  gc.strokeStyle = "rgba(255,255,255,0.8)";
  gc.lineWidth = 0.7;
  for (let i = 0; i < 12; i++) {
    let x = m + r() * (w - 2 * m), y = m + r() * (h - 2 * m);
    gc.beginPath();
    gc.moveTo(x, y);
    // a crack runs on roughly one way, with short side branches
    const dir = r() * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      const t = dir + (r() - 0.5) * 0.9, l = 6 + r() * 12;
      x += Math.cos(t) * l;
      y += Math.sin(t) * l;
      gc.lineTo(x, y);
      if (r() < 0.3) {
        gc.lineTo(x + (r() - 0.5) * 10, y + (r() - 0.5) * 10);
        gc.moveTo(x, y);
      }
    }
    gc.stroke();
  }
  // the rim: white where the ice is thick and catches the light
  trace(gc);
  gc.strokeStyle = "rgba(255,255,255,0.95)";
  gc.lineWidth = 4;
  gc.stroke();
  gc.strokeStyle = "rgba(255,255,255,0.35)";
  gc.lineWidth = 10;
  gc.stroke();
  const alpha = new THREE.CanvasTexture(a);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = alpha.anisotropy = 4;
  return { alpha, map };
}

export class Ice {
  constructor() {
    const { alpha, map } = iceTextures();
    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map, alphaMap: alpha, transparent: true, opacity: 0,
      roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, envMapIntensity: 1.6,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    const geo = new THREE.PlaneGeometry(WIDTH, LEN);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = 0.01;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.on = false;
    /** laid down at: where the chariot was and the way it faced (world), or null */
    /** @type {{x: number, z: number, dx: number, dz: number} | null} */
    this.at = null;
    /** 0..1 */
    this.shown = 0;
    /** fading away to be laid again ahead */
    this.melting = false;
  }

  /** @param {boolean} on */
  set(on) {
    this.on = on;
  }

  /**
   * @param {number} dt
   * @param {{x: number, z: number, heading: number}} f the chariot (world x, z; sim heading)
   */
  update(dt, f) {
    if (this.on && !this.at) this.#lay(f);
    if (this.on && this.at && !this.melting) {
      // driven off it? (a little short of its ends and sides)
      const px = f.x - this.at.x, pz = f.z - this.at.z;
      const along = px * this.at.dx + pz * this.at.dz, across = px * -this.at.dz + pz * this.at.dx;
      this.melting = along < -BACK + 3 || along > LEN - BACK - 6 || Math.abs(across) > WIDTH / 2 - 3;
    }
    const want = this.on && !this.melting ? 1 : 0;
    this.shown = dt > 0 ? THREE.MathUtils.clamp(this.shown + Math.sign(want - this.shown) * (dt / FADE), 0, 1) : want;
    if (this.shown === 0) {
      // gone: lay it again ahead of the chariot (next frame), or not at all
      this.melting = false;
      this.at = null;
    }
    this.mat.opacity = OPACITY * this.shown * this.shown * (3 - 2 * this.shown);
    this.mesh.visible = this.shown > 0;
  }

  /** Ahead of the chariot, the way it faces. @param {{x: number, z: number, heading: number}} f */
  #lay(f) {
    const dx = Math.cos(f.heading), dz = -Math.sin(f.heading);
    this.at = { x: f.x, z: f.z, dx, dz };
    const mid = LEN / 2 - BACK;
    this.mesh.position.set(f.x + dx * mid, this.mesh.position.y, f.z + dz * mid);
    this.mesh.rotation.y = f.heading - Math.PI / 2;
  }
}

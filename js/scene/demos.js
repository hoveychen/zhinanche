// Mini demos that are not the chariot (DemoId in js/teach/types.js):
// - holdHands: two children holding hands walk once round a circle; the outer
//   one leaves twice as many footprints;
// - compass: a magnetic compass beside the chariot, to show the difference.

import * as THREE from "three";
import { COLORS } from "./ground.js";
import { S, canvasFont, onLang } from "../i18n.js";

/** @import { Strings } from "../teach/strings.js" */

/**
 * A text label that always faces the camera, redrawn when the language changes.
 * @param {(s: Strings) => string} pick
 * @param {number} height world height in chi
 * @param {string} [color]
 */
export function textSprite(pick, height, color = "#3a3128") {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }));
  s.renderOrder = 10;
  const draw = () => {
    const text = pick(S());
    const c = document.createElement("canvas");
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
    const fs = 96;
    const font = `${fs}px ${canvasFont()}`;
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 48;
    c.width = w;
    c.height = fs + 40;
    g.font = font;
    g.fillStyle = "rgba(251,248,240,0.92)";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = color;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, c.height / 2 + 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    s.material.map?.dispose();
    s.material.map = t;
    s.material.needsUpdate = true;
    s.scale.set((height * c.width) / c.height, height, 1);
  };
  draw();
  onLang(draw);
  return s;
}

/** @param {number} robe colour */
function kid(robe) {
  const g = new THREE.Group();
  const robeMat = new THREE.MeshStandardMaterial({ color: robe, roughness: 0.8, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.9, flatShading: true });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.85, 2.6, 8), robeMat);
  body.position.y = 1.3;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), skin);
  head.position.y = 3.15;
  const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), hair);
  bun.position.set(-0.15, 3.75, 0);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.64, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), hair);
  cap.position.y = 3.2;
  for (const m of [body, head, bun, cap]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

const R_IN = 3;
const R_OUT = 6;
const STEPS_IN = 20;
/** One lap takes this many seconds at speed 1. */
const LAP_TIME = 9;

export class HoldHands {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "holdHands";
    for (const [r, color] of /** @type {[number, number][]} */ ([[R_IN, COLORS.left], [R_OUT, COLORS.right]])) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r + 0.06, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      this.group.add(ring);
    }
    this.inner = kid(COLORS.left);
    this.outer = kid(COLORS.right);
    this.arms = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, R_OUT - R_IN, 6), new THREE.MeshStandardMaterial({ color: 0xf0c8a0, flatShading: true }));
    this.arms.geometry.rotateZ(Math.PI / 2);
    this.group.add(this.inner, this.outer, this.arms);
    const print = new THREE.CircleGeometry(0.22, 10);
    print.scale(1.5, 1, 1);
    print.rotateX(-Math.PI / 2);
    this.prints = {
      in: new THREE.InstancedMesh(print, new THREE.MeshBasicMaterial({ color: COLORS.left }), STEPS_IN + 2),
      out: new THREE.InstancedMesh(print, new THREE.MeshBasicMaterial({ color: COLORS.right }), STEPS_IN * 2 + 2),
    };
    for (const p of Object.values(this.prints)) {
      p.position.y = 0.03;
      p.frustumCulled = false;
      this.group.add(p);
    }
    this.labelIn = textSprite((t) => t.scene.inner, 1.1, "#2e70d6");
    this.labelOut = textSprite((t) => t.scene.outer, 1.1, "#c4620c");
    this.group.add(this.labelIn, this.labelOut);
    /** @type {(() => void) | null} */
    this.onLap = null;
    this.angle = 0;
    this.walking = false;
    this.steps = { in: 0, out: 0 };
    this.reset();
  }

  reset() {
    this.angle = 0;
    this.walking = false;
    this.steps = { in: 0, out: 0 };
    this.prints.in.count = 0;
    this.prints.out.count = 0;
    this.#place();
  }

  walk() {
    if (this.walking) return;
    if (this.angle >= Math.PI * 2 - 1e-9) this.reset();
    this.walking = true;
  }

  /** Jump to the end of the lap (self-test). */
  finish() {
    this.walking = true;
    this.update(LAP_TIME * 2);
  }

  /** @param {number} dt */
  update(dt) {
    if (!this.walking) return;
    this.angle = Math.min(Math.PI * 2, this.angle + (dt / LAP_TIME) * Math.PI * 2);
    const lap = this.angle / (Math.PI * 2);
    const sIn = Math.floor(lap * STEPS_IN + 1e-9);
    const sOut = Math.floor(lap * STEPS_IN * 2 + 1e-9);
    while (this.steps.in < sIn) this.#print("in", R_IN, ++this.steps.in, STEPS_IN);
    while (this.steps.out < sOut) this.#print("out", R_OUT, ++this.steps.out, STEPS_IN * 2);
    this.#place();
    if (this.angle >= Math.PI * 2) {
      this.walking = false;
      this.onLap?.();
    }
  }

  /**
   * @param {"in" | "out"} which
   * @param {number} r
   * @param {number} n footprint number (1-based)
   * @param {number} total footprints per lap
   */
  #print(which, r, n, total) {
    const a = (n / total) * Math.PI * 2;
    const side = n % 2 ? 0.22 : -0.22;
    const m = new THREE.Matrix4().makeRotationY(a + Math.PI / 2);
    m.setPosition(Math.cos(a) * (r + side), 0, -Math.sin(a) * (r + side));
    const p = this.prints[which];
    p.setMatrixAt(p.count, m);
    p.count++;
    p.instanceMatrix.needsUpdate = true;
  }

  #place() {
    const a = this.angle;
    const bob = this.walking ? Math.abs(Math.sin(a * STEPS_IN)) * 0.12 : 0;
    for (const [k, r] of /** @type {[THREE.Group, number][]} */ ([[this.inner, R_IN], [this.outer, R_OUT]])) {
      k.position.set(Math.cos(a) * r, bob, -Math.sin(a) * r);
      k.rotation.y = a + Math.PI / 2;
    }
    const mid = (R_IN + R_OUT) / 2;
    this.arms.position.set(Math.cos(a) * mid, 2.1 + bob, -Math.sin(a) * mid);
    this.arms.rotation.y = a;
    this.labelIn.position.set(Math.cos(a) * R_IN, 5.0 + bob, -Math.sin(a) * R_IN);
    this.labelOut.position.set(Math.cos(a) * R_OUT, 5.0 + bob, -Math.sin(a) * R_OUT);
  }

  /** Radius that frames the demo. */
  get radius() {
    return R_OUT + 3;
  }
}

/** Compass face: 北 at −z (north), 南 at +z, red needle end to the south. */
function faceTexture() {
  const SIZE = 512;
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const w = S().scene;
    g.clearRect(0, 0, SIZE, SIZE);
    g.fillStyle = "#f6efdc";
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#3a3128";
    g.lineWidth = 6;
    g.stroke();
    for (let d = 0; d < 360; d += 30) {
      const a = (d * Math.PI) / 180;
      g.beginPath();
      g.moveTo(SIZE / 2 + Math.sin(a) * (SIZE / 2 - 12), SIZE / 2 - Math.cos(a) * (SIZE / 2 - 12));
      g.lineTo(SIZE / 2 + Math.sin(a) * (SIZE / 2 - 40), SIZE / 2 - Math.cos(a) * (SIZE / 2 - 40));
      g.stroke();
    }
    g.fillStyle = "#3a3128";
    g.font = `bold 70px ${canvasFont()}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(w.north, SIZE / 2, 88);
    g.fillText(w.east, SIZE - 88, SIZE / 2);
    g.fillText(w.west, 88, SIZE / 2);
    g.fillStyle = "#c8361f";
    g.fillText(w.south, SIZE / 2, SIZE - 88);
    t.needsUpdate = true;
  };
  draw();
  onLang(draw);
  return t;
}

export class CompassDemo {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "compass";
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8, flatShading: true });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 3.2, 8), wood);
    post.position.y = 1.6;
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.8, 0.4, 32), wood);
    dish.position.y = 3.4;
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.75, 48), new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.7 }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = 3.61;
    this.needle = new THREE.Group();
    const south = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.5, 4), new THREE.MeshStandardMaterial({ color: COLORS.off, roughness: 0.5 }));
    south.rotation.x = Math.PI / 2; // tip to +z (south)
    south.position.z = 0.75;
    const north = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.5, 4), new THREE.MeshStandardMaterial({ color: 0x3b4650, roughness: 0.5 }));
    north.rotation.x = -Math.PI / 2;
    north.position.z = -0.75;
    this.needle.add(south, north);
    this.needle.position.y = 3.75;
    for (const m of [post, dish, south, north]) m.castShadow = true;
    const label = textSprite((t) => t.scene.compass, 0.9);
    label.position.y = 5.2;
    this.group.add(post, dish, face, this.needle, label);
    this.t = 0;
  }

  /**
   * Beside the chariot, always the same way round in the world.
   * @param {number} x
   * @param {number} z
   * @param {number} dt
   */
  update(x, z, dt) {
    this.t += dt;
    this.group.position.set(x + 9.5, 0, z + 5.5);
    this.needle.rotation.y = Math.sin(this.t * 2.3) * 0.02;
  }
}

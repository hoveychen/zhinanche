// Mini demos that are not the chariot (DemoId in js/teach/types.js):
// - holdHands: two children holding hands walk once round a circle; the outer
//   one leaves twice as many footprints;
// - compass: a magnetic compass beside the chariot, to show the difference.

import * as THREE from "three";
import { COLORS } from "./ground.js";
import { S, canvasFont, onLang } from "../i18n.js";

/** @import { Strings } from "../teach/strings.js" */

/**
 * A word over the scene, drawn by the page as a label (js/app/labels.js) at
 * the anchor's place on screen: crisp, at reading size, kept off the HUD.
 * @typedef {object} SceneLabel
 * @property {THREE.Object3D} anchor
 * @property {(s: Strings) => string} text
 * @property {"l" | "r" | ""} side the left-wheel blue or the right-wheel orange, or neither
 * @property {boolean} [beside] level with the anchor, on the side away from the
 *   other such labels (two children one behind the other: labels stacked over
 *   them pointed at the wrong one)
 */

/** A child's arm, from the shoulder down -y: sleeve and hand. @param {THREE.Material} sleeve @param {THREE.Material} skin */
function arm(sleeve, skin) {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.95, 10), sleeve);
  s.position.y = -0.47;
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
  h.position.y = -1.05;
  g.add(s, h);
  return g;
}

/** A leg, from the hip down -y: trouser and shoe. @param {THREE.Material} cloth @param {THREE.Material} shoe */
function leg(cloth, shoe) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 1.35, 10), cloth);
  t.position.y = -0.68;
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6), shoe);
  f.scale.set(1.6, 0.6, 1);
  f.position.set(0.08, -1.4, 0);
  g.add(t, f);
  return g;
}

/**
 * A child as in Song paintings of children at play (婴戏图): hair in two
 * buns (双丫髻), a short jacket crossed at the collar over trousers, a sash.
 * About 3.9 chi tall, facing +x, the holding hand towards +z (side 1) or -z
 * (side -1), reaching to meet the other child's 1.5 chi to that side.
 * @param {number} robe jacket colour @param {1 | -1} side
 */
function kid(robe, side) {
  const g = new THREE.Group();
  const mat = (/** @type {number} */ color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });
  const jacket = mat(robe), trousers = mat(0xe9dfc8), skin = mat(0xf0c8a0, 0.7), hair = mat(0x241d19, 0.6), dark = mat(0x2b2622), sashM = mat(0xc8361f);
  // the jacket: turned from hem to collar, a little deeper than wide
  const prof = [[0, 1.2], [0.6, 1.2], [0.58, 1.45], [0.47, 1.9], [0.45, 2.4], [0.42, 2.68], [0.24, 2.84], [0.15, 2.9], [0, 2.9]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), jacket);
  body.scale.set(0.82, 1, 1);
  // the crossed collar (交领): a band from the right shoulder down to the left side
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.12), sashM);
  collar.position.set(0.36, 2.55, 0.06);
  collar.rotation.x = 0.6;
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.06, 6, 20), sashM);
  sash.rotation.x = Math.PI / 2;
  sash.scale.set(0.82, 1, 1);
  sash.position.y = 1.75;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.25, 10), skin);
  neck.position.y = 2.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), skin);
  head.position.y = 3.3;
  // hair: over the crown and the back, a fringe, two buns tied with red
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.575, 18, 10, Math.PI * 0.62, Math.PI * 1.76, 0, Math.PI * 0.62), hair);
  cap.position.y = 3.3;
  g.add(body, collar, sash, neck, head, cap);
  for (const z of [-0.3, 0.3]) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), hair);
    bun.position.set(-0.05, 3.86, z);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 5, 12), sashM);
    tie.position.set(-0.05, 3.72, z * 0.92);
    tie.rotation.x = Math.PI / 2;
    // face: eyes, rosy cheeks
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), dark);
    eye.position.set(0.5, 3.33, z * 0.6);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xe8907a, 0.8));
    cheek.scale.set(0.3, 0.7, 1);
    cheek.position.set(0.47, 3.15, z * 0.95);
    g.add(bun, tie, eye, cheek);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xb8432e, 0.7));
  mouth.scale.set(0.5, 0.6, 1.4);
  mouth.position.set(0.535, 3.06, 0);
  g.add(mouth);
  /** @type {THREE.Group[]} */
  const legs = [];
  for (const z of [-0.2, 0.2]) {
    const l = leg(trousers, dark);
    l.position.set(0, 1.55, z);
    legs.push(l);
    g.add(l);
  }
  const hold = arm(jacket, skin), free = arm(jacket, skin);
  hold.position.set(0, 2.62, side * 0.42);
  free.position.set(0, 2.62, -side * 0.42);
  // reach out and a little down to meet the other hand (the hands' centres
  // 0.98 out from the shoulder, 1.5 from the middle less a hand's width)
  hold.rotation.x = -side * Math.asin(0.98 / 1.05);
  g.add(hold, free);
  g.traverse((o) => { if (/** @type {THREE.Mesh} */ (o).isMesh) o.castShadow = true; });
  return { group: g, legs, free };
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
    // the inner child holds out its outer hand (+z, away from the middle), the outer one its inner
    this.inner = kid(COLORS.left, 1);
    this.outer = kid(COLORS.right, -1);
    this.group.add(this.inner.group, this.outer.group);
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
    this.labelIn = new THREE.Object3D();
    this.labelOut = new THREE.Object3D();
    this.group.add(this.labelIn, this.labelOut);
    /** @type {SceneLabel[]} */
    this.labels = [
      { anchor: this.labelIn, text: (t) => t.scene.inner, side: "l", beside: true },
      { anchor: this.labelOut, text: (t) => t.scene.outer, side: "r", beside: true },
    ];
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
    const lap = a / (Math.PI * 2);
    // the outer child takes two steps to the inner one's one (as their footprints)
    for (const [k, r, steps] of /** @type {[ReturnType<typeof kid>, number, number][]} */ ([[this.inner, R_IN, STEPS_IN], [this.outer, R_OUT, STEPS_IN * 2]])) {
      const swing = this.walking ? Math.sin(lap * steps * Math.PI) : 0;
      const bob = Math.abs(swing) * 0.08;
      k.group.position.set(Math.cos(a) * r, bob, -Math.sin(a) * r);
      k.group.rotation.y = a + Math.PI / 2;
      k.legs[0].rotation.z = swing * 0.42;
      k.legs[1].rotation.z = -swing * 0.42;
      k.free.rotation.z = -swing * 0.35;
    }
    // each child's head (the labels sit beside it)
    this.labelIn.position.set(Math.cos(a) * R_IN, 3.3, -Math.sin(a) * R_IN);
    this.labelOut.position.set(Math.cos(a) * R_OUT, 3.3, -Math.sin(a) * R_OUT);
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
    const label = new THREE.Object3D();
    label.position.y = 3.9;
    /** @type {SceneLabel[]} */
    this.labels = [{ anchor: label, text: (t) => t.scene.compass, side: "" }];
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

// The palace courtyard round the chariot. The camera looks south past the
// chariot at the gate (landmark.js), so the set is built for that view: the
// south wall with a gate tower (red base, three arched gateways, a hall with
// double yellow eaves) stands behind the gate, covered corridors hung with
// lanterns run down both sides as leading lines, bronze lions guard the
// gate, pines and bronze water vats fill the corners, a main hall closes the
// north, and over the walls rise tree crowns, far roofs and blue hills.
//
// It rides with the chariot like the gate does (Look moves the group; it
// never turns), because the chariot can drive anywhere and the gate always
// stands due south of it. The paving is fixed to the world (ground.js) and
// carries the sense of motion; its detail fades out before it reaches the
// buildings so nothing visibly slides.
// All static; merged by material into ~15 draw calls; shadows are baked once
// (environment.js SetShadow).
// Units: chi. Rider-local: the chariot at the origin, south = +z, east = +x.

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { meanOf, placeholder } from "./photo.js";
import { age } from "./aging.js";
import { Trees } from "./trees.js";
import { Eaves, TILE_REPEAT, UV_PER_CHI } from "./eaves.js";
import { gateDoors, latticeDoors } from "./doors.js";

/** @import { Textures } from "./materials.js" */
/** @import { PhotoSet } from "./photo.js" */
/** @import { TreePlace } from "./trees.js" */
/** @import { EaveOpts } from "./eaves.js" */

/** Stand-ins for photographed textures: white colour, a flat normal, no occlusion and roughness ×1. */
const BLANK = { white: placeholder([255, 255, 255]), flat: placeholder([128, 128, 255]), arm: placeholder([255, 255, 0]) };

/** The court the chariot sits in (rider-local chi). */
export const COURT = { half: 77, north: -205, south: 225 };

/** Deterministic pseudo-random. @param {number} seed */
function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Collects geometries per material key, then merges them. */
export class Bucket {
  constructor() {
    /** @type {Map<string, THREE.BufferGeometry[]>} */
    this.parts = new Map();
    /** @type {TreePlace[]} */
    this.trees = [];
    /** @type {Map<string, Eaves>} eave pieces, by the roof material their tiles take */
    this.eaves = new Map();
  }

  /** The eave pieces of roofs in material `key`. @param {string} key */
  eavesOf(key) {
    let e = this.eaves.get(key);
    if (!e) this.eaves.set(key, (e = new Eaves()));
    return e;
  }

  /** Put the eave pieces in with the rest (their tiles under their roof's key, the paint under "eave"). */
  addEaves() {
    for (const [key, e] of this.eaves) {
      const tiles = e.tiles.geometry(), trim = e.trim.geometry();
      if (tiles) this.add(key, tiles);
      if (trim) this.add("eave", trim, true);
    }
    this.eaves.clear();
  }

  /**
   * @param {string} key @param {THREE.BufferGeometry} g
   * @param {boolean} [indexed] keep the index (every geometry under this key must be indexed)
   */
  add(key, g, indexed = false) {
    let geo = g.index && !indexed ? g.toNonIndexed() : g;
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) geo.deleteAttribute(k);
    const list = this.parts.get(key);
    if (list) list.push(geo);
    else this.parts.set(key, [geo]);
  }

  /** Axis-aligned box. @param {string} key @param {number[]} lo @param {number[]} hi @param {number} [uvScale] */
  box(key, lo, hi, uvScale = 0.1) {
    const [x0, y0, z0] = lo, [x1, y1, z1] = hi;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    worldUV(g, uvScale, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(key, g);
  }

  /** Vertical cylinder. @param {string} key @param {number} x @param {number} z @param {number} y0 @param {number} y1 @param {number} r @param {number} [seg] */
  column(key, x, z, y0, y1, r, seg = 10) {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg, 1, true);
    g.translate(x, (y0 + y1) / 2, z);
    this.add(key, g);
  }
}

/**
 * Box-projected UVs in world space (so merged boxes share a texel density).
 * @param {THREE.BufferGeometry} g @param {number} s @param {number} cx @param {number} cy @param {number} cz
 */
function worldUV(g, s, cx, cy, cz) {
  const p = g.getAttribute("position"), n = g.getAttribute("normal"), uv = g.getAttribute("uv");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx, y = p.getY(i) + cy, z = p.getZ(i) + cz;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, x * s, z * s);
    else if (ax > 0.5) uv.setXY(i, z * s, y * s);
    else uv.setXY(i, x * s, y * s);
  }
}

/**
 * A curved hip roof (庑殿顶): concave slopes, upturned corners. Long axis x.
 * The tile rows run straight down each slope, as on a real roof (u is the
 * distance along the eave, so the hips cut the rows short), and v is the
 * distance up the slope.
 * @param {Bucket} b @param {string} key
 * @param {{cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, lift: number, tMax?: number, eaves?: EaveOpts | false, ridge?: number}} o
 *   hx, hz: half size at the eave line; y0 eave height, y1 ridge height;
 *   eaves: tile ends along the eave (eaves.js), with these extras (false: none);
 *   ridge: the ridge beam's and its end ornaments' size (1: a hall's)
 */
export function hipRoof(b, key, o) {
  const n = 7, m = 10;
  const tMax = o.tMax ?? 1;
  // Built along x; a roof that is longer along z is built swapped.
  const swap = o.hz > o.hx;
  const HX = swap ? o.hz : o.hx, HZ = swap ? o.hx : o.hz;
  const ridgeHalf = Math.max(0, HX - HZ);
  /** half the length of side `side`'s edge at t @param {number} t @param {number} side */
  const half = (t, side) => (side % 2 === 0 ? ridgeHalf + (HX - ridgeHalf) * (1 - t) : HZ * (1 - t));
  /** in the roof's own frame @param {number} t @param {number} e 0..1 along the side @param {number} side 0..3 */
  const local = (t, e, side) => {
    const hz = HZ * (1 - t), hx = ridgeHalf + (HX - ridgeHalf) * (1 - t);
    const s = 2 * e - 1;
    const x = side === 0 ? s * hx : side === 2 ? -s * hx : side === 1 ? hx : -hx;
    const z = side === 0 ? hz : side === 2 ? -hz : side === 1 ? -s * hz : s * hz;
    const lift = o.lift * (1 - t) ** 2 * Math.abs(s) ** 4;
    return [x, o.y0 + (o.y1 - o.y0) * t ** 1.7 + lift, z];
  };
  const world = (/** @type {number[]} */ [x, y, z]) => (swap ? new THREE.Vector3(o.cx + z, y, o.cz + x) : new THREE.Vector3(o.cx + x, y, o.cz + z));
  for (let side = 0; side < 4; side++) {
    const pos = [], uv = [], idx = [];
    /** distance up the slope so far, per column @type {number[]} */
    const up = new Array(m + 1).fill(0);
    /** @type {number[][]} */
    let last = [];
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * tMax;
      for (let j = 0; j <= m; j++) {
        const e = j / m;
        const l = local(t, e, side);
        if (k) {
          // across the slope only (x on the long sides, z on the ends): what the rows run along
          const [px, py, pz] = last[j];
          up[j] += side % 2 === 0 ? Math.hypot(l[1] - py, l[2] - pz) : Math.hypot(l[1] - py, l[0] - px);
        }
        last[j] = l;
        const p = world(l);
        pos.push(p.x, p.y, p.z);
        // u: along the eave, rightwards seen from outside (the same for every side)
        uv.push((2 * e - 1) * half(t, side) * UV_PER_CHI, up[j] * UV_PER_CHI);
      }
    }
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < m; j++) {
        const a = k * (m + 1) + j, c = a + m + 1;
        if (swap) idx.push(a, c + 1, a + 1, a, c, c + 1);
        else idx.push(a, a + 1, c + 1, a, c + 1, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.add(key, g);
    if (o.eaves !== false && o.eaves !== undefined) {
      const h0 = half(0, side);
      const out = world([side === 1 ? 1 : side === 3 ? -1 : 0, 0, side === 0 ? 1 : side === 2 ? -1 : 0]).sub(world([0, 0, 0]));
      b.eavesOf(key).eave((a) => world(local(0, (a / h0 + 1) / 2, side)), out, -h0, h0, o.eaves);
    }
  }
  if (tMax >= 1) {
    // ridge beam with upturned ends (dark glazed)
    const y = o.y1, r = o.ridge ?? 1, L = ridgeHalf + 0.6 * r;
    /** @param {number} a0 @param {number} y0 @param {number} c0 @param {number} a1 @param {number} y1 @param {number} c1 */
    const box = (a0, y0, c0, a1, y1, c1) => (swap
      ? b.box(key, [o.cx + c0, y0, o.cz + a0], [o.cx + c1, y1, o.cz + a1])
      : b.box(key, [o.cx + a0, y0, o.cz + c0], [o.cx + a1, y1, o.cz + c1]));
    box(-L, y - 0.6 * r, -0.9 * r, L, y + 1.6 * r, 0.9 * r);
    if (o.lift > 0) for (const sx of [-1, 1]) box(sx * (ridgeHalf + 0.2 * r) - r, y, -0.8 * r, sx * (ridgeHalf + 0.2 * r) + r, y + 4.2 * r, 0.8 * r);
  }
}

/**
 * The bracket sets (斗拱) under an eave: a band round a hall, y0 to y1, half
 * sizes hx, hz, its faces carrying the baked band (build_photo.py
 * dougong_band: one set in the middle of each module). mx, mz: the module
 * along x and z; x0, z0: where a set stands along each (over a column),
 * from the centre. The underside takes the plank's colour.
 * @param {Bucket} b @param {number} cx @param {number} cz @param {number} hx @param {number} hz
 * @param {number} y0 @param {number} y1 @param {number} mx @param {number} x0 @param {number} mz @param {number} z0
 */
function bracketBand(b, cx, cz, hx, hz, y0, y1, mx, x0, mz, z0) {
  /** @type {number[]} */ const pos = [];
  /** @type {number[]} */ const nor = [];
  /** @type {number[]} */ const uv = [];
  const vOf = (/** @type {number} */ y) => 0.01 + (0.98 * (y - y0)) / (y1 - y0);
  /** a quad from four corners (counter-clockwise seen from outside) @param {number[][]} q @param {number[]} n @param {(p: number[]) => number[]} map */
  const quad = (q, n, map) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...q[i]);
      nor.push(...n);
      uv.push(...map(q[i]));
    }
  };
  const ux = (/** @type {number[]} */ p) => [(p[0] - cx - x0) / mx + 0.5, vOf(p[1])];
  const uz = (/** @type {number[]} */ p) => [(p[2] - cz - z0) / mz + 0.5, vOf(p[1])];
  const X0 = cx - hx, X1 = cx + hx, Z0 = cz - hz, Z1 = cz + hz;
  quad([[X0, y0, Z1], [X1, y0, Z1], [X1, y1, Z1], [X0, y1, Z1]], [0, 0, 1], ux);
  quad([[X1, y0, Z0], [X0, y0, Z0], [X0, y1, Z0], [X1, y1, Z0]], [0, 0, -1], ux);
  quad([[X1, y0, Z1], [X1, y0, Z0], [X1, y1, Z0], [X1, y1, Z1]], [1, 0, 0], uz);
  quad([[X0, y0, Z0], [X0, y0, Z1], [X0, y1, Z1], [X0, y1, Z0]], [-1, 0, 0], uz);
  quad([[X0, y0, Z0], [X1, y0, Z0], [X1, y0, Z1], [X0, y0, Z1]], [0, -1, 0], (p) => [(p[0] - cx) / mx, 0.03]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  b.add("dougong", g);
}

/**
 * A hall: terrace, columns, walls, painted bracket band, roof.
 * @param {Bucket} b
 * @param {{cx: number, cz: number, w: number, d: number, base: number, h: number, roof: string, double?: boolean,
 *   face?: "s" | "n" | "e" | "w", baseKey?: string, steps?: boolean}} o
 *   w along the front, d deep; the front (steps, doors) faces south, north, east or west
 */
function hall(b, o) {
  const face = o.face ?? "s";
  // local (x along the front, z towards the front) → world offset
  const sw = (/** @type {number} */ x, /** @type {number} */ z) => (face === "s" ? [x, z] : face === "n" ? [-x, -z] : face === "e" ? [z, x] : [-z, x]);
  /** @param {string} key @param {number} x0 @param {number} y0 @param {number} z0 @param {number} x1 @param {number} y1 @param {number} z1 */
  const box = (key, x0, y0, z0, x1, y1, z1) => {
    const [a0, c0] = sw(x0, z0), [a1, c1] = sw(x1, z1);
    b.box(key, [o.cx + Math.min(a0, a1), y0, o.cz + Math.min(c0, c1)], [o.cx + Math.max(a0, a1), y1, o.cz + Math.max(c0, c1)]);
  };
  const W = o.w / 2, D = o.d / 2, y0 = o.base, y1 = o.base + o.h;
  // terrace with a moulded lip, and steps on the courtyard side (+z before rot)
  box(o.baseKey ?? "marble", -W - 8, 0, -D - 8, W + 8, y0 - 0.6, D + 8);
  box("marble", -W - 8.6, y0 - 0.6, -D - 8.6, W + 8.6, y0, D + 8.6);
  if (o.steps !== false) {
    const steps = Math.max(2, Math.round(y0 / 1.2));
    for (let k = 0; k < steps; k++) {
      const h = y0 * (1 - k / steps), out = D + 8.6 + (k + 1) * 1.6;
      box("marble", -Math.min(14, W * 0.3), 0, D + 8.6, Math.min(14, W * 0.3), h, out);
    }
  }
  // body: walls set back, lattice doors along the front, columns in front
  box("wallRed", -W + 2, y0, -D + 2, W - 2, y1, D - 2);
  const bays = Math.max(3, Math.round(o.w / 12));
  // a board of four lattice leaves (doors.js) in every bay, between the columns
  const turn = face === "s" ? 0 : face === "n" ? Math.PI : face === "e" ? Math.PI / 2 : -Math.PI / 2;
  for (let k = 0; k < bays; k++) {
    const xa = -W + 0.5 + ((o.w - 1) * k) / bays + 1.1, xb = -W + 0.5 + ((o.w - 1) * (k + 1)) / bays - 1.1;
    const dh = y1 - 3.2 - (y0 + 0.2);
    const leaf = new THREE.PlaneGeometry(xb - xa, dh);
    leaf.rotateY(turn);
    const [a, c] = sw((xa + xb) / 2, D - 1.9);
    leaf.translate(o.cx + a, y0 + 0.2 + dh / 2, o.cz + c);
    b.add("hallDoor", leaf);
  }
  for (let k = 0; k <= bays; k++) {
    const x = -W + 0.5 + ((o.w - 1) * k) / bays;
    for (const z of [D, -D]) {
      const [a, c] = sw(x, z);
      b.column("column", o.cx + a, o.cz + c, y0, y1, 1.1);
    }
  }
  for (const x of [-W + 0.5, W - 0.5]) {
    for (let k = 1; k < 4; k++) {
      const z = -D + (o.d * k) / 4;
      const [a, c] = sw(x, z);
      b.column("column", o.cx + a, o.cz + c, y0, y1, 1.1);
    }
  }
  // architrave and the bracket sets under the eaves: a set over every column
  // and two or three between (about 3 chi apart), on the front and the ends
  box("column", -W - 1, y1 - 1.6, -D - 1, W + 1, y1, D + 1);
  const rot = face === "e" || face === "w";
  const bay = (o.w - 1) / bays, mw = bay / Math.max(1, Math.round(bay / 3));
  const md = o.d / 4 / Math.max(1, Math.round(o.d / 12));
  const [mx, x0, mz, z0] = rot ? [md, -D, mw, -W + 0.5] : [mw, -W + 0.5, md, -D];
  const [bx, bz] = rot ? [D + 1.8, W + 1.8] : [W + 1.8, D + 1.8];
  bracketBand(b, o.cx, o.cz, bx, bz, y1, y1 + 2.4, mx, x0, mz, z0);
  const [hx, hz] = rot ? [D + 8, W + 8] : [W + 8, D + 8];
  const eaves = { fascia: true, rafters: true };
  if (o.double) {
    hipRoof(b, o.roof, { cx: o.cx, cz: o.cz, hx, hz, y0: y1 + 1.6, y1: y1 + 10, lift: 2.4, tMax: 0.42, eaves });
    const up = y1 + 6.5;
    const [ux, uz] = rot ? [D * 0.8, W * 0.8] : [W * 0.8, D * 0.8];
    b.box("wallRed", [o.cx - ux, y1 + 2, o.cz - uz], [o.cx + ux, up + 4, o.cz + uz]);
    bracketBand(b, o.cx, o.cz, ux + 1, uz + 1, up + 2.4, up + 4.6, mx, 0, mz, 0);
    hipRoof(b, o.roof, { cx: o.cx, cz: o.cz, hx: ux + 7, hz: uz + 7, y0: up + 4, y1: up + 4 + Math.min(ux, uz, 14) * 0.9 + 4, lift: 2.6, eaves });
  } else {
    hipRoof(b, o.roof, { cx: o.cx, cz: o.cz, hx, hz, y0: y1 + 1.6, y1: y1 + 1.6 + Math.min(hx, hz) * 0.85, lift: 2, eaves });
  }
}

/** A red wall with a stone plinth and a glazed coping. Along x or z. @param {Bucket} b @param {number[]} p0 @param {number[]} p1 @param {number} [h] */
function wall(b, p0, p1, h = 17) {
  const [x0, z0] = p0, [x1, z1] = p1, t = 1.6;
  const lo = [Math.min(x0, x1) - t, 0, Math.min(z0, z1) - t], hi = [Math.max(x0, x1) + t, 0, Math.max(z0, z1) + t];
  b.box("marble", [lo[0] - 0.4, 0, lo[2] - 0.4], [hi[0] + 0.4, 2.4, hi[2] + 0.4]);
  b.box("wallRed", [lo[0], 2.4, lo[2]], [hi[0], h, hi[2]], 0.05);
  b.box("bracket", [lo[0] - 0.3, h - 0.9, lo[2] - 0.3], [hi[0] + 0.3, h, hi[2] + 0.3]);
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = alongX ? Math.abs(x1 - x0) / 2 + t + 1.5 : Math.abs(z1 - z0) / 2 + t + 1.5;
  // the coping is a little gable roof; build as a hip roof with no hips
  hipRoof(b, "roofYellow", alongX
    ? { cx, cz, hx: half + 3.4, hz: 3.4, y0: h, y1: h + 2.8, lift: 0, eaves: {} }
    : { cx, cz, hx: 3.4, hz: half + 3.4, y0: h, y1: h + 2.8, lift: 0, eaves: {} });
}

/**
 * An arched gateway on a wall face that looks north (−z): a dark opening
 * with a stone frame. @param {Bucket} b @param {number} x @param {number} z face plane
 * @param {number} w @param {number} h to the springing of the arch
 */
function archway(b, x, z, w, h) {
  /** @param {number} hw @param {number} hh */
  const shape = (hw, hh) => {
    const s = new THREE.Shape();
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, hh);
    s.absarc(0, hh, hw, 0, Math.PI, false);
    s.lineTo(-hw, 0);
    return s;
  };
  const frame = new THREE.ShapeGeometry(shape(w / 2 + 1.1, h), 12);
  frame.rotateY(Math.PI);
  frame.translate(x, 0, z - 0.06);
  b.add("marble", frame);
  // the closed gate leaves (doors.js): u across the arch, v from the sill up
  const hole = new THREE.ShapeGeometry(shape(w / 2, h), 12);
  const p = hole.getAttribute("position"), uv = hole.getAttribute("uv");
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, p.getY(i) / (h + w / 2));
  hole.rotateY(Math.PI);
  hole.translate(x, 0, z - 0.12);
  b.add("gateDoor", hole);
}

/**
 * The south gate tower: a red masonry base with three arched gateways, and a
 * double-eaved hall on top. Seen from the court (the north). @param {Bucket} b @param {number} cz
 */
function gateTower(b, cz) {
  hall(b, { cx: 0, cz, w: 66, d: 18, base: 24, h: 12, roof: "roofYellow", double: true, face: "n", baseKey: "wallRed", steps: false });
  const face = cz - 17;
  b.box("marble", [-41.6, 0, face - 0.4], [41.6, 2.6, cz + 17.4]);
  archway(b, 0, face, 9, 11);
  for (const s of [-1, 1]) archway(b, s * 23, face, 7, 8.5);
  // parapet on top of the base
  b.box("wallRed", [-42.6, 24, face - 0.8], [42.6, 26.2, face + 0.4]);
}

/**
 * A covered corridor (回廊) along one side wall: a stone platform, red back
 * wall, a row of red columns, painted beams, a lean-to roof of dark tiles,
 * and red lanterns hanging in the bays. @param {Bucket} b @param {number} sx −1 west, 1 east
 * @param {number} z0 @param {number} z1 @param {boolean} lanterns
 */
function corridor(b, sx, z0, z1, lanterns) {
  const X = (/** @type {number} */ v) => sx * v;
  const lo = (/** @type {number} */ a, /** @type {number} */ c) => Math.min(X(a), X(c));
  const hi = (/** @type {number} */ a, /** @type {number} */ c) => Math.max(X(a), X(c));
  b.box("marble", [lo(60.5, 77), 0, z0], [hi(60.5, 77), 1.4, z1]);
  b.box("wallRed", [lo(75, 77.5), 1.4, z0], [hi(75, 77.5), 16, z1], 0.05);
  const bay = 9;
  const n = Math.round((z1 - z0) / bay);
  for (let k = 0; k <= n; k++) {
    const z = z0 + ((z1 - z0) * k) / n;
    b.column("column", X(63.5), z, 1.4, 12, 0.7, 8);
    // tie beam back to the wall
    b.box("column", [lo(63.5, 75), 11.2, z - 0.35], [hi(63.5, 75), 12, z + 0.35]);
    if (lanterns && k < n && k % 2 === 0) lantern(b, X(63.5), z + (z1 - z0) / n / 2, 12.1);
  }
  b.box("column", [lo(62.9, 64.1), 11, z0], [hi(62.9, 64.1), 12.2, z1]);
  // small bracket sets (a set over each column and four between: the band is lower than a hall's)
  bracketBand(b, (lo(62.6, 75) + hi(62.6, 75)) / 2, (z0 + z1) / 2, 6.2, (z1 - z0) / 2, 12.2, 13.6, 2, 0, (z1 - z0) / n / 5, z0 - (z0 + z1) / 2);
  // lean-to roof: eave at 60, ridge over the back wall, slightly sagging
  const pos = [], uv = [], idx = [];
  const m = 6;
  for (let i = 0; i <= m; i++) {
    const t = i / m;
    const x = X(59.5 + t * (78.5 - 59.5));
    const y = 13.2 + 5.6 * t ** 1.4;
    for (const z of [z0 - 1.5, z1 + 1.5]) {
      pos.push(x, y, z);
      uv.push((z - z0) * UV_PER_CHI, t * 19 * UV_PER_CHI);
    }
  }
  for (let i = 0; i < m; i++) {
    const a = i * 2;
    if (sx > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  b.add("roofGray", g);
  b.box("roofGray", [lo(77, 79.5), 18.4, z0 - 1.5], [hi(77, 79.5), 20, z1 + 1.5]);
  // the eave: u above is the distance from z0
  b.eavesOf("roofGray").eave((a) => new THREE.Vector3(X(59.5), 13.2, z0 + a), new THREE.Vector3(-sx, 0, 0), -1.5, z1 - z0 + 1.5, { fascia: true, rafters: true });
}

/** A red palace lantern hanging from y. @param {Bucket} b @param {number} x @param {number} z @param {number} y */
function lantern(b, x, z, y) {
  b.column("trunk", x, z, y - 1.6, y, 0.06, 4);
  const body = new THREE.SphereGeometry(1, 12, 8);
  body.scale(1.05, 1.2, 1.05);
  body.translate(x, y - 3, z);
  b.add("lantern", body);
  for (const [yy, r] of [[y - 1.75, 0.6], [y - 4.25, 0.6]]) b.column("gold", x, z, yy - 0.18, yy + 0.18, r, 10);
  const tassel = new THREE.ConeGeometry(0.28, 1.4, 6);
  tassel.translate(x, y - 5.1, z);
  b.add("gold", tassel);
}

/** @type {THREE.BufferGeometry[]} */
const clumps = [];
/** A welded unit icosphere (IcosahedronGeometry comes unindexed with flat normals). @param {number} [detail] */
function clumpTemplate(detail = 2) {
  clumps[detail] ??= mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute("uv").deleteAttribute("normal"));
  return clumps[detail];
}

/**
 * A lumpy blob (crown clump, lion's mane) from the shared template.
 * @param {number} rad @param {number} ph phase @param {number} rough 0..1 @param {number} [detail] icosphere detail
 */
function lump(rad, ph, rough, detail = 2) {
  const g = clumpTemplate(detail).clone();
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
    const n1 = Math.sin(X * 4.1 + ph) * Math.sin(Y * 3.7 - ph) * Math.sin(Z * 4.3 + 2 * ph);
    const n2 = Math.sin(X * 11.3 - ph) * Math.sin(Y * 9.7 + ph) * Math.sin(Z * 10.9);
    const s = rad * (0.9 + rough * (0.22 * n1 + 0.14 * n2));
    p.setXYZ(i, X * s, Y * s, Z * s);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A pine or fir (trees.js draws them): where it stands, how tall, which kind.
 * The firs are the dense ones, so most are firs.
 * @param {Bucket} b @param {number} x @param {number} z @param {number} h @param {number} seed
 * @param {import("./trees.js").TreeKind} [kind] else picked by the seed
 */
function tree(b, x, z, h, seed, kind) {
  const r = rand(seed);
  const pick = r();
  b.trees.push({ kind: kind ?? (pick < 0.45 ? "fir" : pick < 0.8 ? "firb" : "pine"), x, z, h, tint: 0.9 + 0.2 * r() });
}

/** A bronze tripod cauldron (鼎) on a plinth. @param {Bucket} b @param {number} x @param {number} z */
function cauldron(b, x, z) {
  b.box("marble", [x - 3, 0, z - 3], [x + 3, 1.6, z + 3]);
  const body = new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65);
  body.scale(1, 0.8, 1);
  body.translate(x, 5, z);
  b.add("bronze", body);
  const lip = new THREE.TorusGeometry(1.75, 0.25, 6, 20);
  lip.rotateX(Math.PI / 2);
  lip.translate(x, 6.4, z);
  b.add("bronze", lip);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.column("bronze", x + Math.cos(a) * 1.4, z + Math.sin(a) * 1.4, 1.6, 4.4, 0.28, 6);
  }
  for (const s of [-1, 1]) b.box("bronze", [x + s * 1.6 - 0.15, 6.2, z - 0.6], [x + s * 1.6 + 0.15, 7.8, z + 0.6]);
}

/** A big bronze water vat (太平缸) on a stone base. @param {Bucket} b @param {number} x @param {number} z */
function vat(b, x, z) {
  b.box("marble", [x - 3.4, 0, z - 3.4], [x + 3.4, 1.2, z + 3.4]);
  const prof = [[0, 0], [2.2, 0], [2.9, 1.4], [3.1, 3.2], [3.0, 4.2], [3.3, 4.4], [3.2, 4.6], [0, 4.6]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 20);
  g.translate(x, 1.2, z);
  b.add("bronze", g);
  for (const s of [-1, 1]) {
    const ring = new THREE.TorusGeometry(0.55, 0.14, 6, 12);
    ring.translate(x + s * 3.15, 4.6, z);
    b.add("gold", ring);
  }
}

/**
 * A seated bronze lion on a stone plinth, facing north (−z), towards the
 * court. @param {Bucket} b @param {number} x @param {number} z @param {number} seed @param {number} paw −1 or 1: which forepaw rests on the ball
 */
function lion(b, x, z, seed, paw) {
  const r = rand(seed);
  b.box("marble", [x - 2.8, 0, z - 4], [x + 2.8, 2.8, z + 4]);
  b.box("marble", [x - 3.2, 2.8, z - 4.4], [x + 3.2, 3.5, z + 4.4]);
  const y0 = 3.5;
  /** @param {THREE.BufferGeometry} g */
  const put = (g) => b.add("bronze", g.index ? g : mergeVertices(g.deleteAttribute("uv")), true);
  /** @param {number} rad @param {number} sx @param {number} sy @param {number} sz @param {number} px @param {number} py @param {number} pz @param {number} rough @param {number} [tilt] */
  const part = (rad, sx, sy, sz, px, py, pz, rough, tilt = 0) => {
    const g = lump(rad, r() * 10, rough);
    g.scale(sx, sy, sz);
    if (tilt) g.rotateX(tilt);
    g.translate(x + px, y0 + py, z + pz);
    put(g);
  };
  /** A snail-shell curl of the mane. @param {number} px @param {number} py @param {number} pz @param {number} rad */
  const curl = (px, py, pz, rad) => {
    const g = new THREE.SphereGeometry(rad, 7, 5);
    g.scale(1, 1, 0.75);
    g.translate(x + px, y0 + py, z + pz);
    put(g);
  };
  // Seated upright: haunches behind, a chest leaning forward over straight forelegs.
  part(1.6, 1.05, 0.8, 1.2, 0, 1.3, 1.2, 0.25); // haunches
  part(1.35, 0.95, 1.5, 0.85, 0, 3.0, -0.3, 0.2, -0.25); // chest
  for (const s of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.5, 0.6, 3.2, 8);
    leg.translate(x + s * 0.85, y0 + 1.6, z - 1.25);
    put(leg);
    part(0.5, 1.1, 0.55, 1.3, s * 0.85, 0.25, -1.55, 0.2); // forepaw
    part(0.62, 1, 0.7, 1.35, s * 1.35, 0.45, 0.9, 0.2); // hind paw tucked at the side
  }
  // The head is big and square, as on palace lions: a broad face with a
  // blunt muzzle, heavy brows, bulging eyes, the mane in rows of curls.
  const hy = 5.75, hz = -1.35;
  const head = new THREE.BoxGeometry(2.5, 2.2, 2.0, 2, 2, 2);
  const hp = head.getAttribute("position");
  for (let i = 0; i < hp.count; i++) {
    // round the box's corners a little
    const X = hp.getX(i), Y = hp.getY(i), Z = hp.getZ(i);
    const k = 1 - 0.12 * (Math.abs(X / 1.25) * Math.abs(Y / 1.1) + Math.abs(Y / 1.1) * Math.abs(Z) + Math.abs(X / 1.25) * Math.abs(Z));
    hp.setXYZ(i, X * k, Y * k, Z * k);
  }
  head.translate(x, y0 + hy, z + hz);
  put(head);
  const muzzle = new THREE.BoxGeometry(1.5, 0.95, 0.8);
  muzzle.translate(x, y0 + hy - 0.55, z + hz - 1.2);
  put(muzzle);
  const nose = new THREE.SphereGeometry(0.32, 8, 5);
  nose.scale(1.4, 0.8, 1);
  nose.translate(x, y0 + hy - 0.1, z + hz - 1.55);
  put(nose);
  const jaw = new THREE.BoxGeometry(1.3, 0.35, 0.7);
  jaw.translate(x, y0 + hy - 1.2, z + hz - 1.1);
  put(jaw);
  for (const s of [-1, 1]) {
    const brow = new THREE.BoxGeometry(0.95, 0.32, 0.45);
    brow.rotateZ(s * 0.18);
    brow.translate(x + s * 0.6, y0 + hy + 0.55, z + hz - 1.0);
    put(brow);
    const eye = new THREE.SphereGeometry(0.27, 8, 6);
    eye.translate(x + s * 0.6, y0 + hy + 0.2, z + hz - 1.0);
    put(eye);
    const ear = new THREE.SphereGeometry(0.35, 6, 4);
    ear.scale(0.8, 1, 0.5);
    ear.translate(x + s * 1.35, y0 + hy + 0.75, z + hz - 0.2);
    put(ear);
  }
  // curls: three rows over the crown, a fall of them down the back of the neck
  for (let row = 0; row < 3; row++) {
    const n = 5 - (row === 2 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5;
      curl(u * 2.3, hy + 1.1 - row * 0.05, hz - 0.65 + row * 0.75, 0.3);
    }
  }
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 6; i++) {
      const a = ((i + 0.5) / 6 - 0.5) * Math.PI * 1.1;
      const R = 1.55 - row * 0.08;
      curl(Math.sin(a) * R, hy + 0.4 - row * 0.75, hz + 0.75 + Math.cos(a) * R * 0.7 + row * 0.12, 0.34);
    }
  }
  // tail: a flame of curls up the back
  for (let i = 0; i < 4; i++) curl(0, 1.4 + i * 0.55, 2.5 - i * 0.1, 0.42 - i * 0.04);
  const ball = new THREE.SphereGeometry(0.8, 12, 8);
  ball.translate(x + paw * 0.95, y0 + 0.8, z - 2.6);
  put(ball);
}

/** A far hall seen over the wall: a red body and a hip roof, no detail. @param {Bucket} b @param {number} cx @param {number} cz @param {number} w @param {number} d @param {number} y0 */
function farHall(b, cx, cz, w, d, y0) {
  b.box("wallRed", [cx - w / 2, 0, cz - d / 2], [cx + w / 2, y0, cz + d / 2]);
  hipRoof(b, "roofYellow", { cx, cz, hx: w / 2 + 6, hz: d / 2 + 6, y0, y1: y0 + (d / 2 + 6) * 0.8, lift: 2, eaves: false });
}

/** Two rings of far hills. @param {Bucket} b */
function hills(b) {
  const pos = [];
  const N = 160;
  const r = rand(77);
  /** @type {number[]} */
  const hs = [];
  for (let i = 0; i <= N; i++) hs.push(r());
  for (let i = 0; i < N; i++) {
    for (const [ring, R, H] of [[0, 760, 75], [1, 1050, 150]]) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      /** @param {number} a @param {number} k */
      const height = (a, k) => {
        const wave = 0.55 + 0.25 * Math.sin(a * 5 + ring * 2) + 0.2 * Math.sin(a * 13 + ring) + 0.25 * hs[(k + ring * 37) % N];
        return H * wave;
      };
      const h0 = height(a0, i), h1 = height(a1, i + 1);
      const p = (/** @type {number} */ a, /** @type {number} */ y) => [Math.sin(a) * R, y, Math.cos(a) * R];
      pos.push(...p(a0, -2), ...p(a1, -2), ...p(a1, h1), ...p(a0, -2), ...p(a1, h1), ...p(a0, h0));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  b.add("hills", g);
}

/** The arches' spring as a share of their height (archway: 11 of 15.5, 8.5 of 12). */
const SPRING = 0.71;

/** @param {boolean} lite smaller door textures @returns {Record<string, THREE.MeshStandardMaterial>} */
function materials(lite) {
  /** @param {number} color @param {number} roughness @param {object} [extra] */
  const M = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  return {
    marble: M(0xdcd6cb, 0.72),
    wallRed: M(0xa3392a, 0.9),
    panel: M(0x5e1d16, 0.7),
    column: M(0x9a2618, 0.55),
    bracket: M(0x2c6a5f, 0.7),
    // the bracket band: its colour comes with the baked band (photo), till then the old flat green
    dougong: M(0x2c6a5f, 0.8),
    // fascia boards and rafter ends (eaves.js): painted, colours per vertex
    eave: M(0xffffff, 0.75, { vertexColors: true }),
    roofYellow: M(0xe0a62a, 0.34, { side: THREE.DoubleSide }),
    roofGray: M(0x4b5354, 0.6, { side: THREE.DoubleSide }),
    // green glaze: the gate's roofs (landmark.js; Courtyard.dressGate)
    roofGreen: M(0x2c4f55, 0.34),
    trunk: M(0x4a3626, 0.95),
    bronze: M(0x6b5634, 0.38, { metalness: 0.85 }),
    gold: M(0xd2a443, 0.3, { metalness: 1 }),
    lantern: M(0xc42a18, 0.55, { emissive: 0xff5a2a, emissiveIntensity: 0.35 }),
    hallDoor: M(0xffffff, 0.62, { map: latticeDoors(lite) }),
    gateDoor: M(0xffffff, 0.5, gateDoors(lite, SPRING)),
    hills: M(0x6f8790, 1, { flatShading: true }),
  };
}

/**
 * Lay the court out into a bucket, a part at a time: it yields between
 * parts so a caller can spread the work over idle slices.
 * @param {Bucket} b @param {boolean} lite fewer trees beyond the walls
 * @returns {Generator<void, void, void>}
 */
function* layout(b, lite) {
  const C = COURT;
  // south: the gate tower in the wall, the wall on either side of it
  gateTower(b, C.south + 4);
  for (const s of [-1, 1]) wall(b, [s * 43, C.south], [s * C.half, C.south]);
  yield;
  // corridors down both sides, walls closing the north corners
  for (const s of [-1, 1]) {
    corridor(b, s, -150, C.south - 2, true);
    wall(b, [s * C.half, -150], [s * C.half, C.north]);
  }
  wall(b, [-C.half, C.north], [C.half, C.north]);
  yield;
  // north: the main hall, facing the gate, two cauldrons before its steps
  hall(b, { cx: 0, cz: -168, w: 100, d: 28, base: 7, h: 18, roof: "roofYellow", double: true });
  cauldron(b, -30, -127);
  cauldron(b, 30, -127);
  yield;
  // bronze lions either side of the gate, water vats in the south corners
  lion(b, -13.5, 92, 11, 1);
  lion(b, 13.5, 92, 12, -1);
  for (const s of [-1, 1]) {
    vat(b, s * 36, 196);
    vat(b, s * 52, -120);
  }
  yield;
  // a clump of three in each corner of the court: the photographed trees are
  // tall and bare low down, and one alone read thin close up; the two
  // smaller ones stand further into the corner, crowns overlapping
  const r = rand(5);
  /** @type {[number, number, number, import("./trees.js").TreeKind][]} */
  const court = [[-50, 196, 40, "fir"], [52, 190, 44, "fir"], [-52, -112, 38, "pine"], [50, -108, 36, "fir"]];
  for (const [x, z, h, kind] of court) {
    const sx = Math.sign(x), sz = Math.sign(z);
    tree(b, x, z, h, Math.floor(r() * 1e6), kind);
    tree(b, x + sx * 7, z + sz * 5, h * 0.82, Math.floor(r() * 1e6), kind === "pine" ? "firb" : "pine");
    tree(b, x - sx * 2, z + sz * 10, h * 0.7, Math.floor(r() * 1e6), "firb");
  }
  // beyond the walls: groves of one to three trees (the photographed trees
  // are slimmer than the old crowns were, and a card costs next to nothing)
  const outer = lite ? 18 : 40;
  /** @param {number} x @param {number} z @param {number} h */
  const grove = (x, z, h) => {
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = i ? 7 + r() * 9 : 0;
      tree(b, x + Math.cos(a) * d, z + Math.sin(a) * d, h * (i ? 0.75 + 0.3 * r() : 1), Math.floor(r() * 1e6));
    }
  };
  for (let k = 0; k < outer; k++) {
    const t = k / outer;
    if (t < 0.45) {
      // south, behind the gate wall
      const x = (r() < 0.5 ? -1 : 1) * (48 + r() * 170), z = C.south + 25 + r() * 120;
      grove(x, z, 40 + r() * 22);
    } else {
      const side = k % 2 ? 1 : -1;
      grove(side * (95 + r() * 110), -230 + r() * 420, 42 + r() * 26);
    }
    if (k % 8 === 7) yield;
  }
  farHall(b, -150, 360, 80, 34, 22);
  farHall(b, 165, 420, 90, 36, 24);
  farHall(b, 30, 560, 120, 40, 30);
  farHall(b, -200, -320, 90, 34, 22);
  farHall(b, 190, -300, 70, 30, 20);
  hills(b);
  b.addEaves();
}

export class Courtyard {
  /**
   * Build the court a part at a time, awaiting `pause` between parts.
   * @param {{lite?: boolean}} [opts] lite: fewer trees beyond the walls
   * @param {() => Promise<void>} [pause]
   */
  static async build(opts = {}, pause = async () => {}) {
    const b = new Bucket();
    for (const _ of layout(b, !!opts.lite)) await pause();
    const yard = new Courtyard(!!opts.lite);
    yard.trees = new Trees(b.trees);
    yard.group.add(yard.trees.group);
    // merging is a good share of the work too: one material's meshes per slice
    for (const [key, list] of b.parts) {
      await pause();
      yard.#merge(key, list);
    }
    return yard;
  }

  /** Empty: use Courtyard.build. @param {boolean} [lite] smaller door textures */
  constructor(lite = false) {
    this.materials = materials(lite);
    /** @type {Textures | null} the procedural textures it was dressed with */
    this.tex = null;
    this.group = new THREE.Group();
    this.group.name = "courtyard";
    /** @type {Trees | null} */
    this.trees = null;
  }

  /** Merge one material's geometries into a mesh. @param {string} key @param {THREE.BufferGeometry[]} list */
  #merge(key, list) {
    const indexed = list.every((g) => g.index);
    const geo = mergeGeometries(indexed ? list : list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this.materials[key]);
    mesh.name = `courtyard.${key}`;
    mesh.matrixAutoUpdate = false;
    if (key === "hills") mesh.userData.noShadow = true;
    this.group.add(mesh);
  }

  /**
   * Add texture detail once the procedural textures exist. The walls and
   * roofs get every slot a photographed set fills (photo), with stand-ins,
   * so the photos go on later without new programs.
   * @param {Textures} tex
   */
  dress(tex) {
    const m = this.materials;
    this.tex = tex;
    for (const k of /** @type {const} */ (["roofYellow", "roofGray", "roofGreen"])) {
      m[k].map = tex.tiles;
      m[k].normalMap = tex.tilesNormal;
      m[k].roughnessMap = tex.tilesRough;
      m[k].aoMap = BLANK.arm;
    }
    for (const k of /** @type {const} */ (["wallRed", "dougong"])) {
      m[k].map = BLANK.white;
      m[k].normalMap = BLANK.flat;
      m[k].roughnessMap = BLANK.arm;
      m[k].aoMap = BLANK.arm;
    }
    m.marble.map = tex.stone;
    m.marble.roughnessMap = tex.stoneRough;
    for (const mat of Object.values(m)) mat.needsUpdate = true;
  }

  /**
   * Weather the walls, lacquer, roofs, stone and bronze (aging.js). Before
   * the courtyard is compiled. @param {THREE.Texture} noise texgen.js clouds
   */
  age(noise) {
    const m = this.materials;
    age(m.wallRed, "plaster", noise);
    for (const k of /** @type {const} */ (["column", "panel", "hallDoor", "gateDoor"])) age(m[k], "lacquer", noise);
    for (const k of /** @type {const} */ (["roofYellow", "roofGray", "roofGreen"])) age(m[k], "roof", noise);
    age(m.marble, "stone", noise);
    age(m.bronze, "bronze", noise);
    age(m.gold, "gold", noise);
  }

  /**
   * Swap a photographed set in (photo.js), keeping each material's average
   * colour (the bracket band brings its own paint). Only textures and
   * uniforms change: nothing recompiles.
   * @param {"plaster" | "roof" | "dougong"} name @param {PhotoSet} set
   */
  photo(name, set) {
    const m = this.materials;
    if (name === "dougong") {
      // u counts modules, v runs up the band: no repeat of its own
      const mat = m.dougong;
      mat.color.set(0xffffff);
      mat.map = set.albedo;
      mat.normalMap = set.normal;
      if (set.arm) {
        mat.roughnessMap = set.arm;
        mat.aoMap = set.arm;
      }
      mat.roughness = 1;
      return;
    }
    const keys = name === "plaster" ? /** @type {const} */ (["wallRed"]) : /** @type {const} */ (["roofYellow", "roofGray", "roofGreen"]);
    // what the material's colour was multiplied by before: white, or the procedural tiles
    const was = name === "plaster" ? new THREE.Color(1, 1, 1) : meanOf(/** @type {Textures} */ (this.tex).tiles);
    const k = new THREE.Color(was.r / set.mean.r, was.g / set.mean.g, was.b / set.mean.b);
    // the plaster scan is 2 m square, walls carry 0.05–0.1 uv per chi; the
    // baked roof tiles span TILE.span chi, the roofs carry UV_PER_CHI
    const repeat = name === "plaster" ? 2 : TILE_REPEAT;
    for (const t of [set.albedo, set.normal, set.arm]) t?.repeat.set(repeat, repeat);
    for (const key of keys) {
      const mat = m[key];
      mat.color.multiply(k);
      mat.map = set.albedo;
      mat.normalMap = set.normal;
      if (set.arm) {
        mat.roughnessMap = set.arm;
        mat.aoMap = set.arm;
      }
      // the set's roughness is absolute, not a multiplier (the baked tiles' glaze is in it)
      mat.roughness = 1;
    }
  }

  /**
   * The gate (landmark.js) in the courtyard's roof, bracket and eave
   * materials, so it weathers and takes the photographed sets with them.
   * @param {THREE.Object3D} gate
   */
  dressGate(gate) {
    const m = /** @type {Record<string, THREE.MeshStandardMaterial>} */ (this.materials);
    gate.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const key = o.material.userData.yard;
      if (key && m[key]) o.material = m[key];
    });
  }

  /** The meshes that cast baked shadows (all but the hills). */
  casters() {
    return this.group.children.filter((o) => !o.userData.noShadow);
  }
}

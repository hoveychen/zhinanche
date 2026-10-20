// The courtyard round the driving area: a palace hall on a stone terrace to the
// north, side halls east and west, red walls with glazed copings, a marble
// balustrade along the south edge with steps in the middle, trees and a ring
// of far hills. The whole south is kept low and open (balustrade ≤ 4 chi,
// hills under ~3°) so a landmark far to the south stays in view.
// All static; merged by material into a dozen draw calls; no shadows (the
// sun's shadow map only covers the chariot).
// Units: chi. South = +z, east = +x.

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/** @import { Textures } from "./materials.js" */

/** Courtyard extents (chi): open area the chariot drives in. */
export const YARD = { west: -185, east: 185, north: -230, south: 150, stairHalf: 20 };

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
class Bucket {
  constructor() {
    /** @type {Map<string, THREE.BufferGeometry[]>} */
    this.parts = new Map();
  }

  /**
   * @param {string} key @param {THREE.BufferGeometry} g
   * @param {boolean} [indexed] keep the index (every geometry under this key must be indexed)
   */
  add(key, g, indexed = false) {
    let geo = g.index && !indexed ? g.toNonIndexed() : g;
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
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg);
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
 * @param {Bucket} b @param {string} key
 * @param {{cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, lift: number, tMax?: number}} o
 *   hx, hz: half size at the eave line; y0 eave height, y1 ridge height
 */
function hipRoof(b, key, o) {
  const n = 7, m = 10;
  const tMax = o.tMax ?? 1;
  // Built along x; a roof that is longer along z is built swapped.
  const swap = o.hz > o.hx;
  const HX = swap ? o.hz : o.hx, HZ = swap ? o.hx : o.hz;
  const ridgeHalf = Math.max(0, HX - HZ);
  /** @param {number} t @param {number} e 0..1 along the side @param {number} side 0..3 */
  const point = (t, e, side) => {
    const hz = HZ * (1 - t), hx = ridgeHalf + (HX - ridgeHalf) * (1 - t);
    const s = 2 * e - 1;
    const x = side === 0 ? s * hx : side === 2 ? -s * hx : side === 1 ? hx : -hx;
    const z = side === 0 ? hz : side === 2 ? -hz : side === 1 ? -s * hz : s * hz;
    const lift = o.lift * (1 - t) ** 2 * Math.abs(s) ** 4;
    const y = o.y0 + (o.y1 - o.y0) * t ** 1.7 + lift;
    return swap ? new THREE.Vector3(o.cx + z, y, o.cz + x) : new THREE.Vector3(o.cx + x, y, o.cz + z);
  };
  for (let side = 0; side < 4; side++) {
    const pos = [], uv = [], idx = [];
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * tMax;
      for (let j = 0; j <= m; j++) {
        const e = j / m;
        const p = point(t, e, side);
        pos.push(p.x, p.y, p.z);
        const len = side % 2 === 0 ? 2 * HX : 2 * HZ;
        uv.push(e * len * 0.12, point(0, e, side).distanceTo(p) * 0.12);
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
  }
  if (tMax >= 1) {
    // ridge beam with upturned ends
    const y = o.y1, L = ridgeHalf + 0.6;
    /** @param {number} a0 @param {number} y0 @param {number} c0 @param {number} a1 @param {number} y1 @param {number} c1 */
    const box = (a0, y0, c0, a1, y1, c1) => (swap
      ? b.box(key, [o.cx + c0, y0, o.cz + a0], [o.cx + c1, y1, o.cz + a1])
      : b.box(key, [o.cx + a0, y0, o.cz + c0], [o.cx + a1, y1, o.cz + c1]));
    box(-L, y - 0.6, -0.9, L, y + 1.6, 0.9);
    if (o.lift > 0) for (const sx of [-1, 1]) box(sx * (ridgeHalf + 0.2) - 1, y, -0.8, sx * (ridgeHalf + 0.2) + 1, y + 4.2, 0.8);
  }
}

/**
 * A hall: terrace, columns, walls, painted bracket band, roof.
 * @param {Bucket} b
 * @param {{cx: number, cz: number, w: number, d: number, base: number, h: number, roof: string, double?: boolean, face?: "s" | "e" | "w"}} o
 *   w along the front, d deep; the front (steps, doors) faces south, east or west
 */
function hall(b, o) {
  const face = o.face ?? "s";
  // local (x along the front, z towards the front) → world offset
  const sw = (/** @type {number} */ x, /** @type {number} */ z) => (face === "s" ? [x, z] : face === "e" ? [z, x] : [-z, x]);
  /** @param {string} key @param {number} x0 @param {number} y0 @param {number} z0 @param {number} x1 @param {number} y1 @param {number} z1 */
  const box = (key, x0, y0, z0, x1, y1, z1) => {
    const [a0, c0] = sw(x0, z0), [a1, c1] = sw(x1, z1);
    b.box(key, [o.cx + Math.min(a0, a1), y0, o.cz + Math.min(c0, c1)], [o.cx + Math.max(a0, a1), y1, o.cz + Math.max(c0, c1)]);
  };
  const W = o.w / 2, D = o.d / 2, y0 = o.base, y1 = o.base + o.h;
  // terrace with a moulded lip, and steps on the courtyard side (+z before rot)
  box("marble", -W - 8, 0, -D - 8, W + 8, y0 - 0.6, D + 8);
  box("marble", -W - 8.6, y0 - 0.6, -D - 8.6, W + 8.6, y0, D + 8.6);
  const steps = Math.max(2, Math.round(y0 / 1.2));
  for (let k = 0; k < steps; k++) {
    const h = y0 * (1 - k / steps), out = D + 8.6 + (k + 1) * 1.6;
    box("marble", -Math.min(14, W * 0.3), 0, D + 8.6, Math.min(14, W * 0.3), h, out);
  }
  // body: walls set back, lattice doors along the front, columns in front
  box("wallRed", -W + 2, y0, -D + 2, W - 2, y1, D - 2);
  box("panel", -W + 4, y0 + 0.4, D - 2.2, W - 4, y1 - 3.2, D - 1.6);
  const bays = Math.max(3, Math.round(o.w / 12));
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
  // architrave and the painted bracket band under the eaves
  box("column", -W - 1, y1 - 1.6, -D - 1, W + 1, y1, D + 1);
  box("bracket", -W - 1.8, y1, -D - 1.8, W + 1.8, y1 + 2.4, D + 1.8);
  const rot = face !== "s";
  const [hx, hz] = rot ? [D + 8, W + 8] : [W + 8, D + 8];
  if (o.double) {
    hipRoof(b, o.roof, { cx: o.cx, cz: o.cz, hx, hz, y0: y1 + 1.6, y1: y1 + 10, lift: 2.4, tMax: 0.42 });
    const up = y1 + 6.5;
    const [ux, uz] = rot ? [D * 0.8, W * 0.8] : [W * 0.8, D * 0.8];
    b.box("wallRed", [o.cx - ux, y1 + 2, o.cz - uz], [o.cx + ux, up + 4, o.cz + uz]);
    b.box("bracket", [o.cx - ux - 1, up + 2.4, o.cz - uz - 1], [o.cx + ux + 1, up + 4.6, o.cz + uz + 1]);
    hipRoof(b, o.roof, { cx: o.cx, cz: o.cz, hx: ux + 7, hz: uz + 7, y0: up + 4, y1: up + 4 + (uz + 7) * 0.9, lift: 2.6 });
  } else {
    hipRoof(b, o.roof, { cx: o.cx, cz: o.cz, hx, hz, y0: y1 + 1.6, y1: y1 + 1.6 + hz * 0.85, lift: 2 });
  }
}

/** A red wall with a stone plinth and a glazed coping. Along x or z. @param {Bucket} b @param {number[]} p0 @param {number[]} p1 */
function wall(b, p0, p1) {
  const [x0, z0] = p0, [x1, z1] = p1, t = 1.6, h = 15;
  const lo = [Math.min(x0, x1) - t, 0, Math.min(z0, z1) - t], hi = [Math.max(x0, x1) + t, 0, Math.max(z0, z1) + t];
  b.box("marble", [lo[0] - 0.4, 0, lo[2] - 0.4], [hi[0] + 0.4, 2.4, hi[2] + 0.4]);
  b.box("wallRed", [lo[0], 2.4, lo[2]], [hi[0], h, hi[2]], 0.05);
  b.box("bracket", [lo[0] - 0.3, h - 0.9, lo[2] - 0.3], [hi[0] + 0.3, h, hi[2] + 0.3]);
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = alongX ? Math.abs(x1 - x0) / 2 + t + 1.5 : Math.abs(z1 - z0) / 2 + t + 1.5;
  // the coping is a little gable roof; build as a hip roof with no hips
  hipRoof(b, "roofYellow", alongX
    ? { cx, cz, hx: half + 3.4, hz: 3.4, y0: h, y1: h + 2.8, lift: 0 }
    : { cx, cz, hx: 3.4, hz: half + 3.4, y0: h, y1: h + 2.8, lift: 0 });
}

/** Marble balustrade along z = const from x0 to x1. @param {Bucket} b @param {number} z @param {number} x0 @param {number} x1 */
function balustrade(b, z, x0, x1) {
  const step = 6;
  const n = Math.max(1, Math.round((x1 - x0) / step));
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n;
    b.box("marble", [x - 0.55, 0, z - 0.55], [x + 0.55, 4.2, z + 0.55]);
    b.box("marble", [x - 0.7, 4.2, z - 0.7], [x + 0.7, 4.9, z + 0.7]);
  }
  b.box("marble", [x0, 3.1, z - 0.32], [x1, 3.6, z + 0.32]);
  b.box("marble", [x0, 0.5, z - 0.18], [x1, 2.9, z + 0.18]);
  b.box("marble", [x0 - 1, 0, z - 1.2], [x1 + 1, 0.5, z + 1.2]);
}

/** @type {THREE.BufferGeometry | null} */
let clump = null;
/** A welded unit icosphere (IcosahedronGeometry comes unindexed with flat normals). */
function clumpTemplate() {
  clump ??= mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute("uv").deleteAttribute("normal"));
  return clump;
}

/**
 * Cypress-ish tree: trunk and a crown of ragged clumps, darker underneath.
 * @param {Bucket} b @param {number} x @param {number} z @param {number} h @param {number} seed
 * @param {boolean} [near] inside the yard: more and finer clumps
 */
function tree(b, x, z, h, seed, near = false) {
  const r = rand(seed);
  b.column("trunk", x, z, 0, h * 0.5, h * 0.03, 7);
  const clumps = near ? 24 : 16;
  const top = h * 1.02, bottom = h * 0.36;
  const tint = 0.85 + 0.25 * r();
  for (let k = 0; k < clumps; k++) {
    const t = k < 4 ? 0.15 + 0.2 * k : r();
    const y = bottom + (top - bottom) * t;
    const spread = h * 0.13 * (1 - 0.65 * t);
    const a = r() * Math.PI * 2;
    const d = k < 4 ? 0 : spread * (0.55 + 0.45 * r());
    const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
    const small = near ? 1 : 1.25;
    const rad = h * small * (k < 4 ? 0.13 - 0.06 * t : 0.09 - 0.045 * t) * (0.85 + 0.3 * r());
    const g = clumpTemplate().clone();
    const p = g.getAttribute("position");
    const ph = r() * 10;
    // Ragged leaf-spray surface: two octaves of bumps, no smooth "boulder".
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
      const n1 = Math.sin(X * 4.1 + ph) * Math.sin(Y * 3.7 - ph) * Math.sin(Z * 4.3 + 2 * ph);
      const n2 = Math.sin(X * 11.3 - ph) * Math.sin(Y * 9.7 + ph) * Math.sin(Z * 10.9);
      const s = rad * (0.9 + 0.22 * n1 + 0.14 * n2);
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
    }
    g.computeVertexNormals();
    g.translate(cx, y, cz);
    // Light falls off into the crown and towards its base (cheap ambient occlusion).
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const up = (p.getY(i) - bottom) / (top - bottom);
      const out = Math.hypot(p.getX(i) - x, p.getZ(i) - z) / (h * 0.25);
      const v = Math.min(1.15, (0.4 + 0.45 * up + 0.3 * Math.min(1, out)) * tint * (0.8 + 0.3 * r()));
      col.set([v * 0.95, v, v * 0.9], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    b.add("leaves", g, true);
  }
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

/** Ring of far hills, lower to the south. @param {Bucket} b */
function hills(b) {
  const pos = [];
  const N = 160;
  const r = rand(77);
  /** @type {number[]} */
  const hs = [];
  for (let i = 0; i <= N; i++) hs.push(r());
  for (let i = 0; i < N; i++) {
    for (const [ring, R, H] of [[0, 700, 70], [1, 1000, 130]]) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      /** @param {number} a @param {number} k */
      const height = (a, k) => {
        const south = Math.max(0, Math.cos(a)); // a = 0 → +z (south)
        const wave = 0.55 + 0.25 * Math.sin(a * 5 + ring * 2) + 0.2 * Math.sin(a * 13 + ring) + 0.25 * hs[(k + ring * 37) % N];
        return H * wave * (1 - 0.75 * south ** 2);
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

/** @returns {Record<string, THREE.MeshStandardMaterial>} */
function materials() {
  /** @param {number} color @param {number} roughness @param {object} [extra] */
  const M = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  return {
    marble: M(0xd9d4ca, 0.75),
    wallRed: M(0x9a3426, 0.92),
    panel: M(0x5e1d16, 0.7),
    column: M(0x8f2318, 0.55),
    bracket: M(0x2f6458, 0.7),
    roofYellow: M(0xd6a02c, 0.38, { side: THREE.DoubleSide }),
    leaves: M(0x2b4425, 0.85, { vertexColors: true }),
    trunk: M(0x4a3626, 0.95),
    bronze: M(0x7a6a45, 0.45, { metalness: 0.9 }),
    hills: M(0x7d8c86, 1, { flatShading: true }),
  };
}

export class Courtyard {
  constructor() {
    const b = new Bucket();
    const Y = YARD;
    // north: the main hall, double eaves, two cauldrons before the steps
    hall(b, { cx: 0, cz: -195, w: 124, d: 34, base: 7, h: 19, roof: "roofYellow", double: true });
    cauldron(b, -26, -150);
    cauldron(b, 26, -150);
    // east and west halls facing the yard
    hall(b, { cx: 150, cz: -50, w: 90, d: 34, base: 3.5, h: 15, roof: "roofYellow", face: "w" });
    hall(b, { cx: -150, cz: -50, w: 90, d: 34, base: 3.5, h: 15, roof: "roofYellow", face: "e" });
    // walls: north, and east/west down to the south edge
    wall(b, [Y.west, Y.north], [Y.east, Y.north]);
    wall(b, [Y.west, Y.north], [Y.west, Y.south]);
    wall(b, [Y.east, Y.north], [Y.east, Y.south]);
    // south: open, a low balustrade with steps down in the middle
    balustrade(b, Y.south, Y.west + 2, -Y.stairHalf);
    balustrade(b, Y.south, Y.stairHalf, Y.east - 2);
    // trees: inside the north corners, and beyond the walls
    const r = rand(5);
    for (const [x, z, h] of [[-112, -140, 44], [112, -140, 46], [-92, -150, 36], [92, -152, 38]]) tree(b, x, z, h, Math.floor(r() * 1e6), true);
    for (let k = 0; k < 26; k++) {
      const side = k % 2 ? 1 : -1;
      const x = side * (215 + r() * 120), z = -260 + r() * 330;
      tree(b, x, z, 40 + r() * 30, Math.floor(r() * 1e6));
    }
    for (let k = 0; k < 14; k++) tree(b, -170 + r() * 340, -260 - r() * 90, 45 + r() * 30, Math.floor(r() * 1e6));
    hills(b);

    this.materials = materials();
    this.group = new THREE.Group();
    this.group.name = "courtyard";
    for (const [key, list] of b.parts) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, this.materials[key]);
      mesh.name = `courtyard.${key}`;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
  }

  /** Add texture detail once the procedural textures exist. @param {Textures} tex */
  dress(tex) {
    const m = this.materials;
    m.roofYellow.map = tex.tiles;
    m.roofYellow.normalMap = tex.tilesNormal;
    m.roofYellow.roughnessMap = tex.tilesRough;
    for (const k of /** @type {const} */ (["marble", "wallRed"])) {
      m[k].map = tex.metal;
      m[k].roughnessMap = tex.metalRough;
    }
    m.column.map = tex.woodSoft;
    m.panel.map = tex.wood;
    for (const mat of Object.values(m)) mat.needsUpdate = true;
  }
}

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

/** @import { Textures } from "./materials.js" */

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
    // ridge beam with upturned ends (dark glazed)
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
  const rot = face === "e" || face === "w";
  const [hx, hz] = rot ? [D + 8, W + 8] : [W + 8, D + 8];
  if (o.double) {
    hipRoof(b, o.roof, { cx: o.cx, cz: o.cz, hx, hz, y0: y1 + 1.6, y1: y1 + 10, lift: 2.4, tMax: 0.42 });
    const up = y1 + 6.5;
    const [ux, uz] = rot ? [D * 0.8, W * 0.8] : [W * 0.8, D * 0.8];
    b.box("wallRed", [o.cx - ux, y1 + 2, o.cz - uz], [o.cx + ux, up + 4, o.cz + uz]);
    b.box("bracket", [o.cx - ux - 1, up + 2.4, o.cz - uz - 1], [o.cx + ux + 1, up + 4.6, o.cz + uz + 1]);
    hipRoof(b, o.roof, { cx: o.cx, cz: o.cz, hx: ux + 7, hz: uz + 7, y0: up + 4, y1: up + 4 + Math.min(ux, uz, 14) * 0.9 + 4, lift: 2.6 });
  } else {
    hipRoof(b, o.roof, { cx: o.cx, cz: o.cz, hx, hz, y0: y1 + 1.6, y1: y1 + 1.6 + Math.min(hx, hz) * 0.85, lift: 2 });
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
    ? { cx, cz, hx: half + 3.4, hz: 3.4, y0: h, y1: h + 2.8, lift: 0 }
    : { cx, cz, hx: 3.4, hz: half + 3.4, y0: h, y1: h + 2.8, lift: 0 });
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
  const hole = new THREE.ShapeGeometry(shape(w / 2, h), 12);
  hole.rotateY(Math.PI);
  hole.translate(x, 0, z - 0.12);
  b.add("doorDark", hole);
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
  b.box("bracket", [lo(62.6, 75), 12.2, z0], [hi(62.6, 75), 13.6, z1]);
  // lean-to roof: eave at 60, ridge over the back wall, slightly sagging
  const pos = [], uv = [], idx = [];
  const m = 6;
  for (let i = 0; i <= m; i++) {
    const t = i / m;
    const x = X(59.5 + t * (78.5 - 59.5));
    const y = 13.2 + 5.6 * t ** 1.4;
    for (const z of [z0 - 1.5, z1 + 1.5]) {
      pos.push(x, y, z);
      uv.push((z - z0) * 0.12, t * 19 * 0.12);
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
 * Pine / cypress: trunk and a crown of ragged clumps, darker underneath.
 * @param {Bucket} b @param {number} x @param {number} z @param {number} h @param {number} seed
 * @param {boolean} [near] inside the yard: more and finer clumps
 */
function tree(b, x, z, h, seed, near = false) {
  const r = rand(seed);
  // A trunk that leans a little, so the tiers step sideways as they rise.
  const lean = r() * Math.PI * 2, leanBy = h * 0.05 * r();
  const at = (/** @type {number} */ t) => [x + Math.cos(lean) * leanBy * t, z + Math.sin(lean) * leanBy * t];
  const trunk = new THREE.CylinderGeometry(h * 0.018, h * 0.032, h * 0.92, 7, 1, true);
  trunk.translate(0, h * 0.46, 0);
  const tp = trunk.getAttribute("position");
  for (let i = 0; i < tp.count; i++) {
    const [dx, dz] = at(tp.getY(i) / h);
    tp.setXYZ(i, tp.getX(i) + dx, tp.getY(i), tp.getZ(i) + dz);
  }
  b.add("trunk", trunk);
  // The crown: tiers of flattened foliage pads (an old palace pine / cypress),
  // lit on top and dark underneath, so it reads as layers, not as one blob.
  const tiers = near ? 8 : 6;
  const bottom = h * 0.34, top = h * 1.0;
  const tint = 0.85 + 0.3 * r();
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const y = bottom + (top - bottom) * t + h * 0.03 * (r() - 0.5);
    const reach = h * (0.25 - 0.16 * t) * (0.8 + 0.4 * r());
    const pads = t > 0.85 ? 1 : 3 + Math.floor(r() * 2);
    const a0 = r() * Math.PI * 2;
    const [tx, tz] = at(y / h);
    for (let j = 0; j < pads; j++) {
      const a = a0 + (j / pads) * Math.PI * 2 + 0.6 * (r() - 0.5);
      const d = pads === 1 ? 0 : reach * (0.4 + 0.3 * r());
      const rad = reach * (pads === 1 ? 0.85 : 0.66) * (0.85 + 0.3 * r());
      const g = lump(rad, r() * 10, 1.3, near ? 2 : 1);
      g.scale(1.15, 0.5 + 0.15 * r(), 1.15);
      const p = g.getAttribute("position");
      const col = new Float32Array(p.count * 3);
      const hy = rad * 0.6;
      for (let i = 0; i < p.count; i++) {
        const up = Math.max(0, Math.min(1, p.getY(i) / hy * 0.5 + 0.5));
        const v = Math.min(1.25, (0.25 + 0.85 * up * up + 0.15 * t) * tint * (0.85 + 0.25 * r()));
        col.set([v * 0.9, v, v * 0.78], i * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.translate(tx + Math.cos(a) * d, y, tz + Math.sin(a) * d);
      b.add("leaves", g, true);
    }
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
  hipRoof(b, "roofYellow", { cx, cz, hx: w / 2 + 6, hz: d / 2 + 6, y0, y1: y0 + (d / 2 + 6) * 0.8, lift: 2 });
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

/** @returns {Record<string, THREE.MeshStandardMaterial>} */
function materials() {
  /** @param {number} color @param {number} roughness @param {object} [extra] */
  const M = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  return {
    marble: M(0xdcd6cb, 0.72),
    wallRed: M(0xa3392a, 0.9),
    panel: M(0x5e1d16, 0.7),
    column: M(0x9a2618, 0.55),
    bracket: M(0x2c6a5f, 0.7),
    roofYellow: M(0xe0a62a, 0.34, { side: THREE.DoubleSide }),
    roofGray: M(0x4b5354, 0.6, { side: THREE.DoubleSide }),
    leaves: M(0x2d5226, 0.85, { vertexColors: true }),
    trunk: M(0x4a3626, 0.95),
    bronze: M(0x6b5634, 0.38, { metalness: 0.85 }),
    gold: M(0xd2a443, 0.3, { metalness: 1 }),
    lantern: M(0xc42a18, 0.55, { emissive: 0xff5a2a, emissiveIntensity: 0.35 }),
    doorDark: M(0x1a1310, 0.95),
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
  // pines in the corners of the court
  const r = rand(5);
  for (const [x, z, h] of [[-50, 196, 36], [52, 190, 40], [-52, -112, 34], [50, -108, 32]]) tree(b, x, z, h, Math.floor(r() * 1e6), true);
  // beyond the walls: tree crowns, far roofs
  const outer = lite ? 18 : 40;
  for (let k = 0; k < outer; k++) {
    const t = k / outer;
    if (t < 0.45) {
      // south, behind the gate wall
      const x = (r() < 0.5 ? -1 : 1) * (48 + r() * 170), z = C.south + 25 + r() * 120;
      tree(b, x, z, 34 + r() * 20, Math.floor(r() * 1e6));
    } else {
      const side = k % 2 ? 1 : -1;
      tree(b, side * (95 + r() * 110), -230 + r() * 420, 36 + r() * 24, Math.floor(r() * 1e6));
    }
    if (k % 8 === 7) yield;
  }
  farHall(b, -150, 360, 80, 34, 22);
  farHall(b, 165, 420, 90, 36, 24);
  farHall(b, 30, 560, 120, 40, 30);
  farHall(b, -200, -320, 90, 34, 22);
  farHall(b, 190, -300, 70, 30, 20);
  hills(b);
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
    const yard = new Courtyard();
    // merging is a good share of the work too: one material's meshes per slice
    for (const [key, list] of b.parts) {
      await pause();
      yard.#merge(key, list);
    }
    return yard;
  }

  /** Empty: use Courtyard.build. */
  constructor() {
    this.materials = materials();
    this.group = new THREE.Group();
    this.group.name = "courtyard";
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

  /** Add texture detail once the procedural textures exist. @param {Textures} tex */
  dress(tex) {
    const m = this.materials;
    for (const k of /** @type {const} */ (["roofYellow", "roofGray"])) {
      m[k].map = tex.tiles;
      m[k].normalMap = tex.tilesNormal;
      m[k].roughnessMap = tex.tilesRough;
    }
    m.marble.map = tex.stone;
    m.marble.roughnessMap = tex.stoneRough;
    for (const mat of Object.values(m)) mat.needsUpdate = true;
  }

  /** The meshes that cast baked shadows (all but the hills). */
  casters() {
    return this.group.children.filter((o) => !o.userData.noShadow);
  }
}

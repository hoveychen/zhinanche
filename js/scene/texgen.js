// Procedural textures for the realistic look: wood grain, brass and iron,
// courtyard stone slabs, glazed roof tiles, clouds. Pure functions on typed
// arrays (no three.js, no DOM) so they run in a worker (texgen.worker.js) and
// in node tests. Every texture tiles seamlessly: all noise is periodic over
// the texture. Nothing is downloaded; generating the set takes ~100 ms.

/**
 * @typedef {object} Tex
 * @property {number} size width = height, a power of two
 * @property {Uint8Array} data RGBA, row 0 = v 0
 */

/** @typedef {Record<string, Tex>} TexSet */

/** Integer hash → [0, 1). @param {number} a @param {number} b @param {number} seed */
function hash(a, b, seed) {
  let h = (Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(seed + 1, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Periodic value noise on a px × py lattice; sample with x, y in lattice units. */
class Lattice {
  /** @param {number} px @param {number} py @param {number} seed */
  constructor(px, py, seed) {
    this.px = px;
    this.py = py;
    this.v = new Float32Array(px * py);
    for (let j = 0; j < py; j++) for (let i = 0; i < px; i++) this.v[j * px + i] = hash(i, j, seed);
  }

  /** @param {number} x @param {number} y */
  at(x, y) {
    const { px, py, v } = this;
    const fx = Math.floor(x), fy = Math.floor(y);
    let tx = x - fx, ty = y - fy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const i0 = ((fx % px) + px) % px, j0 = ((fy % py) + py) % py;
    const i1 = (i0 + 1) % px, j1 = (j0 + 1) % py;
    const a = v[j0 * px + i0], b = v[j0 * px + i1], c = v[j1 * px + i0], d = v[j1 * px + i1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
}

/**
 * Fractal noise in [0, 1], periodic over the unit square.
 * @param {number} fx base lattice cells along u @param {number} fy along v
 * @param {number} octaves @param {number} seed
 */
function fbm(fx, fy, octaves, seed) {
  /** @type {Lattice[]} */
  const ls = [];
  for (let o = 0; o < octaves; o++) ls.push(new Lattice(fx << o, fy << o, seed * 131 + o));
  let norm = 0;
  for (let o = 0; o < octaves; o++) norm += 0.5 ** o;
  /** @param {number} u @param {number} v */
  return (u, v) => {
    let s = 0, amp = 1;
    for (let o = 0; o < octaves; o++) {
      const l = ls[o];
      s += amp * l.at(u * l.px, v * l.py);
      amp *= 0.5;
    }
    return s / norm;
  };
}

/** @param {number} a @param {number} b @param {number} x */
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** @param {number} x */
const byte = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));

/** @param {number} size */
const blank = (size) => /** @type {Tex} */ ({ size, data: new Uint8Array(size * size * 4) });

/**
 * Tangent-space normal map from a height field (wrapping at the edges).
 * @param {Float32Array} h heights, row-major
 * @param {number} size
 * @param {number} strength slope scale
 */
export function normalFromHeight(h, size, strength) {
  const t = blank(size);
  const m = size - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h[y * size + ((x + 1) & m)] - h[y * size + ((x - 1) & m)]) * strength;
      const dy = (h[((y + 1) & m) * size + x] - h[((y - 1) & m) * size + x]) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      t.data[o] = byte(0.5 - 0.5 * dx * inv);
      t.data[o + 1] = byte(0.5 - 0.5 * dy * inv);
      t.data[o + 2] = byte(0.5 + 0.5 * inv);
      t.data[o + 3] = 255;
    }
  }
  return t;
}

/**
 * Wood: grain runs along u. One tile is about 2 × 2 chi of plank.
 * `wood` is full-contrast (bare, oiled wood), `woodSoft` is the same grain at
 * low contrast for painted and lacquered parts. Roughness sits in G
 * (three.js reads roughnessMap.g) as a multiplier around 1.
 * @param {number} size
 */
export function wood(size = 512) {
  const warp = fbm(2, 3, 3, 11);
  const fine = fbm(4, 8, 3, 12);
  const pores = new Lattice(6, 256, 13);
  const pores2 = new Lattice(12, 128, 14);
  const figure = fbm(2, 4, 3, 15);
  // Long streaks along the grain: what still reads as wood from a distance.
  const streak = fbm(1, 6, 3, 17);
  const rings = 24;
  const albedo = blank(size), soft = blank(size), rough = blank(size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const t = v * rings + 3.2 * (warp(u, v) - 0.5) + 0.35 * (fine(u, v) - 0.5);
      const ring = Math.floor(t), r = t - ring;
      // Growth ring: pale earlywood, then a narrow dark latewood band with a sharp end.
      const late = smooth(0.62, 0.86, r) * (1 - smooth(0.93, 0.99, r));
      const ringTone = hash(((ring % rings) + rings) % rings, 1, 16) - 0.5;
      const p = Math.max(pores.at(u * 6, v * 256), 0.85 * pores2.at(u * 12, v * 128));
      const pore = smooth(0.7, 0.92, p) * (1 - 0.6 * late);
      const f = figure(u, v) - 0.5;
      const st = streak(u, v) - 0.5;
      const g = 0.88 - 0.3 * late - 0.1 * pore + 0.14 * f + 0.06 * ringTone + 0.3 * st;
      const gs = 0.93 - 0.08 * late - 0.03 * pore + 0.04 * f + 0.02 * ringTone + 0.1 * st;
      const i = y * size + x, o = i * 4;
      albedo.data[o] = byte(g);
      albedo.data[o + 1] = byte(g * 0.97);
      albedo.data[o + 2] = byte(g * 0.93);
      albedo.data[o + 3] = 255;
      soft.data[o] = soft.data[o + 1] = soft.data[o + 2] = byte(gs);
      soft.data[o + 3] = 255;
      rough.data[o] = 255;
      rough.data[o + 1] = byte(0.82 + 0.18 * pore - 0.1 * late);
      rough.data[o + 2] = 0;
      rough.data[o + 3] = 255;
      height[i] = 0.5 * late - 0.8 * pore + 0.15 * f;
    }
  }
  return { wood: albedo, woodSoft: soft, woodRough: rough, woodNormal: normalFromHeight(height, size, 2.2) };
}

/**
 * Cast and worked metal: smudges, fine scratches along u, a little tarnish.
 * Albedo is a near-white multiplier; roughness multiplier in G.
 * @param {number} size
 */
export function metal(size = 256) {
  const smudge = fbm(3, 3, 4, 21);
  const scratch = new Lattice(3, 128, 22);
  const pits = new Lattice(64, 64, 23);
  const albedo = blank(size), rough = blank(size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const s = smudge(u, v);
      const sc = smooth(0.7, 0.95, scratch.at(u * 3, v * 128));
      const pit = smooth(0.82, 0.97, pits.at(u * 64, v * 64));
      const i = y * size + x, o = i * 4;
      const g = 0.86 + 0.14 * s - 0.25 * pit;
      albedo.data[o] = albedo.data[o + 1] = albedo.data[o + 2] = byte(g);
      albedo.data[o + 3] = 255;
      rough.data[o] = 255;
      rough.data[o + 1] = byte(0.62 + 0.5 * smooth(0.35, 0.8, s) - 0.25 * sc + 0.3 * pit);
      rough.data[o + 2] = 0;
      rough.data[o + 3] = 255;
      height[i] = 0.4 * sc - 0.8 * pit;
    }
  }
  return { metal: albedo, metalRough: rough, metalNormal: normalFromHeight(height, size, 1.2) };
}

/** Slab layout of one stone tile: rows of slabs, widths from a seeded list. */
const STONE_TILE = 12; // chi per tile
const STONE_ROWS = [2.5, 3.5, 3, 3];

/** @param {number} seed */
function slabRows(seed) {
  let k = 0;
  /** @type {{y0: number, y1: number, edges: number[], shift: number}[]} */
  const rows = [];
  let y = 0;
  for (const h of STONE_ROWS) {
    const edges = [0];
    let x = 0;
    while (x < STONE_TILE) {
      const left = STONE_TILE - x;
      let w = [2, 2.5, 3, 3.5, 4][Math.floor(hash(k++, 7, seed) * 5)];
      if (left - w < 2) w = left;
      x += w;
      edges.push(x);
    }
    rows.push({ y0: y, y1: y + h, edges, shift: Math.floor(hash(k++, 9, seed) * 8) * 0.5 });
    y += h;
  }
  return rows;
}

/**
 * Courtyard paving: weathered grey stone slabs in courses, dark joints,
 * chipped arrises. One tile is 12 × 12 chi. Albedo, roughness (G), normal.
 * @param {number} size
 */
export function stone(size = 1024) {
  const rows = slabRows(5);
  const mottle = fbm(6, 6, 4, 31);
  const grit = new Lattice(192, 192, 32);
  const chip = fbm(48, 48, 2, 33);
  const stain = fbm(3, 3, 3, 34);
  const albedo = blank(size), rough = blank(size);
  const height = new Float32Array(size * size);
  const px = STONE_TILE / size;
  for (let yy = 0; yy < size; yy++) {
    const y = yy * px, v = yy / size;
    const row = rows.find((r) => y < r.y1) ?? rows[rows.length - 1];
    const dyEdge = Math.min(y - row.y0, row.y1 - y);
    for (let xx = 0; xx < size; xx++) {
      const u = xx / size;
      const xs = (xx * px + row.shift) % STONE_TILE;
      let k = 1;
      while (k < row.edges.length - 1 && xs >= row.edges[k]) k++;
      const dxEdge = Math.min(xs - row.edges[k - 1], row.edges[k] - xs);
      const slabId = k * 17 + Math.round(row.y0) * 5;
      const tone = 0.86 + 0.16 * hash(slabId, 3, 41);
      const warm = hash(slabId, 4, 42) - 0.5;
      const ch = chip(u, v);
      const d = Math.min(dxEdge, dyEdge) - 0.05 * (ch - 0.5) - 0.012;
      const joint = 1 - smooth(0.0, 0.025, d);
      const bevel = smooth(0.0, 0.14, d);
      const m = mottle(u, v), s = stain(u, v);
      const gr = grit.at(u * 192, v * 192);
      let lum = 1.08 * tone * (0.88 + 0.22 * (m - 0.5)) * (1 - 0.12 * smooth(0.55, 0.85, s)) + 0.05 * (gr - 0.5);
      lum = lum * (1 - joint) + 0.58 * joint;
      const i = yy * size + xx, o = i * 4;
      albedo.data[o] = byte(lum * (0.7 + 0.025 * warm));
      albedo.data[o + 1] = byte(lum * 0.675);
      albedo.data[o + 2] = byte(lum * (0.63 - 0.025 * warm));
      albedo.data[o + 3] = 255;
      rough.data[o] = 255;
      rough.data[o + 1] = byte(0.86 + 0.1 * (gr - 0.5) - 0.18 * smooth(0.45, 0.75, m) * (1 - joint) + 0.14 * joint);
      rough.data[o + 2] = 0;
      rough.data[o + 3] = 255;
      height[i] = bevel * (1 + 0.12 * (m - 0.5)) + 0.05 * gr;
    }
  }
  return { stone: albedo, stoneRough: rough, stoneNormal: normalFromHeight(height, size, 9) };
}

/**
 * Glazed roof tiles: channels along v (down the slope), courses every 1/8.
 * Albedo multiplier, roughness (G), normal.
 * @param {number} size
 */
export function tiles(size = 256) {
  const n = fbm(4, 4, 3, 51);
  const albedo = blank(size), rough = blank(size);
  const height = new Float32Array(size * size);
  const cols = 8, courses = 8;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const c = (v * courses) % 1;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const a = (u * cols) % 1;
      const ridge = Math.sin(Math.PI * a);
      const lap = smooth(0.0, 0.12, c);
      const i = y * size + x, o = i * 4;
      const g = (0.78 + 0.22 * ridge) * (0.82 + 0.18 * lap) * (0.92 + 0.16 * (n(u, v) - 0.5));
      albedo.data[o] = albedo.data[o + 1] = albedo.data[o + 2] = byte(g);
      albedo.data[o + 3] = 255;
      rough.data[o] = 255;
      rough.data[o + 1] = byte(0.7 + 0.3 * (1 - ridge) + 0.2 * (n(u, v) - 0.5));
      rough.data[o + 2] = 0;
      rough.data[o + 3] = 255;
      height[i] = 1.2 * Math.sqrt(ridge) + 0.5 * c;
    }
  }
  return { tiles: albedo, tilesRough: rough, tilesNormal: normalFromHeight(height, size, 3) };
}

/**
 * Sky and ground variation: R = clouds (fbm, periodic), G = slow variation
 * for breaking up paving repeats.
 * @param {number} size
 */
export function clouds(size = 256) {
  const c = fbm(4, 4, 6, 61);
  const g = fbm(2, 2, 4, 62);
  const t = blank(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      t.data[o] = byte(c(x / size, y / size));
      t.data[o + 1] = byte(g(x / size, y / size));
      t.data[o + 2] = 0;
      t.data[o + 3] = 255;
    }
  }
  return { clouds: t };
}

/** Everything, by name. @param {"lite" | "full"} [level] */
export function generateAll(level = "full") {
  const big = level === "full";
  return /** @type {TexSet} */ ({
    ...wood(big ? 512 : 256),
    ...metal(256),
    ...stone(big ? 1024 : 512),
    ...tiles(256),
    ...clouds(256),
  });
}

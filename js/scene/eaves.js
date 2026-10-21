// What an eave needs to read as a palace eave and not the edge of a sheet: a
// round tile end (瓦当) at the foot of every row of round tiles, a drip tile
// (滴水) between each two, the fascia board under them (连檐), and under that
// the painted ends of the flying rafters (飞椽, square, green with a gold
// centre) and of the eave rafters (檐椽, round, blue with a white eye).
// Thousands of small pieces, so they are written straight into arrays (no
// three.js geometry per piece); the courtyard merges them with the rest, so
// they cost no draw calls of their own.
//
// The tile ends stand at the foot of the roof texture's rows
// (tools/assets/build_photo.py bakes it: TILE.rows rows across TILE.span chi;
// tests/scene/eaves.test.js checks the two agree). A roof maps u = distance
// along its eave (chi) × UV_PER_CHI and the texture is repeated TILE_REPEAT
// times, so the rows' feet are at distances (k + ½)·PITCH along the eave.

import * as THREE from "three";

/** The baked roof tiles (build_photo.py TILE_*): chi. */
export const TILE = { span: 10, rows: 8, segs: 8, radius: 0.3 };
/** From one row of round tiles to the next (chi). */
export const PITCH = TILE.span / TILE.rows;
/** uv per chi on the courtyard's roofs. */
export const UV_PER_CHI = 0.12;
/** The roof texture's repeat: one texture spans TILE.span chi. */
export const TILE_REPEAT = 1 / (TILE.span * UV_PER_CHI);

/** sRGB hex → linear [r, g, b]. @param {number} hex */
const lin = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const PAINT = {
  fascia: lin(0x8a2e20),
  fly: lin(0x2f5a44),
  flyEye: lin(0xb08b3c),
  round: lin(0x2c4a6e),
  roundEye: lin(0xd8d4c8),
};

const UP = new THREE.Vector3(0, 1, 0);

/** Triangles written into arrays: position, normal and either uv or colour. */
class Pieces {
  /** @param {"uv" | "color"} extra */
  constructor(extra) {
    this.extra = extra;
    /** @type {number[]} */ this.pos = [];
    /** @type {number[]} */ this.nor = [];
    /** @type {number[]} */ this.ext = [];
    /** @type {number[]} */ this.idx = [];
  }

  /** @param {THREE.Vector3} p @param {THREE.Vector3} n @param {number[]} e uv or colour @returns {number} */
  vert(p, n, e) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.ext.push(...e);
    return this.pos.length / 3 - 1;
  }

  /** A triangle facing `towards`. @param {number} a @param {number} b @param {number} c @param {THREE.Vector3} towards */
  tri(a, b, c, towards) {
    const p = this.pos;
    const ab = new THREE.Vector3(p[3 * b] - p[3 * a], p[3 * b + 1] - p[3 * a + 1], p[3 * b + 2] - p[3 * a + 2]);
    const ac = new THREE.Vector3(p[3 * c] - p[3 * a], p[3 * c + 1] - p[3 * a + 1], p[3 * c + 2] - p[3 * a + 2]);
    if (ab.cross(ac).dot(towards) >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  /** A convex fan round its first vertex, facing `towards`. @param {number[]} v @param {THREE.Vector3} towards */
  fan(v, towards) {
    for (let i = 1; i + 1 < v.length; i++) this.tri(v[0], v[i], v[i + 1], towards);
  }

  /** @returns {THREE.BufferGeometry | null} */
  geometry() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute(this.extra, new THREE.Float32BufferAttribute(this.ext, this.extra === "uv" ? 2 : 3));
    g.setIndex(this.idx);
    return g;
  }
}

/**
 * @typedef {object} EaveOpts
 * @property {boolean} [fascia] the fascia board (halls, corridors; not wall copings)
 * @property {boolean} [rafters] the rafter ends under it
 */

/**
 * Collects the eave pieces of a whole court: `tiles` in the roof's own
 * material (their uv picks the glaze of a round tile, or of a pan tile for the
 * drip tiles), `trim` painted (vertex colours).
 */
export class Eaves {
  constructor() {
    this.tiles = new Pieces("uv");
    this.trim = new Pieces("color");
  }

  /**
   * The pieces along one eave.
   * @param {(a: number) => THREE.Vector3} at the eave line, `a` chi along it (the roof's u / UV_PER_CHI)
   * @param {THREE.Vector3} out outwards, level
   * @param {number} a0 @param {number} a1 where the eave starts and ends
   * @param {EaveOpts} [o]
   */
  eave(at, out, a0, a1, o = {}) {
    const T = new THREE.Vector3();
    /** the eave line's direction at a (towards +a) @param {number} a */
    const along = (a) => T.copy(at(a + 0.05)).sub(at(a - 0.05)).normalize();
    const R = TILE.radius + 0.02;
    const seg = TILE.span / TILE.segs;
    const face = out.clone().addScaledVector(UP, -0.15).normalize();
    // round tile ends, each with the last half-round tile behind it
    for (let k = Math.ceil((a0 + 0.3) / PITCH - 0.5); (k + 0.5) * PITCH < a1 - 0.3; k++) {
      const a = (k + 0.5) * PITCH;
      const P = at(a), t = along(a).clone();
      const up = face.clone().cross(t).normalize();
      if (up.y < 0) up.negate();
      const C = P.clone().addScaledVector(out, 0.1).addScaledVector(UP, 0.14);
      // the glaze of the middle of one of the row's tiles (which one: by the row)
      const row = ((k % TILE.rows) + TILE.rows) % TILE.rows;
      const j = (k * 5 + 3) % TILE.segs;
      const v = ((((j + 0.5 - 0.37 * row) * seg) % TILE.span) + TILE.span) % TILE.span;
      const uv = [a * UV_PER_CHI, v * UV_PER_CHI];
      const disc = [this.tiles.vert(C, face, uv)];
      for (let i = 0; i <= 8; i++) {
        const th = (i / 8) * Math.PI * 2;
        disc.push(this.tiles.vert(C.clone().addScaledVector(t, Math.cos(th) * R).addScaledVector(up, Math.sin(th) * R), face, uv));
      }
      this.tiles.fan(disc, face);
      /** @type {number[][]} */
      const ring = [[], []];
      for (let i = 0; i <= 4; i++) {
        const th = (i / 4) * Math.PI;
        const n = t.clone().multiplyScalar(Math.cos(th)).addScaledVector(up, Math.sin(th));
        for (const [r, d] of /** @type {const} */ ([[0, 0], [1, 0.8]])) {
          ring[r].push(this.tiles.vert(C.clone().addScaledVector(n, R * 0.94).addScaledVector(out, -d), n, uv));
        }
      }
      for (let i = 0; i < 4; i++) {
        const n = t.clone().multiplyScalar(Math.cos(((i + 0.5) / 4) * Math.PI)).addScaledVector(up, Math.sin(((i + 0.5) / 4) * Math.PI));
        this.tiles.tri(ring[0][i], ring[1][i], ring[1][i + 1], n);
        this.tiles.tri(ring[0][i], ring[1][i + 1], ring[0][i + 1], n);
      }
    }
    // drip tiles between the rows: a pointed lip hanging down and out
    for (let k = Math.ceil((a0 + 0.5) / PITCH); k * PITCH < a1 - 0.5; k++) {
      const a = k * PITCH;
      const P = at(a), t = along(a).clone();
      const down = out.clone().multiplyScalar(0.45).addScaledVector(UP, -1).normalize();
      const n = t.clone().cross(down).normalize();
      if (n.dot(out) < 0) n.negate();
      const Q = P.clone().addScaledVector(out, 0.12).addScaledVector(UP, -0.02);
      const uv = [a * UV_PER_CHI, (k % TILE.segs) * seg * UV_PER_CHI];
      const v = [[-0.5, 0], [-0.36, 0.22], [0, 0.44], [0.36, 0.22], [0.5, 0]].map(([x, y]) => this.tiles.vert(Q.clone().addScaledVector(t, x).addScaledVector(down, y), n, uv));
      this.tiles.fan(v, n);
    }
    if (o.fascia) {
      const steps = Math.max(2, Math.ceil((a1 - a0) / (PITCH / 2)));
      /** @type {number[]} */
      let prev = [];
      for (let i = 0; i <= steps; i++) {
        const P = at(a0 + ((a1 - a0) * i) / steps).addScaledVector(out, 0.02);
        const cur = [-0.04, -0.46].map((dy) => this.trim.vert(P.clone().addScaledVector(UP, dy), out, PAINT.fascia));
        if (prev.length) {
          this.trim.tri(prev[0], prev[1], cur[1], out);
          this.trim.tri(prev[0], cur[1], cur[0], out);
        }
        prev = cur;
      }
    }
    if (o.rafters) {
      // two of each a row; they stop short of the corners, where real rafters fan out
      for (let k = Math.ceil((a0 + 1.2) / PITCH * 2 - 0.5); (k + 0.5) * PITCH / 2 < a1 - 1.2; k++) {
        const a = ((k + 0.5) * PITCH) / 2;
        const P = at(a), t = along(a).clone();
        const F = P.clone().addScaledVector(out, -0.15).addScaledVector(UP, -0.72);
        const fly = [this.trim.vert(F, out, PAINT.flyEye)];
        for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]) {
          fly.push(this.trim.vert(F.clone().addScaledVector(t, x * 0.16).addScaledVector(UP, y * 0.16), out, PAINT.fly));
        }
        this.trim.fan(fly, out);
        const E = P.clone().addScaledVector(out, -0.8).addScaledVector(UP, -1.2);
        const round = [this.trim.vert(E, out, PAINT.roundEye)];
        for (let i = 0; i <= 6; i++) {
          const th = (i / 6) * Math.PI * 2;
          round.push(this.trim.vert(E.clone().addScaledVector(t, Math.cos(th) * 0.17).addScaledVector(UP, Math.sin(th) * 0.17), out, PAINT.round));
        }
        this.trim.fan(round, out);
      }
    }
  }
}

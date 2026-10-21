// Following a route drawn on the ground (a polyline in world chi).

import { pivotTwist, twist } from "./drive.js";
import { wrap } from "./chariot.js";

/** @import { Chariot } from "./chariot.js" */
/** @typedef {{x: number, y: number}} Point */

/**
 * Drop points closer than `minGap` to the previous kept point.
 * @param {Point[]} pts
 * @param {number} minGap
 * @returns {Point[]}
 */
export function simplify(pts, minGap) {
  /** @type {Point[]} */
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) >= minGap) out.push({ x: p.x, y: p.y });
  }
  const last = pts[pts.length - 1];
  const kept = out[out.length - 1];
  if (last && kept && (last.x !== kept.x || last.y !== kept.y)) out.push({ x: last.x, y: last.y });
  return out;
}

/** A stroke passing this close to the chariot (chi) is taken to start from it. */
export const SNAP = 4;

/**
 * Join a drawn route onto the chariot, so it sets off along the line the child
 * sees rather than looping round to reach it. A stroke drawn through or out
 * from the chariot starts where it passes closest; a stroke begun further
 * away is reached by a smooth curve leaving along the chariot's heading (or,
 * if it lies behind, straight after a turn on the spot).
 * @param {{x: number, y: number, heading: number}} c the chariot
 * @param {Point[]} pts the stroke, in drawing order
 * @returns {Point[]} the route from the chariot on (the chariot's own position not included)
 */
export function joinRoute(c, pts) {
  if (pts.length < 2) return pts.slice();
  const d = (/** @type {Point} */ p) => Math.hypot(p.x - c.x, p.y - c.y);
  let k = 0;
  for (let i = 1; i < pts.length; i++) if (d(pts[i]) < d(pts[k])) k = i;
  // what is left of the stroke after point i
  let rest = 0;
  for (let i = pts.length - 1; i > k; i--) rest += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let out = d(pts[k]) < SNAP && rest > SNAP ? pts.slice(k) : pts.slice();
  // points still under the chariot only make it fidget
  while (out.length > 2 && d(out[0]) < 1.5) out = out.slice(1);
  const first = out[0];
  const far = d(first);
  const ahead = Math.cos(Math.atan2(first.y - c.y, first.x - c.x) - c.heading);
  if (far < SNAP || ahead < 0.2) return out;
  // a curve from the chariot (leaving along its heading) into the stroke
  // (arriving along the stroke's own direction)
  const next = out.find((p) => Math.hypot(p.x - first.x, p.y - first.y) > 1) ?? out[out.length - 1];
  const tl = Math.hypot(next.x - first.x, next.y - first.y) || 1;
  const tx = (next.x - first.x) / tl, ty = (next.y - first.y) / tl;
  const L = far / 3;
  const p0 = { x: c.x, y: c.y };
  const p1 = { x: c.x + Math.cos(c.heading) * L, y: c.y + Math.sin(c.heading) * L };
  const p2 = { x: first.x - tx * L, y: first.y - ty * L };
  /** @type {Point[]} */
  const lead = [];
  const n = Math.max(2, Math.ceil(far / 0.8));
  for (let i = 1; i < n; i++) {
    const t = i / n, u = 1 - t;
    lead.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * first.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * first.y,
    });
  }
  return [...lead, ...out];
}

/**
 * Steers a chariot along a polyline.
 *
 * - "smooth": pure-pursuit, both wheels roll, turns of any radius. Use for
 *   the differential chariot (and to show the Song chariot drifting).
 * - "pivot": the Song charioteer's style: drive straight at the next point,
 *   and whenever it is off to one side stop and swing round the inner wheel.
 */
export class RouteFollower {
  /**
   * @param {Point[]} points
   * @param {{style?: "smooth" | "pivot", speed?: number, lookahead?: number, turnRate?: number}} [opts]
   */
  constructor(points, opts = {}) {
    this.style = opts.style ?? "smooth";
    this.speed = opts.speed ?? 6; // chi/s
    this.lookahead = opts.lookahead ?? 4; // chi
    this.turnRate = opts.turnRate ?? 1.2; // rad/s
    this.points = simplify(points, this.style === "pivot" ? 4 : 0.5);
    this.index = 0;
    this.done = this.points.length < 2;
  }

  /**
   * Compute this tick's wheel motion and apply it.
   * @param {Chariot} c
   * @param {number} dt seconds
   * @param {import("./drive.js").Slip} [slip]
   */
  update(c, dt, slip) {
    if (this.done) return;
    const { v, omega } = this.style === "pivot" ? this.#pivotCommand(c) : this.#pursuitCommand(c);
    if (this.done) return;
    const g = this.style === "pivot" ? pivotTwist(v, omega, dt, c.track) : twist(v, omega, dt, c.track);
    const turn = omega > 1e-6 ? 1 : omega < -1e-6 ? -1 : 0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(g.groundL), Math.abs(g.groundR)) / 0.05));
    for (let i = 0; i < n; i++) c.step({ groundL: g.groundL / n, groundR: g.groundR / n, turn, ...slip });
  }

  /** @param {Chariot} c */
  #pursuitCommand(c) {
    const pts = this.points;
    const end = pts[pts.length - 1];
    if (Math.hypot(end.x - c.x, end.y - c.y) < 0.6) {
      this.done = true;
      return { v: 0, omega: 0 };
    }
    // Advance the index past points already within the lookahead circle.
    while (this.index < pts.length - 1 && Math.hypot(pts[this.index].x - c.x, pts[this.index].y - c.y) < this.lookahead) {
      this.index++;
    }
    const target = pts[this.index];
    const alpha = wrap(Math.atan2(target.y - c.y, target.x - c.x) - c.heading);
    if (Math.abs(alpha) > Math.PI / 3) {
      // Target well off to the side or behind: turn on the spot first, so the
      // chariot doesn't set off sideways away from the line.
      return { v: 0, omega: Math.sign(alpha) * this.turnRate };
    }
    const dist = Math.max(Math.hypot(target.x - c.x, target.y - c.y), 1e-6);
    // slow into a sharp turn, so it turns tight instead of swinging wide of the line
    const v = Math.min(this.speed, this.speed * (dist / this.lookahead) + 1) * Math.max(0.3, Math.cos(alpha));
    let omega = (2 * v * Math.sin(alpha)) / dist;
    omega = Math.max(-this.turnRate, Math.min(this.turnRate, omega));
    return { v, omega };
  }

  /** @param {Chariot} c */
  #pivotCommand(c) {
    const pts = this.points;
    while (this.index < pts.length && Math.hypot(pts[this.index].x - c.x, pts[this.index].y - c.y) < 1) this.index++;
    if (this.index >= pts.length) {
      this.done = true;
      return { v: 0, omega: 0 };
    }
    const t = pts[this.index];
    const alpha = wrap(Math.atan2(t.y - c.y, t.x - c.x) - c.heading);
    if (Math.abs(alpha) > 0.04) return { v: 0, omega: Math.sign(alpha) * this.turnRate };
    return { v: this.speed, omega: 0 };
  }
}

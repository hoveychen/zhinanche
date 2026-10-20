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
    if (Math.abs(alpha) > Math.PI / 2) {
      // Target behind: turn on the spot first.
      return { v: 0, omega: Math.sign(alpha) * this.turnRate };
    }
    const dist = Math.max(Math.hypot(target.x - c.x, target.y - c.y), 1e-6);
    const v = Math.min(this.speed, this.speed * (dist / this.lookahead) + 1);
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

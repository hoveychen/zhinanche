// Turning driving intents into wheel ground motion, and feeding it to a
// Chariot in small steps.

/** @import { Chariot, Step } from "./chariot.js" */

/** Largest wheel travel per integration step (chi). */
export const MAX_STEP = 0.05;

/**
 * Slip settings applied to every step (wheel spins this fraction more than it
 * rolls). Used by the "slippery ground" demo.
 * @typedef {{slipL?: number, slipR?: number}} Slip
 */

/**
 * Move both wheels by the given ground distances, subdivided into small steps.
 * @param {Chariot} c
 * @param {number} groundL
 * @param {number} groundR
 * @param {Slip & {turn?: -1 | 0 | 1}} [extra]
 */
export function roll(c, groundL, groundR, extra = {}) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(groundL), Math.abs(groundR)) / MAX_STEP));
  for (let i = 0; i < n; i++) {
    /** @type {Step} */
    const s = { groundL: groundL / n, groundR: groundR / n, ...extra };
    c.step(s);
  }
}

/**
 * Wheel travel for a body speed v (chi/s) and turn rate omega (rad/s, + left)
 * over dt seconds, on a chariot whose real track is `track`.
 * @param {number} v
 * @param {number} omega
 * @param {number} dt
 * @param {number} track
 */
export function twist(v, omega, dt, track) {
  return { groundL: (v - (omega * track) / 2) * dt, groundR: (v + (omega * track) / 2) * dt };
}

/**
 * The charioteer's trick for the Song clutch chariot: every turn is made by
 * holding the inner wheel still and swinging round it. Straight driving is
 * unchanged. Turn rate is preserved, so the chariot handles the same.
 * @param {number} v
 * @param {number} omega
 * @param {number} dt
 * @param {number} track
 */
export function pivotTwist(v, omega, dt, track) {
  if (Math.abs(omega) < 1e-6) return twist(v, 0, dt, track);
  const outer = Math.abs(omega) * track * dt;
  return omega > 0 ? { groundL: 0, groundR: outer } : { groundL: outer, groundR: 0 };
}

// ---------- Scripted manoeuvres (tests, lessons) ----------

/** @typedef {(c: Chariot, slip?: Slip) => void} Manoeuvre */

/** @param {number} d distance (chi, negative = reverse) @returns {Manoeuvre} */
export const straight = (d) => (c, slip) => roll(c, d, d, { ...slip, turn: 0 });

/** Spin on the spot about the midpoint. @param {number} angle rad, + left @returns {Manoeuvre} */
export const spin = (angle) => (c, slip) => {
  const s = (angle * c.track) / 2;
  roll(c, -s, s, { ...slip, turn: angle > 0 ? 1 : -1 });
};

/** Swing round the inner wheel (inner wheel still). @param {number} angle rad, + left @returns {Manoeuvre} */
export const pivot = (angle) => (c, slip) => {
  const s = Math.abs(angle) * c.track;
  if (angle > 0) roll(c, 0, s, { ...slip, turn: 1 });
  else roll(c, s, 0, { ...slip, turn: -1 });
};

/**
 * Drive along a circular arc whose centre-line radius is `radius`.
 * @param {number} radius chi (> track/2 for both wheels to roll forward)
 * @param {number} angle rad, + left
 * @returns {Manoeuvre}
 */
export const arc = (radius, angle) => (c, slip) => {
  const sign = Math.sign(angle);
  const inner = (radius - c.track / 2) * Math.abs(angle);
  const outer = (radius + c.track / 2) * Math.abs(angle);
  if (sign > 0) roll(c, inner, outer, { ...slip, turn: 1 });
  else roll(c, outer, inner, { ...slip, turn: -1 });
};

/**
 * Run a list of manoeuvres.
 * @param {Chariot} c
 * @param {Manoeuvre[]} list
 * @param {Slip} [slip]
 */
export function run(c, list, slip) {
  for (const m of list) m(c, slip);
}

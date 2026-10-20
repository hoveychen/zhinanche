// Named routes shared by the tests and the lessons.

import { arc, pivot, spin, straight } from "./drive.js";

/** @import { Manoeuvre } from "./drive.js" */
/** @import { Point } from "./route.js" */

const D = Math.PI / 180;

/** Deterministic PRNG (mulberry32). @param {number} seed */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @type {Record<string, Manoeuvre[]>} */
export const MANOEUVRES = {
  straight: [straight(60)],
  reverse: [straight(20), straight(-30)],
  spinLeft: [spin(360 * D)],
  spinRight: [spin(-270 * D)],
  pivotLeft: [pivot(90 * D), straight(10), pivot(90 * D)],
  pivotSquare: [straight(15), pivot(90 * D), straight(15), pivot(90 * D), straight(15), pivot(90 * D), straight(15), pivot(90 * D)],
  pivotZigzag: [straight(10), pivot(-60 * D), straight(10), pivot(120 * D), straight(10), pivot(-90 * D)],
  circle: [arc(12, 360 * D)],
  sCurve: [arc(10, 90 * D), arc(10, -180 * D), arc(10, 90 * D)],
  figureEight: [arc(9, 360 * D), arc(9, -360 * D)],
};

/**
 * A random sequence of straights, arcs, spins and reverses.
 * @param {number} seed
 * @param {number} [n]
 * @returns {Manoeuvre[]}
 */
export function randomManoeuvres(seed, n = 40) {
  const r = rng(seed);
  /** @type {Manoeuvre[]} */
  const list = [];
  for (let i = 0; i < n; i++) {
    const k = r();
    const ang = (r() * 2 - 1) * Math.PI;
    if (k < 0.3) list.push(straight((r() * 2 - 0.4) * 15));
    else if (k < 0.6) list.push(arc(4 + r() * 20, ang));
    else if (k < 0.8) list.push(spin(ang));
    else list.push(pivot(ang));
  }
  return list;
}

/**
 * A random wiggly polyline, like a child's drawing on the ground.
 * @param {number} seed
 * @returns {Point[]}
 */
export function randomDrawing(seed) {
  const r = rng(seed);
  /** @type {Point[]} */
  const pts = [{ x: 0, y: 0 }];
  let h = Math.PI / 2;
  for (let i = 0; i < 120; i++) {
    h += (r() - 0.5) * 0.6;
    const p = pts[pts.length - 1];
    pts.push({ x: p.x + Math.cos(h) * 1.5, y: p.y + Math.sin(h) * 1.5 });
  }
  return pts;
}

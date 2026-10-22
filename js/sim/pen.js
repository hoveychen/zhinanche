// Where the chariot may be driven by hand or along a drawn road: the
// courtyard round the origin (js/scene/courtyard.js stands still there,
// design/decisions/0018). Past its edge is an invisible wall: the chariot
// turns round and drives itself back in a little way (js/app/app.js), the
// way a game walks you back from the edge of its map. Lessons' routes stay
// well inside it and never meet it.
//
// Sim coordinates (chi): x east, y north (three.js z = −y).

/** @typedef {{x: number, y: number}} Point */

/**
 * The chariot's middle stays within these (chi). The chariot reaches about
 * 7 round its middle (box, wheels and shafts). East and west: the corridors'
 * steps start at x ±60.5. South: the bronze lions before the gate stand at
 * y −92 (the gate at −105). North: the court goes on to the cauldrons and
 * pines (y 108–127), but the chase view looks south from 30–40 north of
 * the chariot, and beyond this it would be pushed in against the north end
 * (js/scene/cameraRig.js ROOM); the lessons' longest route ends at y 60.
 */
export const PEN = { x: 50, south: -78, north: 72 };

/** How far inside the wall the chariot drives back to (chi). */
export const BACK = 18;

/**
 * How far the point is outside the pen (0 inside).
 * @param {Point} p
 */
export function outside(p) {
  const dx = Math.max(0, Math.abs(p.x) - PEN.x);
  const dy = Math.max(0, p.y - PEN.north, PEN.south - p.y);
  return Math.hypot(dx, dy);
}

/**
 * Where to drive back to from `p`: `BACK` inside every wall it is past or
 * near, straight in from it.
 * @param {Point} p
 * @returns {Point}
 */
export function backInside(p) {
  const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, v));
  return { x: clamp(p.x, -PEN.x + BACK, PEN.x - BACK), y: clamp(p.y, PEN.south + BACK, PEN.north - BACK) };
}

// Where the part callout goes: just above the point that was tapped if it
// fits there, else wherever nearby keeps it off the controls on the 3D view
// (the dial, the pause and share buttons, the drive dock). Pure geometry;
// tested in node (tests/app/callout.test.js).

/**
 * @typedef {object} Box
 * @property {number} x left
 * @property {number} y top
 * @property {number} w
 * @property {number} h
 */

/** gap between the point and the callout, px */
const GAP = 18;
/** kept clear round each control and from the view's edges, px */
const PAD = 8;

/** @param {Box} a @param {Box} b */
function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * @param {{x: number, y: number}} at the tapped point, px within the view
 * @param {{w: number, h: number}} size the callout's
 * @param {{w: number, h: number}} view
 * @param {Box[]} controls what it must not cover, px within the view
 * @returns {{x: number, y: number}} the callout's top left
 */
export function placeCallout(at, size, view, controls) {
  const { w, h } = size;
  const clampX = (/** @type {number} */ x) => Math.max(PAD, Math.min(view.w - w - PAD, x));
  const clampY = (/** @type {number} */ y) => Math.max(PAD, Math.min(view.h - h - PAD, y));
  const grown = controls.map((c) => ({ x: c.x - PAD, y: c.y - PAD, w: c.w + 2 * PAD, h: c.h + 2 * PAD }));
  // centred above the point, below it or beside it, or slid just clear of
  // a control on any side; the cost below picks among them
  const xs = [at.x - w / 2, at.x + GAP, at.x - w - GAP];
  const ys = [at.y - h - GAP, at.y + GAP, at.y - h / 2];
  for (const g of grown) {
    xs.push(g.x + g.w, g.x - w);
    ys.push(g.y + g.h, g.y - h);
  }
  /** @type {{x: number, y: number}[]} */
  const tries = [];
  for (const y of ys) for (const x of xs) tries.push({ x: clampX(x), y: clampY(y) });
  let best = tries[0], bestCost = Infinity;
  for (const t of tries) {
    const box = { x: t.x, y: t.y, w, h };
    const covered = grown.reduce((sum, g) => sum + overlap(box, g), 0);
    // covering a control costs far more than sitting a little further away
    // (or a little over the point, which the clamping at the edges may do)
    const cx = t.x + w / 2, cy = t.y + h / 2;
    const cost = covered * 100 + Math.hypot(cx - at.x, cy - (at.y - h / 2 - GAP)) + overlap(box, { x: at.x - 4, y: at.y - 4, w: 8, h: 8 }) * 10;
    if (cost < bestCost) {
      bestCost = cost;
      best = t;
    }
  }
  return best;
}

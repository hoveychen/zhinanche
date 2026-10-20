// How hand driving gets going and stops (ease in js/app/drive.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { RAMP, ease } from "../../js/app/drive.js";

/** Hold `want` for `secs` at 60 fps from `from`; returns where it ends up. */
const hold = (/** @type {number} */ from, /** @type {number} */ want, /** @type {number} */ secs) => {
  let v = from;
  for (let t = 0; t < secs - 1e-9; t += 1 / 60) v = ease(v, want, 1 / 60, RAMP.up, RAMP.brake);
  return v;
};

test("full speed a moment after pressing, not at once", () => {
  assert.ok(hold(0, 1, 1 / 60) < 0.1);
  assert.ok(hold(0, 1, RAMP.up / 2) > 0.4 && hold(0, 1, RAMP.up / 2) < 0.6);
  assert.equal(hold(0, 1, RAMP.up + 0.02), 1);
});

test("stops a moment after letting go, and does not roll past still", () => {
  assert.ok(hold(1, 0, 1 / 60) > 0.9);
  assert.equal(hold(1, 0, RAMP.brake + 0.02), 0);
  assert.equal(hold(1, 0, 3), 0);
});

test("forward to reverse brakes first, then speeds up backwards", () => {
  const v = hold(1, -1, RAMP.brake + 0.02);
  assert.ok(v <= 0 && v > -0.2);
  assert.equal(hold(v, -1, RAMP.up + 0.02), -1);
});

test("stays within −1..1 and never overshoots", () => {
  assert.equal(ease(0.99, 1, 1, RAMP.up, RAMP.brake), 1);
  assert.equal(ease(-0.99, -1, 1, RAMP.up, RAMP.brake), -1);
  assert.equal(ease(0.01, 0, 1, RAMP.up, RAMP.brake), 0);
});

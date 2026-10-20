// Render quality tiers (js/scene/quality.js): the starting tier and the
// frame-rate governor that steps down when frames stay slow.

import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameGovernor, SETTINGS, TIERS, pickQuality } from "../../js/scene/quality.js";

const desktop = { coarse: false, shortSide: 1080, saveData: false };

test("?quality= forces a tier and turns the governor off", () => {
  for (const q of TIERS) assert.deepEqual(pickQuality(`?quality=${q}`, desktop), { quality: q, forced: true });
  assert.deepEqual(pickQuality("?quality=ultra", desktop), { quality: "high", forced: false });
});

test("phones start at medium, data saver at lite, desktops at high", () => {
  assert.equal(pickQuality("", desktop).quality, "high");
  assert.equal(pickQuality("", { coarse: true, shortSide: 390, saveData: false }).quality, "medium");
  assert.equal(pickQuality("", { coarse: true, shortSide: 1024, saveData: false }).quality, "high");
  assert.equal(pickQuality("", { ...desktop, saveData: true }).quality, "lite");
});

test("only the high tier pays for post-processing; lite is cheapest", () => {
  assert.equal(SETTINGS.high.postfx, true);
  assert.equal(SETTINGS.medium.postfx, false);
  assert.ok(SETTINGS.lite.maxPixelRatio <= SETTINGS.medium.maxPixelRatio);
  assert.ok(SETTINGS.lite.shadowSize < SETTINGS.high.shadowSize);
});

/**
 * Feed `n` frames `dt` ms apart from `t`, returns the new time.
 * @param {FrameGovernor} g @param {number} t @param {number} dt @param {number} n
 */
function run(g, t, dt, n) {
  for (let i = 0; i < n; i++) g.tick((t += dt));
  return t;
}

test("governor steps down one tier per slow window, after settling, and never back up", () => {
  /** @type {string[]} */
  const seen = [];
  const g = new FrameGovernor("high", (q) => seen.push(q), { window: 30, settleMs: 1000 });
  let t = run(g, 0, 40, 20); // 800 ms: still settling
  assert.deepEqual(seen, []);
  t = run(g, t, 40, 40);
  assert.deepEqual(seen, ["medium"]);
  t = run(g, t, 10, 400); // fast again: stays at medium
  assert.deepEqual(seen, ["medium"]);
  t = run(g, t, 40, 200);
  assert.deepEqual(seen, ["medium", "lite"]);
  run(g, t, 40, 400);
  assert.deepEqual(seen, ["medium", "lite"]);
  assert.equal(g.enabled, false);
});

test("governor ignores hitches and hidden-tab gaps", () => {
  /** @type {string[]} */
  const seen = [];
  const g = new FrameGovernor("high", (q) => seen.push(q), { window: 30, settleMs: 0 });
  let t = 0;
  for (let i = 0; i < 200; i++) t = run(g, t, i % 10 === 0 ? 400 : 16, 1);
  assert.deepEqual(seen, []);
});

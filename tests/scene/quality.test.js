// Render quality tiers (js/scene/quality.js): the starting tier and the
// frame-rate governor that steps down when frames stay slow.

import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameGovernor, SETTINGS, TIERS, pickQuality } from "../../js/scene/quality.js";

const desktop = { coarse: false, shortSide: 1080, saveData: false, cores: 10, memory: 16 };

test("?quality= forces a tier and turns the governor off", () => {
  for (const q of TIERS) assert.deepEqual(pickQuality(`?quality=${q}`, desktop), { quality: q, forced: true });
  assert.deepEqual(pickQuality("?quality=ultra", desktop), { quality: "high", forced: false });
});

test("phones and tablets (big ones too) start at medium, data saver at lite, desktops at high", () => {
  assert.equal(pickQuality("", desktop).quality, "high");
  assert.equal(pickQuality("", { coarse: true, shortSide: 390, saveData: false }).quality, "medium");
  // a 12.9-inch iPad Pro: 1024 × 1366 CSS px
  assert.equal(pickQuality("", { coarse: true, shortSide: 1024, saveData: false, cores: 8, memory: 8 }).quality, "medium");
  assert.equal(pickQuality("", { ...desktop, saveData: true }).quality, "lite");
  // a desktop that doesn't say how many cores or how much memory it has
  assert.equal(pickQuality("", { coarse: false, shortSide: 1080, saveData: false }).quality, "high");
});

test("a small laptop (few cores or little memory) starts at medium", () => {
  assert.equal(pickQuality("", { ...desktop, cores: 4 }).quality, "medium");
  assert.equal(pickQuality("", { ...desktop, memory: 2 }).quality, "medium");
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

test("governor steps down when one frame in ten judders, though the median is fine", () => {
  /** @type {string[]} */
  const seen = [];
  const g = new FrameGovernor("high", (q) => seen.push(q), { window: 50, settleMs: 0 });
  let t = 0;
  // 8 ms frames with a 40 ms one every fifth: median 8, 90th percentile 40
  for (let i = 0; i < 60; i++) t = run(g, t, i % 5 === 0 ? 40 : 8, 1);
  assert.deepEqual(seen, ["medium"]);
  // an occasional 30 ms frame (one in twenty) is not enough
  const h = new FrameGovernor("high", (q) => seen.push(q), { window: 50, settleMs: 0 });
  t = 0;
  for (let i = 0; i < 200; i++) t = run(h, t, i % 20 === 0 ? 30 : 8, 1);
  assert.equal(h.quality, "high");
});

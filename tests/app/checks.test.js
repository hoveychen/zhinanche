// The "do" task checks (js/app/checks.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_CHECKS, LIMITS, Tracker, checkPassed } from "../../js/app/checks.js";
import { readFileSync } from "node:fs";

/** @import { CheckSnapshot } from "../../js/app/checks.js" */

const D = Math.PI / 180;
/** @returns {CheckSnapshot} */
const snap = (/** @type {Partial<CheckSnapshot>} */ o = {}) => ({ xray: false, explode: 0, mechanism: "differential", broken: false, errorDeg: 0, ...o });

test("ALL_CHECKS matches CheckId in types.js", () => {
  const src = readFileSync(new URL("../../js/teach/types.js", import.meta.url), "utf8");
  const m = src.match(/@typedef \{([^}]*)\} CheckId/);
  assert.ok(m);
  assert.deepEqual(new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])), new Set(ALL_CHECKS));
});

test("nothing passes on a fresh step", () => {
  const t = new Tracker();
  for (const id of ALL_CHECKS) assert.equal(checkPassed(id, t, snap()), false, id);
});

test("drove needs a few chi", () => {
  const t = new Tracker();
  t.drove(LIMITS.drove - 1, 0);
  assert.equal(checkPassed("drove", t, snap()), false);
  t.drove(-2, 0);
  assert.equal(checkPassed("drove", t, snap()), true, "reversing counts too");
});

test("a left turn after a right turn still counts", () => {
  const t = new Tracker();
  for (let i = 0; i < 30; i++) t.drove(0.1, -1 * D);
  assert.equal(checkPassed("turnedLeft", t, snap()), false);
  for (let i = 0; i < 61; i++) t.drove(0.1, 1 * D);
  assert.equal(checkPassed("turnedLeft", t, snap()), true);
  assert.equal(checkPassed("turnedRight", t, snap()), false);
  assert.equal(checkPassed("turnedAround", t, snap()), false);
});

test("turning round needs 150° one way", () => {
  const t = new Tracker();
  for (let i = 0; i < 100; i++) t.drove(0, -1 * D);
  for (let i = 0; i < 100; i++) t.drove(0, 1 * D);
  assert.equal(checkPassed("turnedAround", t, snap()), false, "100° each way is not turning round");
  for (let i = 0; i < 60; i++) t.drove(0, 1 * D);
  assert.equal(checkPassed("turnedAround", t, snap()), true);
});

test("scene-state checks", () => {
  const t = new Tracker();
  assert.equal(checkPassed("xrayOn", t, snap({ xray: true })), true);
  assert.equal(checkPassed("opened", t, snap({ explode: 0.5 })), true);
  assert.equal(checkPassed("opened", t, snap({ explode: 0.2 })), false);
  assert.equal(checkPassed("switchedToSong", t, snap({ mechanism: "song" })), true);
  t.routeDone();
  assert.equal(checkPassed("drewRoute", t, snap()), true);
  t.demoLap();
  assert.equal(checkPassed("playedDemo", t, snap()), true);
});

test("drift: broken, driven, and off south", () => {
  const t = new Tracker();
  assert.equal(checkPassed("madeItDrift", t, snap({ broken: true, errorDeg: 20 })), false, "must drive");
  t.drove(3, 0.5);
  assert.equal(checkPassed("madeItDrift", t, snap({ broken: false, errorDeg: 20 })), false, "Song drift without a fault is not this task");
  assert.equal(checkPassed("madeItDrift", t, snap({ broken: true, errorDeg: 2 })), false);
  assert.equal(checkPassed("madeItDrift", t, snap({ broken: true, errorDeg: -9 })), true);
});

test("fixing needs something to have been broken", () => {
  const t = new Tracker();
  assert.equal(checkPassed("fixedDrift", t, snap()), false);
  t.sawBroken(true);
  assert.equal(checkPassed("fixedDrift", t, snap({ broken: true })), false);
  assert.equal(checkPassed("fixedDrift", t, snap({ broken: false })), true);
});

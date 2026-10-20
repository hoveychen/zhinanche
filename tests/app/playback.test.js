// Auto-play (js/app/playback.js): played step by step, a route must end exactly
// where running the manoeuvre in one go ends, and the Song chariot with the
// charioteer's help stays true.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Chariot } from "../../js/sim/chariot.js";
import { run } from "../../js/sim/drive.js";
import { MANOEUVRES } from "../../js/sim/scenarios.js";
import { StepPlayer, isPivotOnly, planPlayback, recordSteps, tracePath } from "../../js/app/playback.js";

/** @param {{done: boolean, update: (c: Chariot, dt: number, s: number) => void}} p @param {Chariot} c */
function finish(p, c) {
  for (let i = 0; i < 100000 && !p.done; i++) p.update(c, 1 / 60, 1);
  assert.ok(p.done, "player finished");
}

for (const name of Object.keys(MANOEUVRES)) {
  for (const mechanism of /** @type {const} */ (["differential", "song"])) {
    test(`${name} (${mechanism}) played over time matches running it at once`, () => {
      const a = new Chariot({ mechanism, faults: { trackScale: 1.1 } });
      run(a, MANOEUVRES[name], { slipR: 0.1 });
      const b = new Chariot({ mechanism, faults: { trackScale: 1.1 } });
      const p = new StepPlayer(recordSteps(MANOEUVRES[name], b.track, { slipR: 0.1 }));
      finish(p, b);
      const pa = a.pose(), pb = b.pose();
      for (const k of /** @type {const} */ (["x", "y", "heading", "errorDeg", "distL", "distR"])) {
        assert.ok(Math.abs(pa[k] - pb[k]) < 1e-9, `${k}: ${pa[k]} vs ${pb[k]}`);
      }
    });
  }
}

test("pivot routes are recognised", () => {
  assert.equal(isPivotOnly(recordSteps(MANOEUVRES.pivotSquare, 6)), true);
  assert.equal(isPivotOnly(recordSteps(MANOEUVRES.straight, 6)), true);
  assert.equal(isPivotOnly(recordSteps(MANOEUVRES.circle, 6)), false);
  assert.equal(isPivotOnly(recordSteps(MANOEUVRES.spinLeft, 6)), false);
});

test("tracePath follows the circle and does not move the real chariot", () => {
  const c = new Chariot();
  const pts = tracePath(recordSteps(MANOEUVRES.circle, c.track), c);
  assert.equal(c.x, 0);
  const far = Math.max(...pts.map((p) => Math.hypot(p.x + 12, p.y)));
  const near = Math.min(...pts.map((p) => Math.hypot(p.x + 12, p.y)));
  assert.ok(far < 12.1 && near > 11.9, "radius 12 round (-12, 0)");
  const end = pts[pts.length - 1];
  assert.ok(Math.hypot(end.x, end.y) < 1e-6, "back at the start");
});

test("Song chariot: circle with the charioteer's help stays true, without it drifts", () => {
  const helped = new Chariot({ mechanism: "song" });
  finish(planPlayback("circle", helped, { mechanism: "song", assist: true }).player, helped);
  assert.ok(Math.abs(helped.pose().errorDeg) < 1e-6, `helped error ${helped.pose().errorDeg}`);

  const alone = new Chariot({ mechanism: "song" });
  finish(planPlayback("circle", alone, { mechanism: "song", assist: false }).player, alone);
  assert.ok(Math.abs(alone.pose().errorDeg) > 20, `unhelped error ${alone.pose().errorDeg}`);
});

test("Song pivot route with help is played exactly as written (lesson 5: a right-angle turn is 12 teeth)", () => {
  const c = new Chariot({ mechanism: "song" });
  const { player } = planPlayback("pivotLeft", c, { mechanism: "song", assist: true });
  assert.ok(player instanceof StepPlayer);
  finish(player, c);
  assert.ok(Math.abs(c.pose().errorDeg) < 1e-9);
});

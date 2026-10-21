// Auto-play (js/app/playback.js): played step by step, a route must end exactly
// where running the manoeuvre in one go ends, and the Song chariot with the
// charioteer's help is off only by its clutch's engagements.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Chariot } from "../../js/sim/chariot.js";
import { run } from "../../js/sim/drive.js";
import { MANOEUVRES } from "../../js/sim/scenarios.js";
import { FollowPlayer, StepPlayer, isPivotOnly, planPlayback, recordSteps, tracePath } from "../../js/app/playback.js";

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

test("Song chariot: circle with the charioteer's help is off only by the clutch's engagements, without it drifts far", () => {
  const helped = new Chariot({ mechanism: "song" });
  finish(planPlayback("circle", helped, { mechanism: "song", assist: true }).player, helped);
  const h = helped.pose();
  // each drop of a small flat wheel re-seats the big flat wheel, half a tooth (3.75°) at most
  assert.ok(Math.abs(h.errorDeg - h.engageDeg) < 1e-6, `helped error ${h.errorDeg}° vs engagements ${h.engageDeg}°`);
  assert.ok(Math.abs(h.errorDeg) <= h.engagements * 3.75, `helped error ${h.errorDeg}°`);

  const alone = new Chariot({ mechanism: "song" });
  finish(planPlayback("circle", alone, { mechanism: "song", assist: false }).player, alone);
  assert.ok(Math.abs(alone.pose().errorDeg) > 20, `unhelped error ${alone.pose().errorDeg}`);
  assert.ok(Math.abs(alone.pose().errorDeg) > 3 * Math.abs(h.errorDeg), "help still makes a big difference");
});

test("Song pivot route with help is played exactly as written (lesson 5: a right-angle turn is 12 teeth)", () => {
  const c = new Chariot({ mechanism: "song" });
  const { player } = planPlayback("pivotLeft", c, { mechanism: "song", assist: true });
  assert.ok(player instanceof StepPlayer);
  // the first turn, from rest: the teeth start in mesh, so exactly 12 teeth
  const first = new Chariot({ mechanism: "song" });
  run(first, MANOEUVRES.pivotLeft.slice(0, 1));
  assert.ok(Math.abs(first.gears.bigFlat + Math.PI / 2) < 1e-9, `big flat a quarter turn: ${first.gears.bigFlat}`);
  assert.ok(Math.abs(first.pose().errorDeg) < 1e-9);
  // the second turn, after a straight run, re-seats the big flat wheel: under half a tooth
  finish(player, c);
  const p = c.pose();
  assert.equal(p.engagements, 2);
  assert.ok(Math.abs(p.errorDeg) <= 3.75 && Math.abs(p.errorDeg - p.engageDeg) < 1e-9, `${p.errorDeg}`);
});

test("a drawn route that starts sideways or zigzags is driven to its end, not orbited", () => {
  const routes = {
    sideways: Array.from({ length: 30 }, (_, i) => ({ x: 2 + i * 0.5, y: 0.5 })),
    zigzag: Array.from({ length: 60 }, (_, i) => ({ x: (i % 20 < 10 ? i % 10 : 10 - (i % 10)) * 0.8, y: i * 0.4 })),
  };
  for (const [name, pts] of Object.entries(routes)) {
    const c = new Chariot({ mechanism: "differential" });
    const p = new FollowPlayer([{ x: c.x, y: c.y }, ...pts], "smooth");
    let t = 0;
    while (!p.done && t < 60) {
      p.update(c, 0.05, 1);
      t += 0.05;
    }
    const end = pts[pts.length - 1];
    assert.ok(t < 30, `${name} took ${t.toFixed(1)}s`);
    assert.ok(Math.hypot(end.x - c.x, end.y - c.y) < 1, `${name} ended near its end`);
  }
});

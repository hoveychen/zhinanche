// The figure's world bearing is the acceptance criterion: on any route a
// perfect differential chariot keeps pointing south; the Song chariot only
// when every turn is a swing round the inner wheel, and even then each drop of
// a small flat wheel re-seats the big flat wheel in the nearest gap, up to half
// a tooth (design/decisions/0007-song-clutch-error.md); faults make both drift.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Chariot, SMALL_PITCH, modCentered, wrap } from "../../js/sim/chariot.js";
import { arc, pivot, run, spin, straight } from "../../js/sim/drive.js";
import { MANOEUVRES, randomDrawing, randomManoeuvres } from "../../js/sim/scenarios.js";
import { RouteFollower } from "../../js/sim/route.js";

const D = Math.PI / 180;
const TOL = 1e-6; // degrees
/** Half a big-flat-wheel tooth (48 teeth), degrees: the most one engagement may cost. */
const HALF_BIG_TOOTH = 360 / 48 / 2;

/**
 * Run a route and return the largest |deviation from south| seen at the end
 * of each manoeuvre, and at the very end.
 * @param {Chariot} c
 * @param {import("../../js/sim/drive.js").Manoeuvre[]} list
 * @param {import("../../js/sim/drive.js").Slip} [slip]
 */
function maxError(c, list, slip) {
  let worst = Math.abs(c.pose().errorDeg);
  for (const m of list) {
    m(c, slip);
    worst = Math.max(worst, Math.abs(c.pose().errorDeg));
  }
  return worst;
}

test("figure starts pointing south whatever the chariot's heading", () => {
  for (const h of [0, 1, 2.5, -2]) {
    assert.ok(Math.abs(new Chariot({ heading: h }).pose().errorDeg) < TOL);
  }
});

for (const [name, list] of Object.entries(MANOEUVRES)) {
  test(`differential points south: ${name}`, () => {
    const c = new Chariot({ mechanism: "differential", heading: 0.3 });
    assert.ok(maxError(c, list) < TOL, `max error ${maxError(new Chariot(), list)}`);
  });
}

test("differential points south on 20 random routes (straights, arcs, spins, reverses)", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const c = new Chariot({ mechanism: "differential" });
    const err = maxError(c, randomManoeuvres(seed));
    assert.ok(err < 1e-5, `seed ${seed}: ${err}°`);
  }
});

test("differential follows a drawn wiggly route and still points south", () => {
  for (const seed of [3, 7, 11]) {
    const c = new Chariot({ mechanism: "differential" });
    const f = new RouteFollower(randomDrawing(seed));
    let worst = 0;
    for (let i = 0; i < 20000 && !f.done; i++) {
      f.update(c, 1 / 60);
      worst = Math.max(worst, Math.abs(c.pose().errorDeg));
    }
    assert.ok(f.done, "route finished");
    assert.ok(worst < 1e-5, `seed ${seed}: ${worst}°`);
    assert.ok(c.pathL > 100 && c.pathR > 100, "actually travelled");
  }
});

test("wheel distances differ in a turn: outer wheel travels further", () => {
  const c = new Chariot();
  arc(10, 90 * D)(c);
  const p = c.pose();
  // inner 7 chi radius, outer 13 chi radius, quarter circle
  assert.ok(Math.abs(p.distL - (7 * Math.PI) / 2) < 1e-9);
  assert.ok(Math.abs(p.distR - (13 * Math.PI) / 2) < 1e-9);
  // the difference equals track x turned angle: 6 chi x 90 deg
  assert.ok(Math.abs(p.distR - p.distL - 6 * (Math.PI / 2)) < 1e-9);
});

test("Song (Yan Su) gear numbers: half a wheel turn moves the big flat wheel a quarter turn", () => {
  // Original text: foot gear turns 12 teeth -> small flat wheel one turn -> big flat wheel a quarter turn.
  const c = new Chariot({ mechanism: "song" });
  const halfTurn = Math.PI * 3; // half the circumference of a 6-chi wheel
  run(c, [(ch) => ch.step({ groundL: 0, groundR: halfTurn, turn: 1 })]);
  assert.ok(Math.abs(c.gears.wheelR - Math.PI) < 1e-9);
  assert.ok(Math.abs(c.gears.smallR - 2 * Math.PI) < 1e-9, "small flat one full turn");
  assert.ok(Math.abs(c.gears.bigFlat + Math.PI / 2) < 1e-9, "big flat a quarter turn (clockwise)");
});

/**
 * Run `drive` on a Song chariot and check every step: the figure moves only by
 * the gear ratio (kinematic error 0) except at the step a small flat wheel is
 * lowered, where it moves by at most half a big-wheel tooth; every lowered
 * wheel sits in its meshing phase. Returns the chariot and the largest error.
 * @param {(c: Chariot) => void} drive
 */
function songChecked(drive) {
  const c = new Chariot({ mechanism: "song" });
  const step = c.step.bind(c);
  let worst = 0;
  c.step = (s) => {
    const before = c.pose();
    step(s);
    const p = c.pose();
    const dErr = wrap((p.errorDeg - before.errorDeg) * D) / D;
    if (p.engagements > before.engagements) {
      assert.equal(p.engagements, before.engagements + 1);
      assert.ok(Math.abs(dErr) <= HALF_BIG_TOOTH + 1e-9, `one engagement moved the figure ${dErr}°`);
    } else {
      assert.ok(Math.abs(dErr) < 1e-9, `no engagement, yet the figure moved ${dErr}°`);
    }
    const g = p.gears;
    /** @type {[boolean, number, number][]} */
    const sides = [[p.clutch.right, g.smallR - 2 * g.footR, g.smallR], [p.clutch.left, g.smallL + 2 * g.footL, g.smallL]];
    for (const [down, rel, small] of sides) {
      if (!down) continue;
      assert.ok(Math.abs(modCentered(rel, SMALL_PITCH)) < 1e-9, "small flat wheel in mesh with its foot gear");
      assert.ok(Math.abs(modCentered(small + 4 * g.bigFlat, SMALL_PITCH)) < 1e-9, "big flat wheel in mesh with the small one");
    }
    worst = Math.max(worst, Math.abs(p.errorDeg));
  };
  drive(c);
  // all the error there is came from the engagements
  const p = c.pose();
  assert.ok(Math.abs(wrap((p.errorDeg - p.engageDeg) * D)) < 1e-9, `error ${p.errorDeg}° vs engagements ${p.engageDeg}°`);
  return { c, worst };
}

for (const name of ["straight", "reverse", "pivotLeft", "pivotSquare", "pivotZigzag"]) {
  test(`Song swinging round the inner wheel: off south only by the clutch's engagements, half a tooth each at most: ${name}`, () => {
    const { c, worst } = songChecked((ch) => run(ch, MANOEUVRES[name]));
    const n = c.pose().engagements;
    assert.ok(worst <= n * HALF_BIG_TOOTH + 1e-9, `${worst}° after ${n} engagements`);
    if (name === "straight" || name === "reverse") assert.ok(worst < TOL, "no turn, no engagement, no error");
  });
}

test("Song: the first turn from rest costs nothing, and lowering a wheel where it was lifted costs nothing", () => {
  const { c } = songChecked((ch) => {
    pivot(90 * D)(ch);
    ch.step({ groundL: 0, groundR: 0, turn: 0 }); // lift, without moving
    pivot(45 * D)(ch);
  });
  const p = c.pose();
  assert.equal(p.engagements, 2);
  assert.ok(Math.abs(p.errorDeg) < 1e-9, `${p.errorDeg}`);
});

test("Song: an engagement's error depends on where the teeth stand, not on how far the chariot went", () => {
  // A small-wheel tooth (30°) passes for every 15° of foot gear: 3 chi × 15° of wheel travel.
  const toothRun = 3 * 15 * D;
  for (const d of [0.1, 0.3, 1, 5, 20, 100, 1000]) {
    /** @type {number[]} */
    const errs = [];
    for (const extra of [0, 7 * toothRun, 1000 * toothRun]) {
      const { c } = songChecked((ch) => {
        straight(d + extra)(ch);
        pivot(90 * D)(ch);
      });
      const p = c.pose();
      assert.equal(p.engagements, 1);
      assert.ok(Math.abs(p.errorDeg) <= HALF_BIG_TOOTH + 1e-9, `${d}+${extra}: ${p.errorDeg}`);
      errs.push(p.errorDeg);
    }
    for (const e of errs) assert.ok(Math.abs(e - errs[0]) < 1e-6, `${d} chi, then whole teeth further: ${errs}`);
  }
  // a long straight with no turn: no engagement, no error at all
  const { c } = songChecked((ch) => straight(5000)(ch));
  assert.ok(Math.abs(c.pose().errorDeg) < TOL);
});

test("Song: the engagement error is deterministic", () => {
  const go = () => {
    const c = new Chariot({ mechanism: "song" });
    const f = new RouteFollower(randomDrawing(7), { style: "pivot" });
    for (let i = 0; i < 40000 && !f.done; i++) f.update(c, 1 / 60);
    return c.pose();
  };
  const a = go(), b = go();
  assert.equal(a.errorDeg, b.errorDeg);
  assert.equal(a.engagements, b.engagements);
});

test("differential: no clutch, no engagements", () => {
  const c = new Chariot({ mechanism: "differential" });
  run(c, MANOEUVRES.pivotSquare);
  assert.equal(c.pose().engagements, 0);
  assert.equal(c.pose().engageDeg, 0);
});

test("Song drifts on ordinary turns: wide circle, spin on the spot, S-curve", () => {
  // Centre-line radius 10: outer wheel runs on radius 13, rolls 13/3 turns,
  // big flat wheel turns 13/6 of a turn = 780 deg against the body's 360.
  const circle = maxError(new Chariot({ mechanism: "song" }), [arc(10, 360 * D)]);
  assert.ok(Math.abs(circle - 60) < 1e-6, `full circle radius 10: ${circle}`);
  const sp = new Chariot({ mechanism: "song" });
  spin(180 * D)(sp);
  assert.ok(Math.abs(Math.abs(sp.pose().errorDeg) - 90) < 1e-6, "spin 180 -> 90 deg off");
  assert.ok(maxError(new Chariot({ mechanism: "song" }), MANOEUVRES.sCurve) > 20);
});

test("Song with the charioteer's pivot style follows a drawn route: drifts only by its many engagements", () => {
  for (const seed of [3, 7]) {
    let done = false;
    const { c, worst } = songChecked((ch) => {
      const f = new RouteFollower(randomDrawing(seed), { style: "pivot" });
      for (let i = 0; i < 40000 && !f.done; i++) f.update(ch, 1 / 60);
      done = f.done;
    });
    assert.ok(done, "route finished");
    const n = c.pose().engagements;
    assert.ok(n > 50, `a drawn route lowers the wheels many times: ${n}`);
    assert.ok(worst <= n * HALF_BIG_TOOTH, `seed ${seed}: ${worst}°`);
  }
});

test("Song driven smoothly along a drawn route goes wrong", () => {
  const c = new Chariot({ mechanism: "song" });
  const f = new RouteFollower(randomDrawing(3));
  for (let i = 0; i < 20000 && !f.done; i++) f.update(c, 1 / 60);
  assert.ok(Math.abs(c.pose().errorDeg) > 5);
});

test("track too wide makes the figure drift more with every lap", () => {
  const errs = [1, 2, 3].map((laps) => {
    const c = new Chariot({ faults: { trackScale: 1.05 } });
    for (let i = 0; i < laps; i++) arc(12, 360 * D)(c);
    return Math.abs(c.pose().errorDeg);
  });
  // 5 % more wheel-travel difference per lap -> 5 % of 360 deg
  assert.ok(Math.abs(errs[0] - 18) < 1e-6, `one lap: ${errs[0]}`);
  assert.ok(errs[1] > errs[0] && errs[2] > errs[1], `grows: ${errs}`);
});

test("wheels of unequal size drift even in a straight line", () => {
  const c = new Chariot({ faults: { leftWheelScale: 1.01 } });
  straight(100)(c);
  assert.ok(Math.abs(c.pose().errorDeg) > 5, `${c.pose().errorDeg}`);
  // A straight-line drift: no turn, yet the figure has rotated.
  assert.ok(Math.abs(c.heading - Math.PI / 2) < 1e-12);
});

test("a slipping wheel makes the figure turn wrongly", () => {
  const c = new Chariot();
  straight(30)(c, { slipL: 0.2 });
  assert.ok(Math.abs(c.pose().errorDeg) > 30, `${c.pose().errorDeg}`);
  const d = new Chariot({ mechanism: "song" });
  pivot(90 * D)(d, { slipR: 0.2 });
  assert.ok(Math.abs(Math.abs(d.pose().errorDeg) - 18) < 1e-6, `${d.pose().errorDeg}`);
});

test("pose exposes named gears for both mechanisms", () => {
  const diff = new Chariot().pose().gears;
  for (const k of ["wheelL", "wheelR", "sideA", "sideB", "carrier", "pinion", "figure"]) assert.ok(k in diff, k);
  const song = new Chariot({ mechanism: "song" }).pose().gears;
  for (const k of ["wheelL", "wheelR", "footL", "footR", "smallL", "smallR", "bigFlat", "figure"]) assert.ok(k in song, k);
});

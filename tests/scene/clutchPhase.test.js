// Song clutch display (js/scene/clutchPhase.js): the drop is eased, and the
// angles it shows are the sim's, which keep a lowered small flat wheel in mesh
// with its foot gear and the big flat wheel even after a straight run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Chariot, SMALL_PITCH, modCentered } from "../../js/sim/chariot.js";
import { pivot, straight } from "../../js/sim/drive.js";
import { CLUTCH_TIME, ClutchDisplay } from "../../js/scene/clutchPhase.js";

const D = Math.PI / 180;
/** @param {number} x */
const inPhase = (x) => Math.abs(modCentered(x, SMALL_PITCH)) < 1e-9;

test("modCentered stays in (-p/2, p/2]", () => {
  for (const x of [-100, -0.26, 0, 0.26, 0.2618, 3, 77.7]) {
    const r = modCentered(x, SMALL_PITCH);
    assert.ok(r > -SMALL_PITCH / 2 - 1e-12 && r <= SMALL_PITCH / 2 + 1e-12, `${x} → ${r}`);
    assert.ok(inPhase(x - r));
  }
});

for (const [name, angle, side] of /** @type {const} */ ([["left", 90, "R"], ["right", -90, "L"]])) {
  test(`straight run then turn ${name}: lowered ${side} wheel in mesh all through the turn, eased down`, () => {
    const c = new Chariot({ mechanism: "song" });
    const cd = new ClutchDisplay();
    straight(7.3)(c);
    let p = c.pose();
    cd.update(p.clutch, 1 / 60);
    const steps = 30;
    for (let i = 0; i < steps; i++) {
      pivot((angle * D) / steps)(c);
      p = c.pose();
      cd.update(p.clutch, 1 / 60);
      const g = p.gears;
      if (side === "R") assert.ok(inPhase(g.smallR - 2 * g.footR), `step ${i}`);
      else assert.ok(inPhase(g.smallL + 2 * g.footL), `step ${i}`);
      assert.ok(inPhase(g[`small${side}`] + 4 * g.bigFlat), `step ${i}: big flat wheel in mesh`);
      if (i === 0) assert.ok(cd.e[side] > 0 && cd.e[side] < 1, "dropping, not down yet");
    }
    for (let i = 0; i < 60 * CLUTCH_TIME; i++) cd.update(p.clutch, 1 / 60);
    assert.equal(cd.e[side], 1);
    assert.equal(cd.e[side === "R" ? "L" : "R"], 0);
    assert.ok(cd.eased(side) === 1);
  });
}

test("dt 0 or Infinity jumps to the end state; reset raises both", () => {
  const cd = new ClutchDisplay();
  cd.update({ left: true, right: false }, 0);
  assert.deepEqual(cd.e, { L: 1, R: 0 });
  cd.update({ left: false, right: true }, Infinity);
  assert.deepEqual(cd.e, { L: 0, R: 1 });
  cd.reset();
  assert.deepEqual(cd.e, { L: 0, R: 0 });
});

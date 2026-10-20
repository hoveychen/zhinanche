// Song clutch display (js/scene/clutchPhase.js): a small flat wheel lowered
// after a straight run is shown in mesh with its foot gear and the big flat wheel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Chariot } from "../../js/sim/chariot.js";
import { pivot, straight } from "../../js/sim/drive.js";
import { ClutchDisplay, SMALL_PITCH, bigOffset, modCentered, smallOffset } from "../../js/scene/clutchPhase.js";

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

test("offsets put any angle in phase, by at most half a tooth", () => {
  for (const small of [0, 0.1, -2.3, 7]) {
    for (const foot of [0, 0.37, -5.1]) {
      const oR = smallOffset("R", small, foot);
      const oL = smallOffset("L", small, foot);
      assert.ok(inPhase(small + oR - 2 * foot));
      assert.ok(inPhase(small + oL + 2 * foot));
      assert.ok(Math.abs(oR) <= SMALL_PITCH / 2 + 1e-12);
      const b = bigOffset(small + oR, 1.234);
      assert.ok(inPhase(small + oR + 4 * (1.234 + b)));
      assert.ok(Math.abs(b) <= SMALL_PITCH / 8 + 1e-12, "under half a big-wheel tooth");
    }
  }
});

for (const [name, angle, side] of /** @type {const} */ ([["left", 90, "R"], ["right", -90, "L"]])) {
  test(`straight run then turn ${name}: lowered ${side} wheel shown in mesh all through the turn`, () => {
    const c = new Chariot({ mechanism: "song" });
    const cd = new ClutchDisplay();
    straight(7.3)(c);
    let p = c.pose();
    cd.update(p.clutch, p.gears, 1 / 60);
    const steps = 30;
    for (let i = 0; i < steps; i++) {
      pivot((angle * D) / steps)(c);
      p = c.pose();
      cd.update(p.clutch, p.gears, 1 / 60);
      const shown = cd.shown(p.gears);
      const g = p.gears;
      if (side === "R") assert.ok(inPhase(shown.smallR - 2 * g.footR), `step ${i}`);
      else assert.ok(inPhase(shown.smallL + 2 * g.footL), `step ${i}`);
    }
    for (let i = 0; i < 60; i++) cd.update(p.clutch, p.gears, 1 / 60);
    const shown = cd.shown(p.gears);
    assert.ok(inPhase(shown[`small${side}`] + 4 * shown.bigFlat), "big flat wheel settles in mesh");
    assert.equal(cd.e[side], 1);
    assert.equal(cd.e[side === "R" ? "L" : "R"], 0);
  });
}

test("the display never touches the sim's angles", () => {
  const c = new Chariot({ mechanism: "song" });
  const cd = new ClutchDisplay();
  straight(3.3)(c);
  pivot(30 * D)(c);
  const before = c.pose();
  cd.update(before.clutch, before.gears, 1);
  assert.deepEqual(c.pose(), before);
});

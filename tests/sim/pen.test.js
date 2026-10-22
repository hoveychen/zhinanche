// The courtyard's invisible wall (js/sim/pen.js): the lessons' routes never
// meet it, and what is outside it is driven back to well inside.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Chariot } from "../../js/sim/chariot.js";
import { MANOEUVRES } from "../../js/sim/scenarios.js";
import { BACK, PEN, backInside, outside } from "../../js/sim/pen.js";

/** How the lessons start a route: facing north, or 40° east of it where the child drives (js/app/app.js). */
const STARTS = [Math.PI / 2, Math.PI / 2 - (40 * Math.PI) / 180];

for (const [name, list] of Object.entries(MANOEUVRES)) {
  test(`the lessons' route ${name} stays inside the wall`, () => {
    for (const mechanism of /** @type {const} */ (["differential", "song"])) {
      for (const heading of STARTS) {
        const c = new Chariot({ mechanism, heading });
        let worst = 0;
        const step = c.step.bind(c);
        c.step = (s) => {
          step(s);
          // room to spare: the routes are meant to stay clear of it, not graze it
          const m = 10;
          worst = Math.max(worst, outside({ x: c.x + Math.sign(c.x) * m, y: c.y + Math.sign(c.y) * m }));
        };
        for (const m of list) m(c);
        assert.equal(worst, 0, `${mechanism} from ${heading.toFixed(2)}: ${worst} out`);
      }
    }
  });
}

test("outside: 0 inside, the distance past the wall outside", () => {
  assert.equal(outside({ x: 0, y: 0 }), 0);
  assert.equal(outside({ x: PEN.x, y: PEN.north }), 0);
  assert.equal(outside({ x: PEN.x + 3, y: 0 }), 3);
  assert.equal(outside({ x: 0, y: PEN.south - 2 }), 2);
  assert.equal(outside({ x: -PEN.x - 3, y: PEN.north + 4 }), 5);
});

test("backInside: straight in from the wall it is past, BACK inside it", () => {
  assert.deepEqual(backInside({ x: PEN.x + 1, y: 10 }), { x: PEN.x - BACK, y: 10 });
  assert.deepEqual(backInside({ x: 5, y: PEN.south - 1 }), { x: 5, y: PEN.south + BACK });
  assert.deepEqual(backInside({ x: -PEN.x - 9, y: PEN.north + 9 }), { x: -PEN.x + BACK, y: PEN.north - BACK });
  assert.deepEqual(backInside({ x: 3, y: -4 }), { x: 3, y: -4 });
});

// A drawn route is joined onto the chariot (js/sim/route.js joinRoute), so the
// chariot drives along the line the child sees instead of looping to reach it.

import test from "node:test";
import assert from "node:assert/strict";
import { Chariot } from "../../js/sim/chariot.js";
import { joinParts, joinRoute, SNAP } from "../../js/sim/route.js";
import { FollowPlayer } from "../../js/app/playback.js";

/** @param {{x: number, y: number}} a @param {{x: number, y: number}} b */
const line = (a, b, n = 20) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));

/** How far the chariot strays from the polyline while following it. @param {Chariot} c @param {{x: number, y: number}[]} route */
function worstStray(c, route) {
  const pts = [{ x: c.x, y: c.y }, ...route];
  const p = new FollowPlayer(pts, "smooth");
  const off = () => {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2));
      best = Math.min(best, Math.hypot(c.x - a.x - t * dx, c.y - a.y - t * dy));
    }
    return best;
  };
  let worst = 0;
  for (let i = 0; i < 20000 && !p.done; i++) {
    p.update(c, 1 / 60, 1);
    worst = Math.max(worst, off());
  }
  assert.ok(p.done, "finishes the route");
  return worst;
}

test("a stroke drawn through the chariot starts where it passes it", () => {
  const c = new Chariot(); // at the origin, facing +y
  // begun up and to the right, through the chariot, on down to the left
  const stroke = line({ x: 8, y: 6 }, { x: -12, y: -14 });
  const r = joinRoute(c, stroke);
  assert.ok(Math.hypot(r[0].x, r[0].y) < SNAP, "starts by the chariot");
  assert.deepEqual(r[r.length - 1], stroke[stroke.length - 1]);
  // the line passes 1.4 chi from the chariot's centre: it swings onto it
  assert.ok(worstStray(c, r) < 2, "keeps to the line");
});

test("a stroke begun ahead of the chariot is reached by a smooth curve", () => {
  const c = new Chariot();
  const stroke = line({ x: 6, y: 12 }, { x: 20, y: 14 });
  const r = joinRoute(c, stroke);
  assert.ok(r.length > stroke.length, "a lead-in is added");
  // it leaves along the heading: the first points are ahead, not off to the side
  assert.ok(r[0].y > 0 && Math.abs(r[0].x) < r[0].y);
  assert.ok(worstStray(c, r) < 1.5, "keeps to the line");
});

test("a stroke behind the chariot gets no lead-in (it turns on the spot first)", () => {
  const c = new Chariot();
  const stroke = line({ x: 0, y: -8 }, { x: -10, y: -20 });
  assert.deepEqual(joinRoute(c, stroke), stroke);
});

test("a stroke begun right by the chariot, across its heading, is reached by a curve, not a corner", () => {
  const c = new Chariot(); // facing +y
  // begun 2.5 chi ahead, drawn off to the left: a straight line onto it would turn 90° at its start
  const stroke = line({ x: 0, y: 2.5 }, { x: -16, y: 2.5 });
  const { lead } = joinParts(c, stroke);
  assert.ok(lead.length >= 3, "a lead-in is added");
  const r = [{ x: c.x, y: c.y }, ...joinRoute(c, stroke)];
  let worst = 0;
  for (let i = 2; i < r.length; i++) {
    const a = Math.atan2(r[i - 1].y - r[i - 2].y, r[i - 1].x - r[i - 2].x), b = Math.atan2(r[i].y - r[i - 1].y, r[i].x - r[i - 1].x);
    worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))));
  }
  assert.ok(worst < (50 * Math.PI) / 180, `no sharp corner (worst ${((worst * 180) / Math.PI).toFixed(0)}°)`);
  assert.ok(worstStray(c, r.slice(1)) < 1.5, "keeps to the line");
});

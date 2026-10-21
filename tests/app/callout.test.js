// The part callout keeps off the controls on the 3D view (js/app/callout.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { placeCallout } from "../../js/app/callout.js";

/** @param {{x: number, y: number}} p @param {{w: number, h: number}} s @param {{x: number, y: number, w: number, h: number}} c */
const covers = (p, s, c) => p.x < c.x + c.w && p.x + s.w > c.x && p.y < c.y + c.h && p.y + s.h > c.y;

const view = { w: 1024, h: 640 };
const size = { w: 240, h: 70 };

test("with nothing in the way it sits just above the point, centred", () => {
  assert.deepEqual(placeCallout({ x: 500, y: 400 }, size, view, []), { x: 380, y: 312 });
});

test("a point under the dial puts the callout beside or below it, not over it", () => {
  const dial = { x: 12, y: 12, w: 156, h: 190 };
  const at = { x: 120, y: 230 };
  const p = placeCallout(at, size, view, [dial]);
  assert.ok(!covers(p, size, dial), JSON.stringify(p));
  assert.ok(Math.hypot(p.x + size.w / 2 - at.x, p.y + size.h / 2 - at.y) < 260, "and stays near the point");
});

test("a point under the pause button on a phone keeps the callout off the button", () => {
  const phone = { w: 390, h: 420 };
  const pause = { x: 290, y: 8, w: 92, h: 44 };
  const share = { x: 250, y: 60, w: 132, h: 40 };
  const p = placeCallout({ x: 300, y: 80 }, { w: 260, h: 64 }, phone, [pause, share]);
  assert.ok(!covers(p, { w: 260, h: 64 }, pause) && !covers(p, { w: 260, h: 64 }, share), JSON.stringify(p));
  assert.ok(p.x >= 8 && p.x + 260 <= phone.w - 8 && p.y >= 8 && p.y + 64 <= phone.h - 8, "inside the view");
});

test("near the top edge it goes below the point instead of over it", () => {
  const p = placeCallout({ x: 500, y: 40 }, size, view, []);
  assert.ok(p.y >= 40, JSON.stringify(p));
});

test("a label asked to sit beside its point does, level with it, on the side asked for", () => {
  const size = { w: 80, h: 30 }, view = { w: 1000, h: 800 };
  const l = placeCallout({ x: 500, y: 400 }, size, view, [], 30, "left");
  const r = placeCallout({ x: 500, y: 400 }, size, view, [], 30, "right");
  assert.ok(l.x + size.w <= 500 - 20 && Math.abs(l.y + size.h / 2 - 400) < 2, JSON.stringify(l));
  assert.ok(r.x >= 500 + 20 && Math.abs(r.y + size.h / 2 - 400) < 2, JSON.stringify(r));
});

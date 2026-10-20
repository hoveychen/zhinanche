// The lesson player's directive folding (js/app/directive.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_CONTROLS, applyDirective, freeBase, hasFaults, hasSlip, lessonBase, stateAt } from "../../js/app/directive.js";
import { LESSONS } from "../../js/teach/lessons.js";

test("omitted fields keep their value; play and reset are one-shot", () => {
  const a = applyDirective(lessonBase(), { reset: true, mechanism: "song", xray: true, play: "circle", controls: ["drive"] });
  assert.equal(a.reset, true);
  assert.equal(a.play, "circle");
  assert.equal(a.rebuild, true);
  assert.equal(a.state.mechanism, "song");
  const b = applyDirective(a.state, { view: "top" });
  assert.equal(b.reset, false);
  assert.equal(b.play, null);
  assert.equal(b.rebuild, false);
  assert.equal(b.viewChanged, true);
  assert.equal(b.state.mechanism, "song");
  assert.equal(b.state.xray, true);
  assert.deepEqual(b.state.controls, ["drive"]);
});

test("demo: null clears it, undefined keeps it", () => {
  const a = applyDirective(lessonBase(), { demo: "compass" }).state;
  assert.equal(applyDirective(a, {}).state.demo, "compass");
  assert.equal(applyDirective(a, { demo: null }).state.demo, null);
});

test("faults and slip: {} clears them; a fault change asks for a rebuild", () => {
  const a = applyDirective(lessonBase(), { faults: { trackScale: 1.1 }, slip: { slipR: 0.2 } });
  assert.equal(a.rebuild, true);
  assert.ok(hasFaults(a.state.faults));
  assert.ok(hasSlip(a.state.slip));
  const b = applyDirective(a.state, { faults: {}, slip: {} });
  assert.equal(b.rebuild, true);
  assert.ok(!hasFaults(b.state.faults));
  assert.ok(!hasSlip(b.state.slip));
  assert.equal(applyDirective(b.state, { faults: {} }).rebuild, false, "same faults, no rebuild");
});

test("bad directives are refused", () => {
  assert.throws(() => applyDirective(lessonBase(), { play: "nowhere" }));
  assert.throws(() => applyDirective(lessonBase(), { explode: 2 }));
  assert.throws(() => applyDirective(lessonBase(), { speed: 0 }));
});

test("the directive does not alias the previous state's arrays", () => {
  const prev = lessonBase();
  const h = applyDirective(prev, { highlight: ["figure"] }).state;
  h.highlight.push("pole");
  assert.deepEqual(prev.highlight, []);
});

test("free driving shows every control", () => {
  assert.deepEqual(freeBase().controls, ALL_CONTROLS);
});

test("every step of every lesson folds without error, and stateAt agrees with stepping forward", () => {
  for (const l of LESSONS) {
    let s = lessonBase();
    l.steps.forEach((step, i) => {
      s = applyDirective(s, step.scene).state;
      assert.deepEqual(stateAt(l.steps, i), s, `${l.id}[${i}]`);
    });
  }
});

test("lesson 5's drift step really runs the Song chariot without the charioteer's help", () => {
  const l = LESSONS.find((x) => x.id === "two-ways");
  assert.ok(l);
  const i = l.steps.findIndex((s) => s.scene?.play === "circle");
  const s = stateAt(l.steps, i);
  assert.equal(s.mechanism, "song");
  assert.equal(s.assist, false);
});

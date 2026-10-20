// The lessons are data that another module (the lesson player) interprets, so
// every name they use must exist: routes in MANOEUVRES, enum values in
// js/teach/types.js, picture files with a REUSE entry. Plus the writing rules
// from docs/lesson-format.md that a machine can check.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { LESSONS } from "../js/teach/lessons.js";
import { MANOEUVRES } from "../js/sim/scenarios.js";
import { DESIGN } from "../js/sim/params.js";

/** @import { LessonStep, Task } from "../js/teach/types.js" */

const root = new URL("../", import.meta.url);
const typesSrc = readFileSync(new URL("js/teach/types.js", root), "utf8");

/**
 * The string literals of a `@typedef {"a" | "b"} Name` in types.js.
 * @param {string} name
 */
function enumOf(name) {
  const m = typesSrc.match(new RegExp(`@typedef \\{([^}]*)\\} ${name}\\b`));
  assert.ok(m, `typedef ${name} not found in types.js`);
  const values = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(values.length > 0, `typedef ${name} has no literals`);
  return new Set(values);
}

const VIEWS = enumOf("ViewId");
const CONTROLS = enumOf("ControlId");
const PARTS = enumOf("PartId");
const DEMOS = enumOf("DemoId");
const CHECKS = enumOf("CheckId");
const MECHANISMS = new Set(Object.keys(DESIGN));
const SCENE_KEYS = new Set(["reset", "mechanism", "view", "xray", "explode", "highlight", "trails", "odometer", "assist", "faults", "slip", "play", "speed", "demo", "controls"]);
const FAULT_KEYS = new Set(["trackScale", "leftWheelScale", "rightWheelScale"]);
const SLIP_KEYS = new Set(["slipL", "slipR"]);

/** Every step with a label for error messages. */
const STEPS = LESSONS.flatMap((l) => l.steps.map((s, i) => ({ s, at: `${l.id}[${i}]` })));

/** All child-facing strings of a step. @param {LessonStep} s */
function strings(s) {
  const out = [s.text];
  /** @type {Task | undefined} */
  const t = s.task;
  if (t?.kind === "choose") out.push(t.prompt, ...t.options, t.right, t.wrong);
  if (t?.kind === "do") out.push(t.prompt, t.done);
  if (s.picture) out.push(s.picture.alt);
  return out;
}

test("six lessons in the agreed order, unique ids, every lesson has steps", () => {
  assert.deepEqual(
    LESSONS.map((l) => l.title),
    ["指南车是什么", "自己开一开", "转弯时两个轮子", "齿轮怎么「记账」", "古人的两种造法", "它会出错吗"],
  );
  assert.equal(new Set(LESSONS.map((l) => l.id)).size, LESSONS.length);
  for (const l of LESSONS) {
    assert.match(l.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(l.summary.length > 0, l.id);
    assert.ok(l.steps.length > 0, l.id);
    for (const s of l.steps) assert.ok(typeof s.text === "string" && s.text.length > 0, l.id);
  }
});

test("each lesson starts from a known state (reset + mechanism)", () => {
  for (const l of LESSONS) {
    const first = l.steps[0].scene;
    assert.equal(first?.reset, true, l.id);
    assert.ok(first?.mechanism && MECHANISMS.has(first.mechanism), l.id);
  }
});

test("scene directives only use known fields and enum values", () => {
  for (const { s, at } of STEPS) {
    const sc = s.scene;
    if (!sc) continue;
    for (const k of Object.keys(sc)) assert.ok(SCENE_KEYS.has(k), `${at}: unknown scene field ${k}`);
    if (sc.mechanism !== undefined) assert.ok(MECHANISMS.has(sc.mechanism), `${at}: mechanism ${sc.mechanism}`);
    if (sc.view !== undefined) assert.ok(VIEWS.has(sc.view), `${at}: view ${sc.view}`);
    if (sc.demo !== undefined && sc.demo !== null) assert.ok(DEMOS.has(sc.demo), `${at}: demo ${sc.demo}`);
    for (const c of sc.controls ?? []) assert.ok(CONTROLS.has(c), `${at}: control ${c}`);
    for (const p of sc.highlight ?? []) assert.ok(PARTS.has(p), `${at}: part ${p}`);
    if (sc.play !== undefined) assert.ok(Object.hasOwn(MANOEUVRES, sc.play), `${at}: route ${sc.play} not in MANOEUVRES`);
    if (sc.explode !== undefined) assert.ok(sc.explode >= 0 && sc.explode <= 1, `${at}: explode`);
    if (sc.speed !== undefined) assert.ok(sc.speed > 0, `${at}: speed`);
    for (const [k, v] of Object.entries(sc.faults ?? {})) {
      assert.ok(FAULT_KEYS.has(k), `${at}: fault ${k}`);
      assert.ok(typeof v === "number" && v > 0.5 && v < 2, `${at}: fault ${k}=${v}`);
    }
    for (const [k, v] of Object.entries(sc.slip ?? {})) {
      assert.ok(SLIP_KEYS.has(k), `${at}: slip ${k}`);
      assert.ok(typeof v === "number" && v >= 0 && v < 1, `${at}: slip ${k}=${v}`);
    }
  }
});

test("tasks are well formed: checks exist, choice answers index the options", () => {
  for (const { s, at } of STEPS) {
    const t = s.task;
    if (!t) continue;
    assert.ok(t.prompt.length > 0, at);
    if (t.kind === "do") {
      assert.ok(CHECKS.has(t.check), `${at}: check ${t.check}`);
      assert.ok(t.done.length > 0, at);
    } else {
      assert.equal(t.kind, "choose", at);
      assert.ok(t.options.length >= 2, `${at}: needs at least two options`);
      assert.equal(new Set(t.options).size, t.options.length, `${at}: duplicate options`);
      assert.ok(Number.isInteger(t.answer) && t.answer >= 0 && t.answer < t.options.length, `${at}: answer ${t.answer}`);
      assert.ok(t.right.length > 0 && t.wrong.length > 0, at);
    }
  }
});

test("a step that needs a control shows it", () => {
  /** @type {Record<string, string>} */
  const needs = { xrayOn: "xray", opened: "explode", switchedToSong: "mechanism", drewRoute: "draw", drove: "drive", turnedLeft: "drive", turnedRight: "drive", turnedAround: "drive" };
  for (const l of LESSONS) {
    /** @type {string[]} */
    let controls = [];
    l.steps.forEach((s, i) => {
      if (s.scene?.controls) controls = s.scene.controls;
      const t = s.task;
      if (t?.kind === "do" && needs[t.check]) assert.ok(controls.includes(needs[t.check]), `${l.id}[${i}]: ${t.check} needs control ${needs[t.check]}`);
    });
  }
});

test("pictures exist under images/, have alt text, a credit and a REUSE entry", () => {
  const reuse = readFileSync(new URL("REUSE.toml", root), "utf8");
  for (const { s, at } of STEPS) {
    const p = s.picture;
    if (!p) continue;
    assert.match(p.src, /^images\//, at);
    assert.ok(existsSync(new URL(p.src, root)), `${at}: missing ${p.src}`);
    assert.ok(p.alt.length > 0 && p.credit.length > 0, at);
    assert.ok(reuse.includes(`"${p.src}"`), `${at}: ${p.src} has no annotation in REUSE.toml`);
  }
});

test("text uses only the allowed inline HTML", () => {
  const allowed = /^<(?:\/?b|\/?em|br|span class="[lr]"|\/span)>$/;
  for (const { s, at } of STEPS) {
    for (const str of strings(s)) {
      for (const tag of str.match(/<[^>]*>/g) ?? []) assert.match(tag, allowed, `${at}: tag ${tag}`);
    }
  }
});

test("no formulas: no maths symbols, no ratios written with colons", () => {
  // Full-width punctuation such as 「：」 is fine; these are not.
  const forbidden = /[πθ=×÷√∑≈≠<>±°%^*/+]|\d\s*:\s*\d/u;
  for (const { s, at } of STEPS) {
    for (const str of strings(s)) {
      const plain = str.replace(/<[^>]*>/g, "");
      const m = plain.match(forbidden);
      assert.equal(m, null, `${at}: formula-like ${JSON.stringify(m?.[0])} in ${JSON.stringify(plain)}`);
    }
  }
});

test("wheel colours: the left wheel is blue (.l) and the right wheel orange (.r), never swapped", () => {
  for (const { s, at } of STEPS) {
    for (const [, cls, word] of s.text.matchAll(/<span class="([lr])">([^<]*)<\/span>/g)) {
      if (word.includes("左")) assert.equal(cls, "l", `${at}: ${word}`);
      if (word.includes("右")) assert.equal(cls, "r", `${at}: ${word}`);
    }
  }
});

test("the chariot is never said to use a magnet", () => {
  const all = STEPS.flatMap(({ s }) => strings(s)).join("\n");
  assert.ok(all.includes("没有磁铁"), "some step must say the chariot has no magnet");
  assert.ok(all.includes("司南"), "some step must separate it from 司南");
});

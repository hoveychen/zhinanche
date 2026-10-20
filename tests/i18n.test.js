// The English tables must say everything the Chinese ones say: the same keys
// all the way down (a missing key would show "undefined" on the page), the
// same kind of value under each key, every lesson step and task field, and a
// display name for every part label in the GLB files.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STR } from "../js/teach/strings.js";
import { STR_EN } from "../js/teach/strings.en.js";
import { LESSONS } from "../js/teach/lessons.js";
import { LESSONS_EN } from "../js/teach/lessons.en.js";

/**
 * Every leaf path of a table with the kind of value there ("string", "fn/2",
 * "number"). parts.names is a lookup by GLB label, checked on its own below.
 * @param {unknown} v @param {string} at @param {Map<string, string>} out
 */
function shape(v, at = "", out = new Map()) {
  if (at === ".parts.names") return out;
  if (Array.isArray(v)) {
    out.set(`${at}[]`, `array/${v.length}`);
    v.forEach((x, i) => shape(x, `${at}[${i}]`, out));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) shape(x, `${at}.${k}`, out);
  } else out.set(at, typeof v === "function" ? `fn/${v.length}` : typeof v);
  return out;
}

test("strings.en.js has exactly the keys of strings.js, with the same kinds of value", () => {
  const zh = shape(STR), en = shape(STR_EN);
  const missing = [...zh.keys()].filter((k) => !en.has(k));
  const extra = [...en.keys()].filter((k) => !zh.has(k));
  assert.deepEqual(missing, [], "keys missing from the English table");
  assert.deepEqual(extra, [], "keys only in the English table");
  for (const [k, kind] of zh) assert.equal(en.get(k), kind, `${k}: different kind of value`);
});

test("no English string is empty or left in Chinese, except the plaque's 南", () => {
  for (const [k] of shape(STR_EN)) {
    const v = k.split(/\.|\[(\d+)\]/).filter(Boolean).reduce((o, p) => /** @type {any} */ (o)[p], /** @type {unknown} */ (STR_EN));
    if (typeof v !== "string" || k === ".landmarkPlaque" || k === ".bar.langButton" || k === ".bar.langLabel") continue;
    if (k === ".hud.sub" || k === ".scene.plaqueSub") continue;
    assert.ok(v.length > 0, `${k} is empty`);
    assert.doesNotMatch(v, /[一-鿿]/, `${k} still has Chinese: ${v}`);
  }
  // the switch names the other language
  assert.match(STR.bar.langButton, /^[A-Z]+$/);
  assert.match(STR_EN.bar.langButton, /[一-鿿]/);
});

test("the home page shortcuts jump to the same lesson steps in both languages", () => {
  assert.deepEqual(STR_EN.asks.map((a) => [a.lesson, a.step]), STR.asks.map((a) => [a.lesson, a.step]));
});

test("lessons.en.js covers every lesson, step, task field and picture of lessons.js", () => {
  assert.deepEqual(Object.keys(LESSONS_EN).sort(), LESSONS.map((l) => l.id).sort());
  for (const l of LESSONS) {
    const t = LESSONS_EN[l.id];
    assert.ok(t.title && t.summary, `${l.id}: title and summary`);
    assert.equal(t.steps.length, l.steps.length, `${l.id}: number of steps`);
    l.steps.forEach((s, i) => {
      const w = t.steps[i];
      const at = `${l.id}[${i}]`;
      assert.ok(w.text, `${at}: text`);
      assert.equal(w.text.split(/\n\n+/).length > 0, true);
      assert.equal(Boolean(w.picture), Boolean(s.picture), `${at}: picture`);
      if (s.picture && w.picture) assert.ok(w.picture.alt && w.picture.credit, `${at}: picture alt and credit`);
      assert.equal(Boolean(w.task), Boolean(s.task), `${at}: task`);
      if (s.task?.kind === "choose") {
        assert.deepEqual(Object.keys(w.task ?? {}).sort(), ["options", "prompt", "right", "wrong"], `${at}: choose task fields`);
        assert.equal(w.task?.options?.length, s.task.options.length, `${at}: number of options`);
      }
      if (s.task?.kind === "do") assert.deepEqual(Object.keys(w.task ?? {}).sort(), ["done", "prompt"], `${at}: do task fields`);
      // the wheel colours mark the same words
      const marks = (/** @type {string} */ x) => [...x.matchAll(/<span class="(l|r)">/g)].map((m) => m[1]).join("");
      assert.equal(marks(w.text), marks(s.text), `${at}: left/right colour spans`);
      for (const x of [w.text, w.task?.prompt, ...(w.task?.options ?? []), w.task?.right, w.task?.wrong, w.task?.done, w.picture?.alt]) {
        if (x) assert.doesNotMatch(x, /[一-鿿]/, `${at}: still Chinese: ${x}`);
      }
    });
  }
});

/** Part labels in a GLB's node extras. @param {string} file */
function glbLabels(file) {
  const b = readFileSync(new URL(`../assets/${file}`, import.meta.url));
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8"));
  return /** @type {{extras?: {label?: string}}[]} */ (json.nodes).flatMap((n) => (n.extras?.label ? [n.extras.label] : []));
}

test("every part label in the GLB files has an English name, and no name is for a label that is gone", () => {
  const labels = new Set([...glbLabels("chariot-differential.glb"), ...glbLabels("chariot-song.glb")]);
  const names = STR_EN.parts.names;
  assert.deepEqual([...labels].filter((l) => !(l in names)), [], "labels without an English name");
  assert.deepEqual(Object.keys(names).filter((l) => !labels.has(l)), [], "English names for labels not in any GLB");
});

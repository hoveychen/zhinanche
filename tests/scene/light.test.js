// The trees are impostors path-traced once under the court's sun and sky
// (blender/scripts/render_impostors.py): their light is baked in. The page's
// sun (js/scene/environment.js SUN) must be the one they were baked under, or
// a tree is lit from another side than the walls beside it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (/** @type {string} */ p) => readFileSync(new URL(p, root), "utf8");

test("render_impostors.py bakes the trees under environment.js's sun", () => {
  const js = read("js/scene/environment.js");
  const sun = js.match(/export const SUN = \{([\s\S]*?)\n\};/);
  assert.ok(sun, "environment.js SUN");
  /** @param {string} k */
  const num = (k) => {
    const m = /** @type {string} */ (sun?.[1]).match(new RegExp(`\\b${k}: (0x[0-9a-f]+|[\\d.]+)`, "i"));
    assert.ok(m, `SUN.${k}`);
    return Number(m[1]);
  };
  const py = read("blender/scripts/render_impostors.py");
  /** @param {RegExp} re */
  const pyNums = (re) => {
    const m = py.match(re);
    assert.ok(m, String(re));
    return m.slice(1).map(Number);
  };
  assert.deepEqual(pyNums(/^SUN_ELEVATION, SUN_NORTH_OF_WEST = ([\d.]+), ([\d.]+)$/m), [num("elevation"), num("northOfWest")]);
  assert.equal(pyNums(/^SUN_HEX = (0x[0-9A-Fa-f]+)$/m)[0], num("colour"));
  assert.equal(pyNums(/^SUN_STRENGTH = ([\d.]+)$/m)[0], num("intensity"));
  assert.equal(pyNums(/^ENV_INTENSITY = ([\d.]+)$/m)[0], num("sky"));
});

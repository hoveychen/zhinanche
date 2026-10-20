// Procedural textures (js/scene/texgen.js): right sizes, opaque, and seamless
// when tiled (the last column/row runs on into the first).

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateChariot, generateScene } from "../../js/scene/texgen.js";

const lite = { ...generateChariot("lite"), ...generateScene("lite") };

test("every texture is square RGBA and opaque", () => {
  for (const [name, t] of Object.entries(lite)) {
    assert.equal(t.data.length, t.size * t.size * 4, name);
    for (let i = 3; i < t.data.length; i += 4 * 97) assert.equal(t.data[i], 255, name);
  }
});

test("the chariot's and the scene's sets cover what the materials ask for", () => {
  for (const k of ["wood", "woodSoft", "woodRough", "woodNormal", "metal", "metalRough", "metalNormal"]) assert.ok(generateChariot("lite")[k], k);
  for (const k of ["stone", "stoneRough", "stoneNormal", "tiles", "tilesRough", "tilesNormal", "clouds"]) assert.ok(lite[k], k);
});

/** Mean |difference| between two pixel columns (or rows) of channel 0. */
function seam(/** @type {{data: Uint8ClampedArray | Uint8Array, size: number}} */ t, /** @type {boolean} */ rows, /** @type {number} */ a, /** @type {number} */ b) {
  let sum = 0;
  for (let k = 0; k < t.size; k++) {
    const ia = rows ? a * t.size + k : k * t.size + a, ib = rows ? b * t.size + k : k * t.size + b;
    sum += Math.abs(t.data[ia * 4] - t.data[ib * 4]);
  }
  return sum / t.size;
}

test("textures tile: the wrap-around seam is no harsher than neighbouring pixels", () => {
  for (const name of ["wood", "metal", "stone", "tiles", "clouds"]) {
    const t = lite[name], n = t.size;
    for (const rows of [false, true]) {
      let inside = 0;
      for (let k = 0; k < n - 1; k += 7) inside = Math.max(inside, seam(t, rows, k, k + 1));
      assert.ok(seam(t, rows, n - 1, 0) <= inside * 1.5 + 1, `${name} ${rows ? "rows" : "cols"}`);
    }
  }
});

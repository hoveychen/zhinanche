// Every lesson part id must name nodes that exist in a GLB, and every motion
// node's pose key must be one the scene knows how to drive.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEFT_NODES, PART_NODES, RIGHT_NODES, ownerOf, partCaption } from "../../js/scene/parts.js";
import { Chariot } from "../../js/sim/chariot.js";

/** @param {string} m @returns {{name: string, extras?: Record<string, any>}[]} */
function nodes(m) {
  const buf = readFileSync(new URL(`../../assets/chariot-${m}.glb`, import.meta.url));
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8")).nodes;
}
const GLB = { differential: nodes("differential"), song: nodes("song") };
const ALL = new Set([...GLB.differential, ...GLB.song].map((n) => n.name));

test("PART_NODES covers every PartId and names real nodes", () => {
  const src = readFileSync(new URL("../../js/teach/types.js", import.meta.url), "utf8");
  const m = src.match(/@typedef \{([^}]*)\} PartId/);
  assert.ok(m);
  assert.deepEqual(new Set(Object.keys(PART_NODES)), new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])));
  for (const [id, names] of Object.entries(PART_NODES)) for (const n of names) assert.ok(ALL.has(n), `${id}: ${n}`);
  for (const n of [...LEFT_NODES, ...RIGHT_NODES]) assert.ok(ALL.has(n), n);
});

test("every motion node is driven by a key the sim provides", () => {
  for (const mechanism of /** @type {const} */ (["differential", "song"])) {
    const keys = new Set(Object.keys(new Chariot({ mechanism }).pose().gears));
    for (const n of GLB[mechanism]) {
      const ex = n.extras ?? {};
      if (ex.motion === "rotate") assert.ok(keys.has(ex.pose), `${mechanism} ${n.name} pose ${ex.pose}`);
      else if (ex.motion === "lift") assert.ok(ex.pose === "clutchL" || ex.pose === "clutchR", n.name);
      else assert.equal(ex.motion, undefined, n.name);
    }
  }
});

test("captions", () => {
  assert.equal(ownerOf("song.bigFlat.marker"), "song.bigFlat");
  assert.equal(ownerOf("wheel.L"), "wheel.L");
  assert.deepEqual(partCaption({ label: "大平轮", teeth: 48 }), { title: "大平轮", detail: "48 个齿" });
  assert.match(partCaption({ label: "左边的平齿轮（下层）", teeth: 42, sideTeeth: 16 }).detail, /42 个齿.*16/);
  assert.equal(partCaption({ label: "车辕" }).detail, "");
});

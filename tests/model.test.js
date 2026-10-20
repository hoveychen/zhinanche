// The GLB files are an API (docs/model-contract.md): node names, extras, markers and the
// triangle budget are checked here straight from the binary, without three.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chariot } from "../js/sim/chariot.js";
import { PARAMS } from "../js/sim/params.js";

/** @import { MechanismId } from "../js/sim/params.js" */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_TRIANGLES = 120_000;
const MAX_BYTES = 5 * 1024 * 1024;
const GROUPS = ["shell", "chassis", "wheel", "gear", "figure"];

/**
 * @typedef {{name?: string, mesh?: number, children?: number[], extras?: Record<string, any>}} GNode
 * @typedef {{nodes: GNode[], meshes: {primitives: {indices?: number, mode?: number, attributes: Record<string, number>}[]}[], accessors: {count: number}[]}} Gltf
 */

/** @param {string} path @returns {Gltf} */
function readGlb(path) {
  const buf = readFileSync(path);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, "glTF magic");
  assert.equal(buf.readUInt32LE(4), 2, "glTF version 2");
  const len = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, "first chunk is JSON");
  return JSON.parse(buf.subarray(20, 20 + len).toString("utf8"));
}

/** @param {MechanismId} m */
function load(m) {
  const path = join(root, "assets", `chariot-${m}.glb`);
  const gltf = readGlb(path);
  /** @type {Map<string, GNode>} */
  const byName = new Map();
  /** @type {Map<string, string>} */
  const parent = new Map();
  for (const n of gltf.nodes) {
    assert.ok(n.name, "every node has a name");
    assert.ok(!byName.has(n.name), `duplicate node ${n.name}`);
    byName.set(n.name, n);
  }
  for (const n of gltf.nodes) for (const c of n.children ?? []) parent.set(/** @type {string} */ (gltf.nodes[c].name), /** @type {string} */ (n.name));
  return { path, gltf, byName, parent };
}

/** @param {Map<string, string>} parent @param {string} name @param {string} anc */
function descends(parent, name, anc) {
  for (let p = parent.get(name); p; p = parent.get(p)) if (p === anc) return true;
  return false;
}

const REQUIRED = {
  common: ["chariot", "wheel.L", "wheel.R", "figure", "figure.shaft"],
  differential: ["diff.sideA", "diff.sideB", "diff.carrier", "diff.pinion.0", "diff.pinion.1", "diff.crown.L", "diff.crown.R"],
  song: ["song.foot.L", "song.foot.R", "song.small.L", "song.small.R", "song.smallLift.L", "song.smallLift.R", "song.bigFlat", "song.roller.L", "song.roller.R"],
};

const TEETH = {
  differential: {
    "diff.crown.L": PARAMS.differential.crownLeftTeeth.v,
    "diff.sideA": PARAMS.differential.crownLeftTeeth.v,
    "diff.crown.R": PARAMS.differential.crownRightTeeth.v,
    "diff.sideB": PARAMS.differential.crownRightTeeth.v,
    "diff.pinion.0": PARAMS.differential.pinionTeeth.v,
    "diff.pinion.1": PARAMS.differential.pinionTeeth.v,
  },
  song: {
    "song.foot.L": 24, "song.foot.R": 24, "song.small.L": 12, "song.small.R": 12, "song.bigFlat": 48,
  },
};

for (const m of /** @type {MechanismId[]} */ (["differential", "song"])) {
  const { path, gltf, byName, parent } = load(m);
  const poseKeys = new Set(Object.keys(new Chariot({ mechanism: m }).pose().gears));

  test(`${m}: file size and triangle budget`, () => {
    assert.ok(statSync(path).size < MAX_BYTES, `${statSync(path).size} bytes`);
    let tris = 0;
    for (const n of gltf.nodes) {
      if (n.mesh === undefined) continue;
      for (const p of gltf.meshes[n.mesh].primitives) {
        assert.equal(p.mode ?? 4, 4, "triangles only");
        const count = p.indices !== undefined ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count;
        tris += count / 3;
      }
    }
    assert.ok(tris > 1000 && tris < MAX_TRIANGLES, `${tris} triangles`);
  });

  test(`${m}: required nodes, all under the root`, () => {
    for (const name of [...REQUIRED.common, ...REQUIRED[m]]) assert.ok(byName.has(name), `missing ${name}`);
    assert.ok([...byName.keys()].some((n) => n.startsWith("body.")), "body.* nodes");
    for (const name of byName.keys()) if (name !== "chariot") assert.ok(descends(parent, name, "chariot"), `${name} not under chariot`);
    if (m === "differential") {
      assert.equal(parent.get("diff.pinion.0"), "diff.carrier");
      assert.equal(parent.get("diff.pinion.1"), "diff.carrier");
    } else {
      assert.equal(parent.get("song.small.L"), "song.smallLift.L");
      assert.equal(parent.get("song.small.R"), "song.smallLift.R");
    }
  });

  test(`${m}: motion extras name real pose keys`, () => {
    let movers = 0;
    for (const [name, n] of byName) {
      const x = n.extras ?? {};
      if (!x.motion) continue;
      movers++;
      assert.equal(x.axis.length, 3, name);
      assert.ok(Math.abs(Math.hypot(...x.axis) - 1) < 1e-6, `${name}: unit axis`);
      if (x.motion === "rotate") {
        assert.ok(poseKeys.has(x.pose), `${name}: pose key ${x.pose} not in Chariot.pose().gears`);
        assert.equal(typeof x.factor, "number", name);
      } else {
        assert.equal(x.motion, "lift", name);
        assert.ok(m === "song" && ["clutchL", "clutchR"].includes(x.pose), `${name}: ${x.pose}`);
        assert.ok(x.distance > 0, name);
        assert.deepEqual(x.axis, [0, 1, 0], name);
      }
    }
    assert.ok(movers >= 8, `${movers} animated nodes`);
    // A positive wheel angle rolls forward: right-handed about the chariot's left (-Z).
    for (const w of ["wheel.L", "wheel.R"]) {
      const x = /** @type {Record<string, any>} */ (byName.get(w)?.extras);
      assert.deepEqual([x.pose, x.axis, x.factor], [w === "wheel.L" ? "wheelL" : "wheelR", [0, 0, -1], 1]);
    }
    for (const n of ["figure", "figure.shaft"]) assert.equal(byName.get(n)?.extras?.pose, "figure");
    if (m === "song") {
      assert.equal(byName.get("song.smallLift.L")?.extras?.pose, "clutchL");
      assert.equal(byName.get("song.smallLift.R")?.extras?.pose, "clutchR");
    }
  });

  test(`${m}: teaching extras on every mesh node`, () => {
    for (const [name, n] of byName) {
      if (n.mesh === undefined) continue;
      const x = n.extras ?? {};
      assert.ok(GROUPS.includes(x.group), `${name}: group ${x.group}`);
      assert.ok(typeof x.label === "string" && x.label.length > 0, `${name}: label`);
      assert.ok(Array.isArray(x.explode) && x.explode.length === 3 && x.explode.every(Number.isFinite), `${name}: explode`);
    }
    assert.ok([...byName.values()].some((n) => n.extras?.group === "shell"), "shell group present");
  });

  test(`${m}: tooth counts match the params and every gear has a marker tooth`, () => {
    for (const [name, teeth] of Object.entries(TEETH[m])) {
      assert.equal(byName.get(name)?.extras?.teeth, teeth, name);
    }
    for (const [name, n] of byName) {
      if (n.extras?.teeth === undefined) continue;
      assert.equal(parent.get(`${name}.marker`), name, `${name}.marker`);
    }
    if (m === "differential") {
      // ratio 1: each crown wheel has as many pegs as the horizontal gear it drives
      assert.equal(byName.get("diff.crown.L")?.extras?.teeth, byName.get("diff.sideA")?.extras?.teeth);
      assert.equal(byName.get("diff.crown.R")?.extras?.teeth, byName.get("diff.sideB")?.extras?.teeth);
      assert.equal(byName.get("diff.sideA")?.extras?.sideTeeth, PARAMS.differential.sideGearTeeth.v);
    }
  });
}

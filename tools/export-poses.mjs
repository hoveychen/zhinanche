// Run the scripted routes through js/sim and write sampled poses for the Blender
// clearance sweep (blender/scripts/check_clearance.py).
//
//   node tools/export-poses.mjs [--every N] [--out DIR]
//
// Writes DIR/poses-differential.json and DIR/poses-song.json (default DIR:
// blender/out). Every route starts from a fresh chariot, so at its first pose all
// gears sit in their meshing phase; `every` is the sampling stride in sim steps
// (one step = at most 0.05 chi of wheel travel, about 1° of wheel turn).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Chariot } from "../js/sim/chariot.js";
import { pivot, run, straight } from "../js/sim/drive.js";
import { MANOEUVRES, randomDrawing, randomManoeuvres } from "../js/sim/scenarios.js";
import { RouteFollower } from "../js/sim/route.js";

/** @import { MechanismId } from "../js/sim/params.js" */
/** @import { Manoeuvre } from "../js/sim/drive.js" */
/** @import { Step } from "../js/sim/chariot.js" */

const D = Math.PI / 180;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (/** @type {string} */ name, /** @type {string} */ def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const every = Number(arg("--every", "4"));
const outDir = resolve(arg("--out", join(root, "blender", "out")));

/**
 * @typedef {object} Sample
 * @property {string} label
 * @property {Record<string, number>} gears
 * @property {number} figureRel
 * @property {{left: boolean, right: boolean}} clutch
 */

/** A chariot that records its pose every `stride` steps. */
class Recorder extends Chariot {
  /**
   * @param {MechanismId} mechanism
   * @param {string} label
   * @param {Sample[]} out
   * @param {number} stride
   */
  constructor(mechanism, label, out, stride) {
    super({ mechanism });
    this.label = label;
    this.out = out;
    this.stride = stride;
    this.n = 0;
    this.record();
  }

  /** @param {Step} s */
  step(s) {
    super.step(s);
    if (++this.n % this.stride === 0) this.record();
  }

  record() {
    const p = this.pose();
    this.out.push({ label: `${this.label}#${this.n}`, gears: p.gears, figureRel: p.figureRel, clutch: p.clutch });
  }
}

/** @param {MechanismId} mechanism */
function poses(mechanism) {
  /** @type {Sample[]} */
  const out = [];
  /** @type {[string, Manoeuvre[]][]} */
  const routes = Object.entries(MANOEUVRES);
  for (const seed of [1, 2, 3]) routes.push([`random${seed}`, randomManoeuvres(seed, 20)]);
  for (const [name, list] of routes) {
    const c = new Recorder(mechanism, name, out, every);
    run(c, list);
    c.record();
  }
  // Dense runs from rest: every step, so each peg passes its partner in ~1° steps.
  /** @type {[string, Manoeuvre[]][]} */
  const dense = [
    ["dense-pivotLeft", [pivot(90 * D)]],
    ["dense-pivotRight", [pivot(-90 * D)]],
    ["dense-straight", [straight(20)]],
  ];
  for (const [name, list] of dense) run(new Recorder(mechanism, name, out, 1), list);
  const c = new Recorder(mechanism, "drawing3", out, every);
  const f = new RouteFollower(randomDrawing(3), { style: mechanism === "song" ? "pivot" : "smooth" });
  for (let i = 0; i < 20000 && !f.done; i++) f.update(c, 1 / 60);
  return out;
}

mkdirSync(outDir, { recursive: true });
for (const m of /** @type {MechanismId[]} */ (["differential", "song"])) {
  const list = poses(m);
  const path = join(outDir, `poses-${m}.json`);
  writeFileSync(path, JSON.stringify({ mechanism: m, every, poses: list }));
  console.log(`POSES ${m}: ${list.length} -> ${path}`);
}

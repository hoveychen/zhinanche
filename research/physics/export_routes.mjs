// Export the scripted routes from js/sim as per-step wheel angles, clutch state and the
// kinematic figure angle, for the rigid-body check (research/physics/sim.py).
//
//   node research/physics/export_routes.mjs [--root DIR] [--out FILE]
//
// --root: repository whose js/sim to use (default: this checkout). One step = at most
// 0.05 chi of wheel travel (js/sim/drive.js MAX_STEP), the same subdivision the site uses.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const root = resolve(arg("--root", join(here, "..", "..")));
const out = resolve(arg("--out", join(here, "out", "routes.json")));
const imp = (p) => import(pathToFileURL(join(root, p)).href);

const { Chariot } = await imp("js/sim/chariot.js");
const { pivot, run, straight } = await imp("js/sim/drive.js");
const { MANOEUVRES, randomDrawing, randomManoeuvres, rng } = await imp("js/sim/scenarios.js");
const { RouteFollower } = await imp("js/sim/route.js");

const N_RANDOM = 20;

/** Straights and swings round the inner wheel only: the Song charioteer's way. */
function randomPivotManoeuvres(seed, n = 40) {
  const r = rng(seed);
  const list = [];
  for (let i = 0; i < n; i++) {
    const k = r();
    const ang = (r() * 2 - 1) * Math.PI;
    if (k < 0.4) list.push(straight((r() * 2 - 0.4) * 15));
    else list.push(pivot(ang));
  }
  return list;
}

class Recorder extends Chariot {
  constructor(mechanism) {
    super({ mechanism });
    this.rec = { wheelL: [], wheelR: [], clutchL: [], clutchR: [], heading: [], figureRel: [], errorDeg: [], path: [] };
    this.record();
  }
  step(s) {
    super.step(s);
    this.record();
  }
  record() {
    const p = this.pose();
    const r = this.rec;
    r.wheelL.push(p.wheelL);
    r.wheelR.push(p.wheelR);
    r.clutchL.push(p.clutch.left ? 1 : 0);
    r.clutchR.push(p.clutch.right ? 1 : 0);
    r.heading.push(p.heading);
    r.figureRel.push(this.figureRel); // gear angle of the figure relative to the body, 0 at start
    r.errorDeg.push(p.errorDeg);
    r.path.push((p.pathL + p.pathR) / 2);
  }
}

function fromList(mechanism, list) {
  const c = new Recorder(mechanism);
  run(c, list);
  return c.rec;
}

function fromDrawing(mechanism, seed, style) {
  const c = new Recorder(mechanism);
  const f = new RouteFollower(randomDrawing(seed), { style });
  for (let i = 0; i < 20000 && !f.done; i++) f.update(c, 1 / 60);
  return c.rec;
}

const M = MANOEUVRES;
const routes = [];
const add = (mechanism, mode, name, rec) => routes.push({ mechanism, mode, name, ...rec });

// Differential: every route, any style of driving.
for (const name of ["straight", "reverse", "spinLeft", "pivotLeft", "pivotSquare", "circle", "sCurve", "figureEight"]) {
  add("differential", "any", name, fromList("differential", M[name]));
}
add("differential", "any", "drawing", fromDrawing("differential", 3, "smooth"));
for (let s = 1; s <= N_RANDOM; s++) add("differential", "any", `random${s}`, fromList("differential", randomManoeuvres(s)));

// Song, charioteer helping: straights and swings round the inner wheel.
for (const name of ["straight", "reverse", "pivotLeft", "pivotSquare", "pivotZigzag"]) {
  add("song", "pivot", name, fromList("song", M[name]));
}
add("song", "pivot", "drawing", fromDrawing("song", 3, "pivot"));
for (let s = 1; s <= N_RANDOM; s++) add("song", "pivot", `random${s}`, fromList("song", randomPivotManoeuvres(s)));

// Song, ordinary turns (both wheels rolling, or spinning about the middle): drifts by design.
for (const name of ["spinLeft", "circle", "sCurve", "figureEight"]) add("song", "normal", name, fromList("song", M[name]));
add("song", "normal", "drawing", fromDrawing("song", 3, "smooth"));
for (let s = 1; s <= N_RANDOM; s++) add("song", "normal", `random${s}`, fromList("song", randomManoeuvres(s)));

const params = JSON.parse((await import("node:fs")).readFileSync(join(root, "params", "chariot.json"), "utf8"));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ root, params, routes }));
let steps = 0;
for (const r of routes) steps += r.wheelL.length;
console.log(`ROUTES ${routes.length} steps ${steps} -> ${out}`);

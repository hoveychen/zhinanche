// Driving into the courtyard's invisible wall (js/sim/pen.js, App #wall):
// the chariot never gets past it, drives itself back in for real, and the
// figure keeps to south as on any other drive.

import { test } from "node:test";
import assert from "node:assert/strict";
import { App } from "../../js/app/app.js";
import { freeBase } from "../../js/app/directive.js";
import { outside } from "../../js/sim/pen.js";

/** Half a tooth of the Song chariot's big flat gear (48 teeth): the most one engagement costs. */
const HALF_BIG_TOOTH = 360 / 48 / 2;
const DT = 1 / 60;

/** An App on a stand-in world, holding `held` on the arrows. @param {Partial<import("../../js/app/directive.js").SceneState>} over */
function rig(over = {}, held = { fwd: 1, turn: 0 }) {
  const noop = () => {};
  const world = {
    showPose: noop, setView: noop, frameRoute: noop, clearTrails: noop,
    route: { clear: noop, set: noop },
    rigs: {},
    holdHands: { reset: noop },
    cam: { opening: false, unframe: noop },
  };
  const input = { enabled: true, drawOn: false, command: () => held };
  const app = new App(/** @type {any} */ (world), /** @type {any} */ (input));
  app.state = { ...freeBase(), view: "follow", ...over };
  app.resetChariot(false);
  const walls = { on: 0, off: 0 };
  app.onWall = (on) => (on ? walls.on++ : walls.off++);
  return { app, input, walls };
}

/** Run for `secs`; the most the chariot got past the wall, and the most the figure was off south. @param {App} app @param {number} secs */
function run(app, secs) {
  let out = 0, err = 0;
  for (let t = 0; t < secs; t += DT) {
    app.tick(DT);
    out = Math.max(out, outside(app.chariot));
    err = Math.max(err, Math.abs(app.chariot.pose().errorDeg));
  }
  return { out, err };
}

test("held on ahead, the chariot is turned back at the wall again and again and never gets past it", () => {
  const { app, walls } = rig();
  const { out, err } = run(app, 240);
  assert.ok(walls.on >= 3, `met the wall ${walls.on} times`);
  // a frame's drive at most (5 chi/s)
  assert.ok(out < 0.2, `got ${out} past the wall`);
  // the differential's figure points true through it all, as it does on any drive
  assert.ok(err < 1e-5, `figure ${err}° off`);
});

test("driving back is real driving: the wheels roll and it ends inside, facing in, the child driving again", () => {
  const { app, walls } = rig({}, { fwd: 1, turn: 0.05 });
  const before = app.chariot.distL + app.chariot.distR;
  for (let t = 0; t < 120 && walls.off === 0; t += DT) app.tick(DT);
  assert.ok(walls.off === 1, "got back in");
  assert.equal(outside(app.chariot), 0);
  assert.ok(app.chariot.distL + app.chariot.distR > before + 30, "the wheels rolled");
  // the child's arrows drive it again
  const at = { x: app.chariot.x, y: app.chariot.y };
  app.tick(0.5);
  assert.ok(Math.hypot(app.chariot.x - at.x, app.chariot.y - at.y) > 0.5);
});

test("the Song chariot with the charioteer's help drives back by swinging round a wheel: off by its engagements only, as on any drive", () => {
  const { app, walls } = rig({ mechanism: "song", assist: true }, { fwd: 1, turn: 0 });
  const { out, err } = run(app, 240);
  assert.ok(walls.on >= 2, `met the wall ${walls.on} times`);
  // swinging round a wheel the middle comes round a little past where it stood
  assert.ok(out < 4, `got ${out} past the wall`);
  const n = app.chariot.pose().engagements;
  assert.ok(err <= n * HALF_BIG_TOOTH + 1e-9, `${err}° after ${n} engagements`);
});

test("a road drawn out through the wall is dropped at it, and the chariot drives back in", () => {
  const { app, walls } = rig({}, { fwd: 0, turn: 0 });
  // world points: due east, far beyond the corridor
  const pts = [];
  for (let x = 0; x <= 200; x += 2) pts.push({ x, z: 0 });
  app.followRoute(pts);
  const { out } = run(app, 120);
  assert.equal(walls.on, 1);
  assert.equal(app.follow, null);
  assert.ok(out < 0.2, `got ${out} past the wall`);
  assert.equal(outside(app.chariot), 0);
});

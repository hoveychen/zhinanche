// Auto-playing a named route (SceneDirective.play) over time. A manoeuvre from
// js/sim/scenarios.js drives a chariot all at once; here we record the small
// steps it would take and feed them to the real chariot a few per frame. The
// scene never computes kinematics itself: Chariot.step() does.
//
// Song chariot with the charioteer's help on: a route that turns any other way
// than round the inner wheel is driven like a drawn route, in the "pivot"
// style (js/sim/route.js), so the figure stays true, as the help promises.

import { Chariot } from "../sim/chariot.js";
import { RouteFollower } from "../sim/route.js";
import { MANOEUVRES } from "../sim/scenarios.js";

/** @import { Step } from "../sim/chariot.js" */
/** @import { Slip, Manoeuvre } from "../sim/drive.js" */
/** @import { MechanismId } from "../sim/params.js" */
/** @import { Point } from "../sim/route.js" */

/** Wheel travel per second at speed 1 (chi/s); RouteFollower's default speed too. */
export const BASE_RATE = 6;

/**
 * The steps a list of manoeuvres takes on a chariot with this track.
 * @param {Manoeuvre[]} list
 * @param {number} track the chariot's real track (chi)
 * @param {Slip} [slip]
 * @returns {Step[]}
 */
export function recordSteps(list, track, slip) {
  /** @type {Step[]} */
  const out = [];
  const recorder = { track, step: (/** @type {Step} */ s) => out.push({ ...s }) };
  for (const m of list) m(/** @type {Chariot} */ (/** @type {unknown} */ (recorder)), slip);
  return out;
}

/** Every step is straight, or swings round a wheel that stays still. @param {Step[]} steps */
export function isPivotOnly(steps) {
  const eps = 1e-9;
  return steps.every((s) => Math.abs(s.groundL) < eps || Math.abs(s.groundR) < eps || Math.abs(s.groundL - s.groundR) < eps);
}

/**
 * Where the chariot's centre goes along these steps, from a start pose.
 * @param {Step[]} steps
 * @param {{x: number, y: number, heading: number, track: number}} from
 * @param {number} [gap] keep a point every `gap` chi
 * @returns {Point[]}
 */
export function tracePath(steps, from, gap = 0.5) {
  const ghost = new Chariot({ x: from.x, y: from.y, heading: from.heading });
  ghost.track = from.track;
  /** @type {Point[]} */
  const pts = [{ x: from.x, y: from.y }];
  for (const s of steps) {
    ghost.step(s);
    const p = pts[pts.length - 1];
    if (Math.hypot(ghost.x - p.x, ghost.y - p.y) >= gap) pts.push({ x: ghost.x, y: ghost.y });
  }
  const last = pts[pts.length - 1];
  if (last.x !== ghost.x || last.y !== ghost.y) pts.push({ x: ghost.x, y: ghost.y });
  return pts;
}

/**
 * Something that drives the chariot a little each frame until done.
 * @typedef {object} Player
 * @property {boolean} done
 * @property {(c: Chariot, dt: number, speed: number) => void} update
 */

/** Feeds recorded steps to a chariot at BASE_RATE × speed chi of wheel travel per second. */
export class StepPlayer {
  /** @param {Step[]} steps */
  constructor(steps) {
    this.steps = steps;
    this.index = 0;
    this.done = steps.length === 0;
  }

  /** @param {Chariot} c @param {number} dt @param {number} speed */
  update(c, dt, speed) {
    let budget = BASE_RATE * speed * dt;
    while (budget > 0 && this.index < this.steps.length) {
      const s = this.steps[this.index++];
      c.step(s);
      budget -= Math.max(Math.abs(s.groundL), Math.abs(s.groundR), 1e-3);
    }
    this.done = this.index >= this.steps.length;
  }
}

/** Route seconds per follower tick. */
export const FOLLOW_TICK = 1 / 60;

/** A RouteFollower as a Player. */
export class FollowPlayer {
  /**
   * @param {Point[]} points
   * @param {"smooth" | "pivot"} style
   * @param {Slip} [slip]
   */
  constructor(points, style, slip) {
    // Children draw tight wiggles; with the default turn rate the pursuit
    // can orbit a point inside its turning circle forever, so turn harder.
    this.follower = new RouteFollower(points, style === "smooth" ? { style, turnRate: 3, lookahead: 3 } : { style });
    this.slip = slip;
    this.done = this.follower.done;
    /** route seconds asked for so far, and fixed ticks run */
    this.elapsed = 0;
    this.ticks = 0;
  }

  /**
   * The follower runs in fixed ticks of route time, so a replay ends the same
   * whatever the frame rate or speed: the Song chariot's clutch drops a wheel
   * wherever the follower decides to turn, and each drop costs a little
   * (design/decisions/0007-song-clutch-error.md).
   * @param {Chariot} c @param {number} dt @param {number} speed
   */
  update(c, dt, speed) {
    this.elapsed += dt * speed;
    const due = Math.floor(this.elapsed / FOLLOW_TICK + 1e-6);
    while (this.ticks < due && !this.follower.done) {
      this.follower.update(c, FOLLOW_TICK, this.slip);
      this.ticks++;
    }
    // guard against a route the follower can never finish
    this.done = this.follower.done || this.elapsed > 600;
  }
}

/**
 * How to play route `name` on chariot `c`.
 * @param {string} name a MANOEUVRES key
 * @param {Chariot} c
 * @param {{mechanism: MechanismId, assist: boolean, slip?: Slip}} opts
 * @returns {{player: Player, path: Point[]}}
 */
export function planPlayback(name, c, opts) {
  const list = MANOEUVRES[name];
  if (!list) throw new Error(`unknown route "${name}"`);
  const steps = recordSteps(list, c.track, opts.slip);
  const path = tracePath(steps, c);
  if (opts.mechanism === "song" && opts.assist && !isPivotOnly(steps)) {
    return { player: new FollowPlayer(path, "pivot", opts.slip), path };
  }
  return { player: new StepPlayer(steps), path };
}

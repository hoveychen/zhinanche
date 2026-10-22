// The app core: owns the sim chariot, turns input / auto-play / drawn routes
// into Chariot steps, and keeps the 3D view and the HUD in step with the
// SceneState. Lessons, free driving and the self-test all go through direct().

import { Chariot, wrap } from "../sim/chariot.js";
import { pivotTwist, roll, twist } from "../sim/drive.js";
import { applyDirective, freeBase, hasFaults, hasSlip, sameFaults } from "./directive.js";
import { FollowPlayer, planPlayback } from "./playback.js";
import { joinParts } from "../sim/route.js";
import { Tracker } from "./checks.js";
import { RAMP, ease } from "./drive.js";
import { toSim, toWorld } from "../scene/world.js";

/** @import { World } from "../scene/world.js" */
/** @import { SceneDirective } from "../teach/types.js" */
/** @import { SceneState, DirectiveResult } from "./directive.js" */
/** @import { Player } from "./playback.js" */
/** @import { DriveInput } from "./drive.js" */
/** @import { CheckSnapshot } from "./checks.js" */
/** @import { DrawnRoute } from "./share.js" */

/** Hand driving: body speed (chi/s) and turn rate (rad/s) at speed 1. */
const DRIVE_V = 5;
const DRIVE_W = 0.9;
/**
 * Where the child drives, the chariot starts facing 40° east of north (sim
 * heading, + left of east). The chase view looks south from the north, and
 * may come round only about 20° to the west before the gate leaves the
 * picture (js/scene/cameraRig.js); facing north, the chariot was end on to
 * it, and the box (5.45 longer than the wheels front and back) hid them. Turned,
 * it is seen three-quarters on from the front, the near wheel under the box.
 */
const DRIVE_START = Math.PI / 2 - (40 * Math.PI) / 180;
export class App {
  /**
   * @param {World} world
   * @param {DriveInput} input
   */
  constructor(world, input) {
    this.world = world;
    this.input = input;
    /** @type {SceneState} */
    this.state = freeBase();
    this.chariot = new Chariot();
    /** auto-play of a lesson route */
    /** @type {Player | null} */
    this.player = null;
    /** the last route played, for "再看一遍" */
    /** @type {string | null} */
    this.lastPlay = null;
    /** a lesson's route that waits for the opening close view to pull back (else the child misses its start) */
    /** @type {string | null} */
    this.waiting = null;
    /** following a route the child drew */
    /** @type {FollowPlayer | null} */
    this.follow = null;
    /** the last route drawn and where the chariot set off from (for a shared link) */
    /** @type {DrawnRoute | null} */
    this.drawn = null;
    /** loop the home page's demo drive */
    this.idleLoop = false;
    this.tracker = new Tracker();
    /** @type {Set<() => void>} */
    this.listeners = new Set();
    /** @type {Set<(state: SceneState) => void>} */
    this.stateListeners = new Set();
    /** hand driving as it eases toward what is held: forward and turn, −1..1 */
    this.drive = { fwd: 0, turn: 0 };
    /** everything that moves by itself is held still (the camera still moves) */
    this.paused = false;
    /** @type {Set<(paused: boolean) => void>} */
    this.pauseListeners = new Set();
  }

  /** @param {(paused: boolean) => void} fn */
  onPause(fn) {
    this.pauseListeners.add(fn);
  }

  /** @param {boolean} on */
  setPaused(on) {
    if (on === this.paused) return;
    this.paused = on;
    if (on) this.drive = { fwd: 0, turn: 0 };
    for (const fn of this.pauseListeners) fn(on);
  }

  /** Notify on state changes (tools, HUD visibility). @param {(state: SceneState) => void} fn */
  onState(fn) {
    this.stateListeners.add(fn);
  }

  /** Called every frame after the sim moved (checks, HUD). @param {() => void} fn */
  onTick(fn) {
    this.listeners.add(fn);
  }

  /**
   * Apply a directive from a lesson step or a control.
   * @param {SceneDirective} d
   * @param {{jump?: SceneState}} [opts] jump: adopt this whole state (going back / opening a lesson)
   */
  direct(d, opts = {}) {
    // pressing anything carries on: pause only holds what was already playing
    this.setPaused(false);
    const j = opts.jump;
    /** @type {DirectiveResult} */
    const res = j
      ? {
        state: j,
        reset: d.reset === true,
        play: d.play ?? null,
        rebuild: j.mechanism !== this.state.mechanism || !sameFaults(j.faults, this.state.faults),
        viewChanged: true,
      }
      : applyDirective(this.state, d);
    this.#adopt(res);
  }

  /** @param {DirectiveResult} res */
  #adopt(res) {
    const prev = this.state;
    const st = res.state;
    this.state = st;
    if (res.reset) this.resetChariot(false);
    else if (res.rebuild) this.#rebuild();
    const w = this.world;
    w.setMechanism(st.mechanism);
    // Put the model where the (maybe reset) chariot is first: the demos and
    // the camera are placed from it.
    w.showPose(this.chariot.pose(), 0);
    w.setLook(st.xray, st.highlight);
    w.setExplode(st.explode);
    w.setTrails(st.trails);
    if (st.demo !== prev.demo || res.reset) w.setDemo(st.demo);
    this.input.enabled = st.controls.includes("drive");
    if (!st.controls.includes("draw") && this.input.drawOn) this.input.setDraw(false);
    // the big figure would fill the close view of the gears
    w.setFigureBig(st.view !== "gears" && st.view !== "works" && st.view !== "pair" && st.view !== "diff", res.reset && res.viewChanged);
    this.tracker.sawBroken(this.broken);
    for (const fn of this.stateListeners) fn(st);
    // after the listeners: the views keep clear of this step's HUD (a view
    // placed at once, as the first one is, would keep the last step's margins)
    w.cam.brief = !this.idleLoop;
    if (res.viewChanged || st.view !== prev.view || (st.demo !== prev.demo && st.demo === "holdHands")) w.setView(st.view);
    this.waiting = null;
    if (res.play && st.view === "intro" && !this.idleLoop) this.waiting = res.play;
    else if (res.play) this.play(res.play);
    w.showPose(this.chariot.pose(), 0);
  }

  get broken() {
    return hasFaults(this.state.faults) || hasSlip(this.state.slip);
  }

  /** Free driving, everything on show. @param {Partial<SceneState>} [over] a shared setup */
  free(over = {}) {
    this.idleLoop = false;
    this.drawn = null;
    this.direct({ reset: true }, { jump: { ...freeBase(), view: "follow", ...over } });
  }

  /** Drive a drawn route from where it set off (a shared link). @param {DrawnRoute} r */
  driveDrawn(r) {
    this.resetChariot(false);
    const st = this.state;
    this.chariot = new Chariot({ mechanism: st.mechanism, faults: st.faults, x: r.x, y: r.y, heading: r.heading });
    this.world.clearTrails();
    this.world.showPose(this.chariot.pose(), 0);
    this.world.setView(st.view, true);
    for (const fn of this.stateListeners) fn(st);
    const pts = r.pts.map(toWorld);
    this.followRoute(pts);
  }

  /**
   * Back at the start: facing north at the origin, figure pointing south.
   * Where the child drives (the chase view), turned a little to the east.
   * @param {boolean} [notify]
   */
  resetChariot(notify = true) {
    const st = this.state;
    const heading = st.controls.includes("drive") ? DRIVE_START : undefined;
    this.chariot = new Chariot({ mechanism: st.mechanism, faults: st.faults, heading });
    this.player = null;
    this.follow = null;
    this.world.route.clear();
    this.world.clearTrails();
    for (const r of Object.values(this.world.rigs)) r.resetClutch();
    this.world.holdHands.reset();
    if (notify) {
      this.world.showPose(this.chariot.pose(), 0);
      this.world.setView(st.view);
      for (const fn of this.stateListeners) fn(st);
    }
  }

  /** Rebuild the chariot for a new mechanism or new faults, where it stands. */
  #rebuild() {
    const old = this.chariot;
    const st = this.state;
    const c = new Chariot({ mechanism: st.mechanism, faults: st.faults, x: old.x, y: old.y, heading: old.heading });
    // Keep the odometers. Same mechanism: keep the figure and gears where they
    // were too (a fault fixed half-way does not undo the error already made).
    c.distL = old.distL; c.distR = old.distR; c.pathL = old.pathL; c.pathR = old.pathR;
    if (old.mechanism === c.mechanism) {
      c.wheelL = old.wheelL; c.wheelR = old.wheelR;
      c.figureRel = old.figureRel; c.figureOffset = old.figureOffset;
      c.gears = { ...old.gears };
      c.clutch = { ...old.clutch };
      c.engagements = old.engagements; c.engageErr = old.engageErr;
    } else {
      for (const r of Object.values(this.world.rigs)) r.resetClutch();
    }
    this.chariot = c;
    // a route in progress was planned for the old chariot
    this.player = null;
  }

  /** @param {string} name a MANOEUVRES key */
  play(name) {
    this.waiting = null;
    this.follow = null;
    this.world.route.clear();
    this.lastPlay = name;
    const st = this.state;
    const { player, path } = planPlayback(name, this.chariot, { mechanism: st.mechanism, assist: st.assist, slip: st.slip });
    this.player = player;
    if (st.view === "top") this.world.frameRoute(path);
  }

  /** Play the last route again from the start. */
  replay() {
    if (!this.lastPlay) return;
    const name = this.lastPlay;
    this.setPaused(false);
    this.resetChariot();
    this.play(name);
  }

  get playing() {
    return this.waiting !== null || (this.player !== null && !this.player.done);
  }

  /** Run any auto-play to its end at once (self-test). */
  finishPlayback() {
    for (let i = 0; i < 200000 && this.player && !this.player.done; i++) this.player.update(this.chariot, 0.05, 1);
    this.world.showPose(this.chariot.pose(), 0);
  }

  /**
   * Drive along a route drawn on the ground.
   * @param {{x: number, z: number}[]} worldPts
   */
  followRoute(worldPts) {
    this.player = null;
    this.setPaused(false);
    const c = this.chariot;
    // joined onto the chariot: it sets off along the line, and the line shown is the one it drives
    const joined = this.showRoute(worldPts);
    this.drawn = { x: c.x, y: c.y, heading: c.heading, pts: joined };
    const pts = [{ x: c.x, y: c.y }, ...joined];
    const st = this.state;
    const style = st.mechanism === "song" && st.assist ? "pivot" : "smooth";
    this.follow = new FollowPlayer(pts, style, st.slip);
    // Keep the whole drawing (and the chariot on it) clear of the HUD.
    if (st.view === "top") this.world.frameRoute(pts);
  }

  /**
   * Show a route (one being drawn too) joined onto the chariot as it will
   * drive it: the lead-in onto the child's line dashed. Returns the joined
   * route (sim, the chariot's own position not included).
   * @param {{x: number, z: number}[]} worldPts
   */
  showRoute(worldPts) {
    const c = this.chariot;
    const { lead, stroke } = joinParts(c, worldPts.map(toSim));
    const joined = [...lead, ...stroke];
    this.world.route.set([{ x: c.x, y: c.y }, ...joined].map(toWorld), lead.length + 1);
    return joined;
  }

  /** The child took the wheel: stop any auto-play. */
  takeOver() {
    this.setPaused(false);
    if (this.player) this.player = null;
    this.waiting = null;
    this.world.cam.unframe();
    if (this.follow) {
      this.follow = null;
      this.world.route.clear();
    }
    this.idleLoop = false;
  }

  /** @param {number} dt */
  tick(dt) {
    if (this.paused) dt = 0;
    const c = this.chariot;
    const before = { x: c.x, y: c.y, heading: c.heading, d: (c.distL + c.distR) / 2 };
    let byChild = false;
    const speed = this.state.speed;
    if (this.waiting && dt > 0 && !this.world.cam.opening) this.play(this.waiting);
    if ((this.player && !this.player.done) || this.follow) this.drive = { fwd: 0, turn: 0 };
    if (this.player && !this.player.done) {
      this.player.update(c, dt, speed);
      if (this.player.done && this.idleLoop && this.lastPlay) {
        const name = this.lastPlay;
        this.resetChariot();
        this.play(name);
      }
    } else if (this.follow) {
      this.follow.update(c, dt, speed);
      byChild = true;
      if (this.follow.done) {
        this.follow = null;
        this.tracker.routeDone();
      }
    } else {
      const want = this.input.command();
      const dr = this.drive;
      dr.fwd = ease(dr.fwd, want.fwd, dt, RAMP.up, RAMP.brake);
      dr.turn = ease(dr.turn, want.turn, dt, RAMP.steer, RAMP.steer);
      if (dr.fwd !== 0 || dr.turn !== 0) {
        const st = this.state;
        const v = dr.fwd * DRIVE_V * speed, omega = dr.turn * DRIVE_W * speed;
        const g = st.mechanism === "song" && st.assist ? pivotTwist(v, omega, dt, c.track) : twist(v, omega, dt, c.track);
        roll(c, g.groundL, g.groundR, st.slip);
        byChild = true;
      }
    }
    if (byChild) this.tracker.drove((c.distL + c.distR) / 2 - before.d, wrap(c.heading - before.heading));
    this.tracker.sawBroken(this.broken);
    this.world.showPose(c.pose(), dt);
    for (const fn of this.listeners) fn();
  }

  /** @returns {CheckSnapshot} */
  snapshot() {
    return {
      xray: this.state.xray,
      explode: this.state.explode,
      mechanism: this.state.mechanism,
      broken: this.broken,
      errorDeg: this.chariot.pose().errorDeg,
    };
  }

  /** Start a fresh tracker (a step opened). */
  newTracker() {
    this.tracker = new Tracker();
    this.tracker.sawBroken(this.broken);
  }

  /** Chariot position in world coordinates. */
  where() {
    return toWorld(this.chariot);
  }
}

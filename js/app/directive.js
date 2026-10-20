// What the 3D view should look like: the lesson player's SceneDirective
// (js/teach/types.js) folded into a full SceneState. Pure data, no DOM and no
// three.js, so it is tested in node (tests/app/directive.test.js).

import { MANOEUVRES } from "../sim/scenarios.js";

/** @import { SceneDirective, ControlId, ViewId, PartId, DemoId } from "../teach/types.js" */
/** @import { MechanismId } from "../sim/params.js" */
/** @import { Faults } from "../sim/chariot.js" */
/** @import { Slip } from "../sim/drive.js" */

/** @type {ControlId[]} */
export const ALL_CONTROLS = ["drive", "draw", "mechanism", "assist", "faults", "slip", "xray", "explode", "reset", "speed", "gearsView"];

/**
 * @typedef {object} SceneState
 * @property {MechanismId} mechanism
 * @property {ViewId} view
 * @property {boolean} xray
 * @property {number} explode
 * @property {PartId[]} highlight
 * @property {boolean} trails
 * @property {boolean} odometer
 * @property {boolean} assist
 * @property {Faults} faults
 * @property {Slip} slip
 * @property {number} speed
 * @property {DemoId | null} demo
 * @property {ControlId[]} controls
 */

/** The state a lesson starts from before its first step. @returns {SceneState} */
export function lessonBase() {
  return {
    mechanism: "differential", view: "overview", xray: false, explode: 0, highlight: [],
    trails: false, odometer: false, assist: true, faults: {}, slip: {}, speed: 1, demo: null, controls: [],
  };
}

/** Free driving: everything on show. @returns {SceneState} */
export function freeBase() {
  return { ...lessonBase(), trails: true, odometer: true, controls: [...ALL_CONTROLS] };
}

/**
 * What applying a directive asks the scene to do besides adopting the new state.
 * @typedef {object} DirectiveResult
 * @property {SceneState} state
 * @property {boolean} reset start fresh: chariot at the origin facing north, trails cleared
 * @property {boolean} rebuild the chariot must be rebuilt (mechanism or faults changed) even without reset
 * @property {string | null} play a MANOEUVRES key to auto-play
 * @property {boolean} viewChanged
 */

/**
 * Apply one step's directive on top of the current state. Omitted fields keep
 * their value; `play` and `reset` are one-shot actions, not state.
 * @param {SceneState} prev
 * @param {SceneDirective | undefined} d
 * @returns {DirectiveResult}
 */
export function applyDirective(prev, d = {}) {
  if (d.play !== undefined && !(d.play in MANOEUVRES)) throw new Error(`unknown route "${d.play}"`);
  if (d.explode !== undefined && !(d.explode >= 0 && d.explode <= 1)) throw new Error(`explode out of range: ${d.explode}`);
  if (d.speed !== undefined && !(d.speed > 0)) throw new Error(`bad speed: ${d.speed}`);
  /** @type {SceneState} */
  const state = {
    mechanism: d.mechanism ?? prev.mechanism,
    view: d.view ?? prev.view,
    xray: d.xray ?? prev.xray,
    explode: d.explode ?? prev.explode,
    highlight: d.highlight ? [...d.highlight] : prev.highlight,
    trails: d.trails ?? prev.trails,
    odometer: d.odometer ?? prev.odometer,
    assist: d.assist ?? prev.assist,
    faults: d.faults ? { ...d.faults } : prev.faults,
    slip: d.slip ? { ...d.slip } : prev.slip,
    speed: d.speed ?? prev.speed,
    demo: d.demo !== undefined ? d.demo : prev.demo,
    controls: d.controls ? [...d.controls] : prev.controls,
  };
  const rebuild = state.mechanism !== prev.mechanism || !sameFaults(state.faults, prev.faults);
  return {
    state,
    reset: d.reset === true,
    rebuild,
    play: d.play ?? null,
    viewChanged: d.view !== undefined,
  };
}

/**
 * The state at step `index` of a lesson when jumping there directly (going
 * back, or opening a lesson part-way): fold every directive from the start.
 * @param {{scene?: SceneDirective}[]} steps
 * @param {number} index
 * @returns {SceneState}
 */
export function stateAt(steps, index) {
  let s = lessonBase();
  for (let i = 0; i <= index && i < steps.length; i++) s = applyDirective(s, steps[i].scene).state;
  return s;
}

/** @param {Faults} a @param {Faults} b */
export function sameFaults(a, b) {
  return (a.trackScale ?? 1) === (b.trackScale ?? 1)
    && (a.leftWheelScale ?? 1) === (b.leftWheelScale ?? 1)
    && (a.rightWheelScale ?? 1) === (b.rightWheelScale ?? 1);
}

/** A chariot built differently from its gears. @param {Faults} f */
export function hasFaults(f) {
  return !sameFaults(f, {});
}

/** @param {Slip} s */
export function hasSlip(s) {
  return (s.slipL ?? 0) !== 0 || (s.slipR ?? 0) !== 0;
}

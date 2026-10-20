// Lesson data format. Lessons are plain data (js/teach/lessons.js); the app's
// lesson player (js/app/) turns each step's `scene` into actions on the 3D
// scene and checks `task`. See docs/lesson-format.md.

/** @import { MechanismId } from "../sim/params.js" */

/**
 * Camera presets the scene provides.
 * @typedef {"overview" | "top" | "follow" | "gears" | "wheels" | "figure"} ViewId
 */

/**
 * UI controls a step may show. Anything not listed is hidden while the step is active.
 * @typedef {"drive" | "draw" | "mechanism" | "assist" | "faults" | "slip" | "xray" | "explode" | "reset" | "speed"} ControlId
 */

/**
 * Highlightable parts (matches pose keys / node groups in docs/model-contract.md).
 * @typedef {"wheelL" | "wheelR" | "figure" | "sideA" | "sideB" | "carrier" | "pinion" | "crownL" | "crownR" | "footL" | "footR" | "smallL" | "smallR" | "bigFlat" | "pole"} PartId
 */

/**
 * Built-in mini demos that are not the chariot itself.
 * - holdHands: two children holding hands walk round a circle; footprints and step counters show the outer one walks further.
 * - compass: a magnetic compass needle next to the chariot, to show the difference.
 * @typedef {"holdHands" | "compass"} DemoId
 */

/**
 * What the 3D scene should look like when the step opens. Every field is optional;
 * omitted fields keep their current value, except `reset` which starts fresh.
 * @typedef {object} SceneDirective
 * @property {boolean} [reset] put the chariot back at the start, facing north, figure pointing south, clear trails
 * @property {MechanismId} [mechanism]
 * @property {ViewId} [view]
 * @property {boolean} [xray] shell transparent
 * @property {number} [explode] 0 = assembled, 1 = fully apart
 * @property {PartId[]} [highlight] glow these parts, dim the rest of the gears
 * @property {boolean} [trails] show wheel tracks on the ground
 * @property {boolean} [odometer] show how far each wheel has rolled
 * @property {boolean} [assist] Song only: charioteer swings round the inner wheel on every turn
 * @property {import("../sim/chariot.js").Faults} [faults]
 * @property {{slipL?: number, slipR?: number}} [slip]
 * @property {string} [play] auto-play a route from MANOEUVRES in js/sim/scenarios.js
 * @property {number} [speed] playback speed multiplier, default 1
 * @property {DemoId | null} [demo]
 * @property {ControlId[]} [controls]
 */

/**
 * Checks the app can evaluate while the child plays. Each is a named predicate implemented in the lesson player.
 * @typedef {"drove" | "turnedLeft" | "turnedRight" | "turnedAround" | "drewRoute" | "opened" | "xrayOn" | "switchedToSong" | "madeItDrift" | "fixedDrift" | "playedDemo"} CheckId
 */

/**
 * @typedef {object} ChoiceTask
 * @property {"choose"} kind
 * @property {string} prompt
 * @property {string[]} options
 * @property {number} answer index into options
 * @property {string} right feedback when right
 * @property {string} wrong feedback when wrong (a hint, never a scolding)
 */

/**
 * @typedef {object} DoTask
 * @property {"do"} kind
 * @property {string} prompt what to try, e.g. 「开着车拐一个弯」
 * @property {CheckId} check
 * @property {string} done feedback when the check passes
 */

/** @typedef {ChoiceTask | DoTask} Task */

/**
 * @typedef {object} Picture
 * @property {string} src path under images/
 * @property {string} alt
 * @property {string} credit author and licence, shown under the picture
 */

/**
 * One screen of a lesson.
 * @typedef {object} LessonStep
 * @property {string} text short paragraphs; allowed inline HTML: <b>, <em>, <br>, <span class="l">…</span> (left-wheel colour), <span class="r">…</span> (right-wheel colour)
 * @property {SceneDirective} [scene]
 * @property {Task} [task]
 * @property {Picture} [picture]
 */

/**
 * @typedef {object} Lesson
 * @property {string} id
 * @property {string} title
 * @property {string} summary one line for the lesson list
 * @property {LessonStep[]} steps
 */

export {};

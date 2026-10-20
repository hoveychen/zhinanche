// The "do" tasks' checks (CheckId in js/teach/types.js). A Tracker collects
// what the child did since the step opened; checkPassed() judges it against a
// snapshot of the scene. Pure logic, tested in tests/app/checks.test.js.

/** @import { CheckId } from "../teach/types.js" */
/** @import { MechanismId } from "../sim/params.js" */

const DEG = Math.PI / 180;

/** Thresholds, in one place so tests and copy agree. */
export const LIMITS = {
  /** chi the child must drive for "drove" */
  drove: 5,
  /** a turn counts once the chariot has turned this far one way */
  turn: 60 * DEG,
  /** turning round */
  around: 150 * DEG,
  /** degrees off south that count as "drifted" */
  drift: 5,
};

/**
 * What the scene looks like right now.
 * @typedef {object} CheckSnapshot
 * @property {boolean} xray
 * @property {number} explode
 * @property {MechanismId} mechanism
 * @property {boolean} broken faults or slip set
 * @property {number} errorDeg the figure's deviation from south
 */

/** What the child has done since the step opened. */
export class Tracker {
  constructor() {
    /** chi driven by the child (keys, buttons or a drawn route), centre line */
    this.userDistance = 0;
    /** net heading change while the child drove (rad, + left) */
    this.net = 0;
    this.lowest = 0;
    this.highest = 0;
    /** the biggest left turn made in one go, and right */
    this.leftRun = 0;
    this.rightRun = 0;
    this.routesDone = 0;
    this.demoLaps = 0;
    /** was the chariot faulty at any time during the step */
    this.brokenSeen = false;
  }

  /**
   * The child moved the chariot.
   * @param {number} dist centre-line distance (chi, any sign)
   * @param {number} dHeading heading change (rad, + left)
   */
  drove(dist, dHeading) {
    this.userDistance += Math.abs(dist);
    this.net += dHeading;
    this.lowest = Math.min(this.lowest, this.net);
    this.highest = Math.max(this.highest, this.net);
    this.leftRun = Math.max(this.leftRun, this.net - this.lowest);
    this.rightRun = Math.max(this.rightRun, this.highest - this.net);
  }

  routeDone() {
    this.routesDone++;
  }

  demoLap() {
    this.demoLaps++;
  }

  /** @param {boolean} broken */
  sawBroken(broken) {
    if (broken) this.brokenSeen = true;
  }
}

/**
 * @param {CheckId} id
 * @param {Tracker} t
 * @param {CheckSnapshot} s
 * @returns {boolean}
 */
export function checkPassed(id, t, s) {
  switch (id) {
    case "drove": return t.userDistance >= LIMITS.drove;
    case "turnedLeft": return t.leftRun >= LIMITS.turn;
    case "turnedRight": return t.rightRun >= LIMITS.turn;
    case "turnedAround": return Math.max(t.leftRun, t.rightRun) >= LIMITS.around;
    case "drewRoute": return t.routesDone >= 1;
    case "opened": return s.explode >= 0.5;
    case "xrayOn": return s.xray;
    case "switchedToSong": return s.mechanism === "song";
    case "madeItDrift": return s.broken && t.userDistance > 0 && Math.abs(s.errorDeg) >= LIMITS.drift;
    case "fixedDrift": return t.brokenSeen && !s.broken;
    case "playedDemo": return t.demoLaps >= 1;
    default: {
      /** @type {never} */
      const never = id;
      throw new Error(`unknown check ${never}`);
    }
  }
}

/** Every CheckId, for tests and the self-test. @type {CheckId[]} */
export const ALL_CHECKS = ["drove", "turnedLeft", "turnedRight", "turnedAround", "drewRoute", "opened", "xrayOn", "switchedToSong", "madeItDrift", "fixedDrift", "playedDemo"];

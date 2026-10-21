// Song chariot clutch, as shown on screen: the small flat wheels' drop and
// rise are eased (e: 0 raised .. 1 down). The meshing phase is the sim's job:
// js/sim/chariot.js turns the small flat wheel into its foot gear's gaps the
// moment it is lowered, and the big flat wheel (with the figure) into the
// nearest gap of the small wheel's (design/decisions/0007-song-clutch-error.md),
// so the angles shown are the sim's own.
//
// Pure maths, no three.js; tested in tests/scene/clutchPhase.test.js.

/** Seconds a small wheel takes to drop or rise. */
export const CLUTCH_TIME = 0.35;

/** Smooth clutch state for display. */
export class ClutchDisplay {
  constructor() {
    /** eased engagement, 0 raised .. 1 down */
    this.e = { L: 0, R: 0 };
  }

  reset() {
    this.e = { L: 0, R: 0 };
  }

  /**
   * @param {{left: boolean, right: boolean}} clutch
   * @param {number} dt seconds; 0 or Infinity jumps straight to the end state
   */
  update(clutch, dt) {
    const k = dt > 0 && Number.isFinite(dt) ? Math.min(1, dt / CLUTCH_TIME) : 1;
    for (const side of /** @type {const} */ (["L", "R"])) {
      const target = (side === "L" ? clutch.left : clutch.right) ? 1 : 0;
      this.e[side] += Math.sign(target - this.e[side]) * Math.min(Math.abs(target - this.e[side]), k);
    }
  }

  /** Smoothstep of the engagement, for positions. @param {"L" | "R"} side */
  eased(side) {
    const x = this.e[side];
    return x * x * (3 - 2 * x);
  }
}

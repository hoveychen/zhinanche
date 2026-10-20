// Song chariot clutch, as shown on screen. The sim lowers a small flat wheel
// instantly and only counts its angle while it is down, so after a straight
// run its pegs no longer line up with the foot gear's (docs/model-notes.md,
// "燕肃车离合落下时的齿相位"). The scene fixes that on screen only:
//
// - the lowering is eased (e: 0 raised .. 1 down);
// - the moment a small wheel starts to drop, its displayed angle gets an
//   offset that puts it in mesh with the foot gear:
//     right: small − 2·foot ≡ 0, left: small + 2·foot ≡ 0  (mod 30°);
// - the big flat wheel's displayed angle gets a small offset (under half a
//   tooth, 3.75°) so that small + 4·bigFlat ≡ 0 (mod 30°) too. The figure
//   and its shaft still use the sim's angle.
//
// Pure maths, no three.js; tested in tests/scene/clutchPhase.test.js.

/** One tooth of the 12-tooth small flat wheel (rad). */
export const SMALL_PITCH = (2 * Math.PI) / 12;

/** x mod p into (−p/2, p/2]. @param {number} x @param {number} p */
export function modCentered(x, p) {
  let r = x - p * Math.round(x / p);
  if (r <= -p / 2) r += p;
  if (r > p / 2) r -= p;
  return r;
}

/**
 * Offset to add to a small flat wheel's angle so it meshes with its foot gear.
 * @param {"L" | "R"} side
 * @param {number} small the sim's small-wheel angle
 * @param {number} foot the foot gear's angle (= its road wheel's)
 */
export function smallOffset(side, small, foot) {
  const rel = side === "R" ? small - 2 * foot : small + 2 * foot;
  return -modCentered(rel, SMALL_PITCH);
}

/**
 * Offset to add to the big flat wheel's angle so it meshes with a lowered small
 * wheel shown at angle `smallShown`.
 * @param {number} smallShown
 * @param {number} big the sim's bigFlat angle
 */
export function bigOffset(smallShown, big) {
  return -modCentered(smallShown + 4 * big, SMALL_PITCH) / 4;
}

/** Seconds a small wheel takes to drop or rise. */
export const CLUTCH_TIME = 0.35;

/** Smooth clutch state for display. */
export class ClutchDisplay {
  constructor() {
    /** eased engagement, 0 raised .. 1 down */
    this.e = { L: 0, R: 0 };
    /** offsets added to the shown angles */
    this.off = { L: 0, R: 0 };
    this.bigOff = 0;
    this.bigTarget = 0;
    this.was = { L: false, R: false };
  }

  reset() {
    this.e = { L: 0, R: 0 };
    this.off = { L: 0, R: 0 };
    this.bigOff = 0;
    this.bigTarget = 0;
    this.was = { L: false, R: false };
  }

  /**
   * @param {{left: boolean, right: boolean}} clutch
   * @param {Record<string, number>} gears the sim's angles (smallL, smallR, footL, footR, bigFlat)
   * @param {number} dt seconds; 0 or Infinity jumps straight to the end state
   */
  update(clutch, gears, dt) {
    for (const side of /** @type {const} */ (["L", "R"])) {
      const down = side === "L" ? clutch.left : clutch.right;
      if (down && !this.was[side]) {
        this.off[side] = smallOffset(side, gears[`small${side}`] ?? 0, gears[`foot${side}`] ?? 0);
        this.bigTarget = bigOffset((gears[`small${side}`] ?? 0) + this.off[side], gears.bigFlat ?? 0);
      }
      this.was[side] = down;
      const k = dt > 0 && Number.isFinite(dt) ? Math.min(1, dt / CLUTCH_TIME) : 1;
      const target = down ? 1 : 0;
      this.e[side] += Math.sign(target - this.e[side]) * Math.min(Math.abs(target - this.e[side]), k);
    }
    // At most half a big-wheel tooth to cover, at the clutch's pace.
    const step = dt > 0 && Number.isFinite(dt) ? ((SMALL_PITCH / 8) * dt) / CLUTCH_TIME : Infinity;
    const gap = this.bigTarget - this.bigOff;
    this.bigOff += Math.sign(gap) * Math.min(Math.abs(gap), step);
  }

  /**
   * Angles to show.
   * @param {Record<string, number>} gears
   */
  shown(gears) {
    return {
      smallL: (gears.smallL ?? 0) + this.off.L,
      smallR: (gears.smallR ?? 0) + this.off.R,
      bigFlat: (gears.bigFlat ?? 0) + this.bigOff,
    };
  }

  /** Smoothstep of the engagement, for positions. @param {"L" | "R"} side */
  eased(side) {
    const x = this.e[side];
    return x * x * (3 - 2 * x);
  }
}

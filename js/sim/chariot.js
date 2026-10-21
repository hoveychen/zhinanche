// Pure kinematic model of a two-wheeled south-pointing chariot.
//
// Conventions (see docs/model-contract.md):
// - World plane: x = east, y = north (chi). Heading is the direction the
//   chariot faces, radians counter-clockwise from east; south = -PI/2.
// - Wheel angle phi > 0 means the wheel rolled forward.
// - Gear angles about vertical axes are counter-clockwise seen from above.
// - The figure angle is relative to the chariot body; its world bearing is
//   heading + figureRel + figureOffset, where figureOffset is set once at the
//   start so the figure points south ("aim it by hand", as the sources say).

import { DESIGN, DIFF, SONG_TEETH } from "./params.js";

/** @import { MechanismId } from "./params.js" */

export const SOUTH = -Math.PI / 2;

/** One tooth of the Song 12-tooth small flat wheel (rad); 4 big-wheel teeth. */
export const SMALL_PITCH = (2 * Math.PI) / 12;

/** x mod p into (−p/2, p/2]. @param {number} x @param {number} p */
export function modCentered(x, p) {
  let r = x - p * Math.round(x / p);
  if (r <= -p / 2) r += p;
  if (r > p / 2) r -= p;
  return r;
}

/** Wrap an angle to (-PI, PI]. @param {number} a */
export function wrap(a) {
  const t = Math.atan2(Math.sin(a), Math.cos(a));
  return t === -Math.PI ? Math.PI : t;
}

/**
 * Build differences between the *design* (what the gears were cut for) and
 * the *actual* chariot. All optional; defaults are a perfect chariot.
 * @typedef {object} Faults
 * @property {number} [trackScale] actual track / design track
 * @property {number} [leftWheelScale] actual left wheel diameter / design
 * @property {number} [rightWheelScale] actual right wheel diameter / design
 */

/**
 * @typedef {object} ChariotOptions
 * @property {MechanismId} [mechanism]
 * @property {Faults} [faults]
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [heading]
 */

/**
 * @typedef {object} Pose
 * @property {number} x
 * @property {number} y
 * @property {number} heading
 * @property {number} wheelL rolled angle of left wheel (rad)
 * @property {number} wheelR
 * @property {number} figureRel figure angle relative to body (rad)
 * @property {number} figureWorld world bearing of the figure's arm (rad)
 * @property {number} errorDeg signed deviation from south, degrees
 * @property {number} distL distance travelled by the left wheel over ground (chi, signed sum)
 * @property {number} distR
 * @property {number} pathL absolute distance travelled by left wheel (chi)
 * @property {number} pathR
 * @property {{left: boolean, right: boolean}} clutch Song mechanism: which small flat wheel is lowered
 * @property {number} engagements Song: how many times a small flat wheel has been lowered
 * @property {number} engageDeg Song: what those lowerings added to the figure, degrees (signed sum)
 * @property {Record<string, number>} gears named gear angles (rad), see docs/model-contract.md
 */

/**
 * Per-step ground motion of the two wheel contact points.
 * @typedef {object} Step
 * @property {number} groundL distance the left contact point moved over the ground (chi, + forward)
 * @property {number} groundR
 * @property {number} [slipL] fraction of extra wheel spin vs ground (0.2 = wheel spins 20 % more than it rolls); default 0
 * @property {number} [slipR]
 * @property {-1 | 0 | 1} [turn] the pole's turn intent (+1 left, -1 right, 0 straight). Song clutch follows this. Defaults to sign of groundR-groundL.
 */

export class Chariot {
  /** @param {ChariotOptions} [opts] */
  constructor(opts = {}) {
    /** @type {MechanismId} */
    this.mechanism = opts.mechanism ?? "differential";
    const design = DESIGN[this.mechanism];
    this.design = design;
    const f = opts.faults ?? {};
    this.track = design.track * (f.trackScale ?? 1);
    this.radiusL = (design.wheelDiameter / 2) * (f.leftWheelScale ?? 1);
    this.radiusR = (design.wheelDiameter / 2) * (f.rightWheelScale ?? 1);
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.heading = opts.heading ?? Math.PI / 2;
    this.wheelL = 0;
    this.wheelR = 0;
    this.distL = 0;
    this.distR = 0;
    this.pathL = 0;
    this.pathR = 0;
    this.figureRel = 0;
    this.figureOffset = wrap(SOUTH - this.heading);
    this.clutch = { left: false, right: false };
    this.engagements = 0;
    /** figure angle added by the Song clutch's engagements (rad) */
    this.engageErr = 0;
    /** @type {Record<string, number>} */
    this.gears = {};
    this.#updateGears(0, 0);
  }

  /**
   * Advance the chariot by one small step. Keep steps short (< ~0.2 chi of
   * wheel travel) so the arc approximation is good.
   * @param {Step} s
   */
  step(s) {
    const gL = s.groundL, gR = s.groundR;
    // Body motion over the ground (exact for a circular arc).
    const dTheta = (gR - gL) / this.track;
    const ds = (gL + gR) / 2;
    const mid = this.heading + dTheta / 2;
    const chord = Math.abs(dTheta) < 1e-12 ? ds : (ds * 2 * Math.sin(dTheta / 2)) / dTheta;
    this.x += chord * Math.cos(mid);
    this.y += chord * Math.sin(mid);
    this.heading = wrap(this.heading + dTheta);
    this.distL += gL;
    this.distR += gR;
    this.pathL += Math.abs(gL);
    this.pathR += Math.abs(gR);

    // Wheels: rolling plus slip (a slipping wheel spins more than it travels).
    const dPhiL = (gL * (1 + (s.slipL ?? 0))) / this.radiusL;
    const dPhiR = (gR * (1 + (s.slipR ?? 0))) / this.radiusR;
    this.wheelL += dPhiL;
    this.wheelR += dPhiR;

    let turn = s.turn;
    if (turn === undefined) {
      const d = gR - gL;
      const eps = 1e-9 + 1e-6 * (Math.abs(gL) + Math.abs(gR));
      turn = d > eps ? 1 : d < -eps ? -1 : 0;
    }
    this.#driveMechanism(dPhiL, dPhiR, turn);
  }

  /**
   * @param {number} dPhiL
   * @param {number} dPhiR
   * @param {-1 | 0 | 1} turn
   */
  #driveMechanism(dPhiL, dPhiR, turn) {
    if (this.mechanism === "differential") {
      // Side gear A follows the left wheel, side gear B the right wheel in the
      // opposite sense; the carrier (and the figure) turns by their average.
      const k = DIFF.inputRatio;
      const dA = k * dPhiL;
      const dB = -k * dPhiR;
      this.figureRel += (dA + dB) / 2;
      this.#updateGears(dA, dB);
    } else {
      // Song (Yan Su): turning left lowers the right small flat wheel, which
      // couples the right road wheel to the big flat wheel, and vice versa.
      const was = this.clutch;
      this.clutch = { left: turn < 0, right: turn > 0 };
      if (this.clutch.right && !was.right) this.#engage("R", dPhiR);
      if (this.clutch.left && !was.left) this.#engage("L", dPhiL);
      const foot = SONG_TEETH.footGear, small = SONG_TEETH.smallFlat, big = SONG_TEETH.bigFlat;
      let dSmallL = 0, dSmallR = 0, dBig = 0;
      if (this.clutch.right) {
        dSmallR = (dPhiR * foot) / small;
        dBig = (-dSmallR * small) / big; // external mesh reverses
      } else if (this.clutch.left) {
        dSmallL = (-dPhiL * foot) / small;
        dBig = (-dSmallL * small) / big;
      }
      this.figureRel += dBig;
      this.#updateGears(dSmallL, dSmallR);
    }
  }

  /**
   * Song: a small flat wheel drops into mesh (docs/model-contract.md, "Song
   * meshing phase"; design/decisions/0007-song-clutch-error.md). While it was
   * raised its foot gear kept turning with the road wheel, so its teeth no
   * longer line up. On the real chariot (research/physics/REPORT.md §5) the
   * road wheel stands on the ground and cannot give way; the raised small
   * wheel and the big flat wheel with the figure turn freely. So the small
   * wheel turns (up to half its tooth, 15°) to sit in the foot gear's gaps,
   * then pushes the big flat wheel, and the figure with it, to the nearest
   * gap: at most half a big-wheel tooth, 3.75°. Deterministic, no randomness;
   * the occasional whole-tooth skip the physics also shows is left out.
   * @param {"L" | "R"} side
   * @param {number} dPhi this step's turn of that side's road wheel, applied
   *   after the drop (the wheel is lowered before the step moves it)
   */
  #engage(side, dPhi) {
    const g = this.gears;
    const footAt = (side === "R" ? this.wheelR : this.wheelL) - dPhi;
    const key = side === "R" ? "smallR" : "smallL";
    const rel = side === "R" ? g[key] - 2 * footAt : g[key] + 2 * footAt;
    g[key] -= modCentered(rel, SMALL_PITCH);
    const dBig = -modCentered(g[key] + 4 * this.figureRel, SMALL_PITCH) / 4;
    this.figureRel += dBig;
    this.engageErr += dBig;
    this.engagements++;
  }

  /**
   * @param {number} dA differential: side gear A increment; song: left small flat increment
   * @param {number} dB differential: side gear B increment; song: right small flat increment
   */
  #updateGears(dA, dB) {
    const g = this.gears;
    g.wheelL = this.wheelL;
    g.wheelR = this.wheelR;
    g.figure = this.figureRel;
    if (this.mechanism === "differential") {
      g.sideA = (g.sideA ?? 0) + dA;
      g.sideB = (g.sideB ?? 0) + dB;
      g.carrier = this.figureRel;
      // Pinions spin about their own (horizontal) axles at the half-difference
      // of the side gears, scaled by the tooth ratio.
      g.pinion = ((g.sideA - g.sideB) / 2) * (DIFF.sideGearTeeth / DIFF.pinionTeeth);
    } else {
      g.footL = this.wheelL;
      g.footR = this.wheelR;
      g.smallL = (g.smallL ?? 0) + dA;
      g.smallR = (g.smallR ?? 0) + dB;
      g.bigFlat = this.figureRel;
    }
  }

  /** @returns {Pose} */
  pose() {
    const figureWorld = wrap(this.heading + this.figureRel + this.figureOffset);
    return {
      x: this.x,
      y: this.y,
      heading: this.heading,
      wheelL: this.wheelL,
      wheelR: this.wheelR,
      figureRel: this.figureRel + this.figureOffset,
      figureWorld,
      errorDeg: (wrap(figureWorld - SOUTH) * 180) / Math.PI,
      distL: this.distL,
      distR: this.distR,
      pathL: this.pathL,
      pathR: this.pathR,
      clutch: { ...this.clutch },
      engagements: this.engagements,
      engageDeg: (this.engageErr * 180) / Math.PI,
      gears: { ...this.gears },
    };
  }
}

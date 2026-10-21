// Flattened view of params/chariot.json: plain numbers, keyed by mechanism.
import raw from "../../params/chariot.json" with { type: "json" };

/** @typedef {"differential" | "song"} MechanismId */

/**
 * @typedef {object} Geometry
 * @property {number} wheelDiameter design wheel diameter (chi)
 * @property {number} track design distance between wheel contact points (chi)
 */

/** @type {Record<MechanismId, Geometry>} */
export const DESIGN = {
  differential: {
    wheelDiameter: raw.differential.wheelDiameter.v,
    track: raw.differential.track.v,
  },
  song: {
    wheelDiameter: raw.song.wheelDiameter.v,
    track: raw.song.track.v,
  },
};

export const SONG_TEETH = {
  footGear: raw.song.footGearTeeth.v,
  smallFlat: raw.song.smallFlatTeeth.v,
  bigFlat: raw.song.bigFlatTeeth.v,
};

export const DIFF = {
  /**
   * Side gear angle per wheel angle, from the tooth counts: each crown wheel
   * (fixed to a road wheel) drives a horizontal gear of its own; the two
   * trains have the same ratio (asserted here), so one number serves. For the
   * figure to keep its bearing this must equal wheelDiameter / track
   * (tests/sim/chariot.test.js, tests/model.test.js).
   */
  inputRatio: raw.differential.crownLeftTeeth.v / raw.differential.flatLeftTeeth.v,
  crownLeftTeeth: raw.differential.crownLeftTeeth.v,
  crownRightTeeth: raw.differential.crownRightTeeth.v,
  flatLeftTeeth: raw.differential.flatLeftTeeth.v,
  flatRightTeeth: raw.differential.flatRightTeeth.v,
  sideGearTeeth: raw.differential.sideGearTeeth.v,
  pinionTeeth: raw.differential.pinionTeeth.v,
};

if (DIFF.crownRightTeeth / DIFF.flatRightTeeth !== DIFF.inputRatio) {
  throw new Error("differential: the two wheel→side gear trains must have the same ratio");
}

export const CHI_IN_METERS = raw.units.chiInMeters.v;

export { raw as PARAMS };

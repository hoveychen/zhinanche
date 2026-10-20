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
  inputRatio: raw.differential.inputRatio.v,
  sideGearTeeth: raw.differential.sideGearTeeth.v,
  pinionTeeth: raw.differential.pinionTeeth.v,
};

export const CHI_IN_METERS = raw.units.chiInMeters.v;

export { raw as PARAMS };

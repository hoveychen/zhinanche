// Lesson part ids (PartId in js/teach/types.js) → GLB node names
// (docs/model-contract.md). A part missing from the current mechanism is
// simply not there (e.g. "sideA" on the Song chariot). No three.js here, so
// tests/scene/parts.test.js checks it against the GLB files. The GLB labels
// are Chinese; other languages map them to display names in their strings
// table (parts.names).

import { S } from "../i18n.js";

/** @import { PartId } from "../teach/types.js" */

/** @type {Record<PartId, string[]>} */
export const PART_NODES = {
  wheelL: ["wheel.L"],
  wheelR: ["wheel.R"],
  figure: ["figure", "figure.shaft"],
  sideA: ["diff.sideA"],
  sideB: ["diff.sideB"],
  carrier: ["diff.carrier"],
  pinion: ["diff.pinion.0", "diff.pinion.1"],
  crownL: ["diff.crown.L"],
  crownR: ["diff.crown.R"],
  footL: ["song.foot.L"],
  footR: ["song.foot.R"],
  smallL: ["song.smallLift.L", "song.small.L"],
  smallR: ["song.smallLift.R", "song.small.R"],
  bigFlat: ["song.bigFlat"],
  pole: ["body.pole", "song.roller.L", "song.roller.R"],
};

/** Gear-train sides for the left-blue / right-orange colour rule. */
export const LEFT_NODES = new Set(["wheel.L", "diff.crown.L", "diff.sideA", "song.foot.L", "song.smallLift.L", "song.small.L", "song.roller.L"]);
export const RIGHT_NODES = new Set(["wheel.R", "diff.crown.R", "diff.sideB", "song.foot.R", "song.smallLift.R", "song.small.R", "song.roller.R"]);

/** The node a marker tooth belongs to: "song.bigFlat.marker" → "song.bigFlat". @param {string} name */
export function ownerOf(name) {
  return name.endsWith(".marker") ? name.slice(0, -".marker".length) : name;
}

/**
 * Text for the "what is this gear" callout.
 * @param {{label?: string, teeth?: number, sideTeeth?: number}} extras
 * @returns {{title: string, detail: string}}
 */
export function partCaption(extras) {
  const t = S().parts;
  const label = extras.label ?? "";
  const title = t.names[label] ?? label;
  let detail = "";
  if (extras.teeth) detail = t.teeth(extras.teeth);
  if (extras.teeth && extras.sideTeeth) detail += t.pegs(extras.sideTeeth);
  return { title, detail };
}

// The page's one set of icons: Tabler Icons' outline set (vendor/tabler-icons,
// MIT), all drawn with the same 2px line in the text's colour (css .icon).

import { ICONS } from "../../vendor/tabler-icons/icons.js";

/** @typedef {keyof typeof ICONS} IconName */

/**
 * An icon as an <svg>, hidden from screen readers (the button's words name it).
 * @param {IconName} name
 * @param {string} [cls] more classes
 * @returns {Node}
 */
export function icon(name, cls = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const kind = name.endsWith("-filled") ? "icon filled" : "icon";
  svg.setAttribute("class", cls ? `${kind} ${cls}` : kind);
  svg.innerHTML = ICONS[name];
  return svg;
}

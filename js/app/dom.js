// A tiny element builder.

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, string | number | boolean | EventListener | undefined>} [attrs]
 *   `class`, `html` (innerHTML), `text`, `on<event>` listeners, `data-*`, aria and plain attributes
 * @param {(Node | string | null | undefined | false)[]} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "html") el.innerHTML = String(v);
    else if (k === "text") el.textContent = String(v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** @param {string} id */
export function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

const SVG = "http://www.w3.org/2000/svg";

/**
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {Element[]} [children]
 */
export function s(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

/**
 * A touch screen with no mouse or trackpad (a tablet, a phone): no keyboard
 * to speak of either, so the words don't send a child looking for arrow keys.
 */
export function touchOnly() {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
}

// Words over the 3D view that belong to something in it (the compass, the
// children on the inside and outside circles): page labels in the style of
// the HUD cards, placed each frame just above their anchor on screen (or
// level with it at one side, with a tail pointing at it), kept
// off the dial, the buttons and the notes (js/app/callout.js), and off each
// other. Hidden while the anchor's demo is hidden or out of sight.

import { h } from "./dom.js";
import { S, onLang } from "../i18n.js";
import { placeCallout } from "./callout.js";

/** @import { SceneLabel } from "../scene/demos.js" */
/** @import { Object3D, Vector3 } from "three" */
/** @typedef {import("./callout.js").Box} Box */

/** gap between the anchor and the label, px */
const GAP = 8;

/** @param {Object3D} o shown: it and everything it hangs from */
function shown(o) {
  for (let p = /** @type {Object3D | null} */ (o); p; p = p.parent) if (!p.visible) return false;
  return true;
}

export class SceneLabels {
  /**
   * @param {HTMLElement} overlay
   * @param {SceneLabel[]} specs
   * @param {(p: Vector3) => {x: number, y: number, behind: boolean}} project
   * @param {() => Box[]} controls what to keep clear of, px within the overlay
   */
  constructor(overlay, specs, project, controls) {
    this.overlay = overlay;
    this.project = project;
    this.controls = controls;
    this.items = specs.map((spec) => {
      const el = h("p", { class: `scene-label${spec.side ? ` ${spec.side}` : ""}`, hidden: true, "aria-hidden": "true" });
      overlay.append(el);
      return { spec, el, at: /** @type {{x: number, y: number} | null} */ (null), text: "" };
    });
    const relabel = () => {
      for (const it of this.items) it.text = "";
    };
    onLang(relabel);
  }

  /** Once a frame, after the camera moved. */
  update() {
    const live = this.items.filter((it) => shown(it.spec.anchor));
    for (const it of this.items) if (!live.includes(it) && !it.el.hidden) {
      it.el.hidden = true;
      it.at = null;
    }
    if (!live.length) return;
    const view = { w: this.overlay.clientWidth, h: this.overlay.clientHeight };
    const keep = this.controls();
    const at = live.map((it) => this.project(it.spec.anchor.getWorldPosition(/** @type {Vector3} */ (it.spec.anchor.position.clone()))));
    // labels kept beside their anchors go to the sides away from each other
    // (a pair one behind the other on screen: left and right, by colour)
    const besides = live.flatMap((it, i) => (it.spec.beside ? [i] : []));
    const mx = besides.reduce((sum, i) => sum + at[i].x, 0) / (besides.length || 1);
    for (const [i, it] of live.entries()) {
      const p = at[i];
      if (p.behind || p.x < 0 || p.x > view.w || p.y < 0 || p.y > view.h) {
        it.el.hidden = true;
        it.at = null;
        continue;
      }
      const text = it.spec.text(S());
      if (text !== it.text) {
        it.el.textContent = text;
        it.text = text;
      }
      it.el.hidden = false;
      const size = { w: it.el.offsetWidth, h: it.el.offsetHeight };
      /** @type {"above" | "left" | "right"} */
      let prefer = "above";
      if (it.spec.beside) prefer = besides.length > 1 && Math.abs(p.x - mx) > 4 ? (p.x < mx ? "left" : "right") : it.spec.side === "r" ? "right" : "left";
      const want = placeCallout({ x: p.x, y: p.y }, size, view, keep, it.spec.beside ? GAP + 22 : GAP, prefer);
      // glide to a new spot rather than jump (a slide off the dial, say)
      const to = it.at && Math.hypot(want.x - it.at.x, want.y - it.at.y) < 400
        ? { x: it.at.x + (want.x - it.at.x) * 0.35, y: it.at.y + (want.y - it.at.y) * 0.35 }
        : want;
      it.at = to;
      it.el.style.transform = `translate(${to.x.toFixed(1)}px, ${to.y.toFixed(1)}px)`;
      // the little tail points at the anchor while the label sits right over
      // it, or level with it at one side
      const over = Math.abs(to.x + size.w / 2 - p.x) < size.w / 2 - 12 && Math.abs(to.y + size.h + GAP - p.y) < 6;
      const level = Math.abs(to.y + size.h / 2 - p.y) < size.h / 2 - 6;
      const left = level && to.x + size.w <= p.x && p.x - (to.x + size.w) < 60;
      const right = level && to.x >= p.x && to.x - p.x < 60;
      it.el.classList.toggle("tail", over);
      it.el.classList.toggle("tail-r", left);
      it.el.classList.toggle("tail-l", right);
      if (over) it.el.style.setProperty("--tail-x", `${(p.x - to.x).toFixed(1)}px`);
      if (left || right) it.el.style.setProperty("--tail-y", `${(p.y - to.y).toFixed(1)}px`);
      // the next label keeps off this one
      keep.push({ x: to.x, y: to.y, w: size.w, h: size.h });
    }
  }
}

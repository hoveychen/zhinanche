// The controls a step can show (ControlId in js/teach/types.js), except the
// drive pad, the draw button and the gears-view button, which live on the 3D
// view (js/app/drive.js, js/main.js).
// Each control changes the scene through the same directive the lessons use.

import { h } from "./dom.js";
import { hasFaults, hasSlip } from "./directive.js";
import { S, bind } from "../i18n.js";

/** @import { SceneDirective, ControlId } from "../teach/types.js" */
/** @import { SceneState } from "./directive.js" */
/** @import { Strings } from "../teach/strings.js" */

/** @typedef {keyof Strings["tools"]} Word a key into the tools strings */

/** @param {Word} k */
const w = (k) => (/** @type {Strings} */ s) => s.tools[k];

/**
 * What the tools need from the app.
 * @typedef {object} ToolHost
 * @property {(d: SceneDirective) => void} direct
 * @property {() => void} resetChariot
 */

/**
 * @template T
 * @typedef {{label: Word, value: T, hint?: Word}} Choice
 */

/**
 * A row of buttons, one pressed.
 * @template T
 * @param {Word} label
 * @param {Choice<T>[]} choices
 * @param {(v: T) => void} pick
 */
function segmented(label, choices, pick) {
  const buttons = choices.map((c) => {
    const b = bind(h("button", { type: "button", class: "seg-btn", onclick: () => pick(c.value) }), w(c.label));
    const hint = c.hint;
    return hint ? bind(b, w(hint), "title") : b;
  });
  const el = bind(h("div", { class: "seg", role: "group" }, buttons), w(label), "aria-label");
  return {
    el,
    /** @param {(v: T) => boolean} isOn */
    sync(isOn) {
      choices.forEach((c, i) => {
        const on = isOn(c.value);
        buttons[i].classList.toggle("on", on);
        buttons[i].setAttribute("aria-pressed", String(on));
      });
    },
  };
}

/**
 * A slider from 0 to 1, with a word at each end that jumps there.
 * @param {Word} label
 * @param {(v: number) => void} pick
 */
function slider(label, pick) {
  const range = bind(h("input", {
    type: "range", min: 0, max: 100, step: 1, value: 0, class: "slider-range",
    oninput: () => pick(Number(range.value) / 100),
  }), w(label), "aria-label");
  const end = (/** @type {Word} */ text, /** @type {number} */ v) => bind(h("button", { type: "button", class: "slider-end", onclick: () => pick(v) }), w(text));
  const el = h("div", { class: "slider" }, [end("together", 0), range, end("apart", 1)]);
  return {
    el,
    /** @param {number} v */
    sync(v) {
      range.value = String(Math.round(v * 100));
      range.style.setProperty("--fill", `${Math.round(v * 100)}%`);
    },
  };
}

/**
 * @param {Word} title
 * @param {ControlId} id
 * @param {HTMLElement} body
 */
function block(title, id, body) {
  return h("div", { class: "tool", "data-control": id }, [
    bind(h("div", { class: "tool-title" }), w(title)),
    body,
  ]);
}

export class Tools {
  /** @param {ToolHost} host */
  constructor(host) {
    const mech = segmented("mechanism", [
      { label: "differential", value: /** @type {const} */ ("differential"), hint: "differentialHint" },
      { label: "song", value: /** @type {const} */ ("song"), hint: "songHint" },
    ], (v) => host.direct({ mechanism: v }));
    const assistBtn = h("button", { type: "button", class: "switch", role: "switch", onclick: () => host.direct({ assist: !this.state?.assist }) }, [
      h("span", { class: "knob" }), bind(h("span", { class: "switch-text" }), w("assist")),
    ]);
    const assistNote = h("p", { class: "tool-note" });
    const faults = segmented("faults", [
      { label: "faultNone", value: "none" },
      { label: "faultTrack", value: "track", hint: "faultTrackHint" },
      { label: "faultWheel", value: "wheel", hint: "faultWheelHint" },
    ], (v) => host.direct({ faults: v === "track" ? { trackScale: 1.1 } : v === "wheel" ? { leftWheelScale: 1.05 } : {} }));
    const slip = segmented("ground", [
      { label: "noSlip", value: false },
      { label: "slipR", value: true },
    ], (v) => host.direct({ slip: v ? { slipR: 0.2 } : {} }));
    const xrayBtn = h("button", { type: "button", class: "toggle", "aria-pressed": "false", onclick: () => host.direct({ xray: !this.state?.xray }) }, [
      h("span", { class: "toggle-icon", "aria-hidden": "true" }), bind(h("span"), w("xray")),
    ]);
    const explode = slider("explode", (v) => host.direct({ explode: v }));
    const speed = segmented("speed", [
      { label: "slow", value: 0.5 },
      { label: "normal", value: 1 },
      { label: "fast", value: 2 },
    ], (v) => host.direct({ speed: v }));
    const resetBtn = bind(h("button", { type: "button", class: "plain", onclick: () => host.resetChariot() }), w("reset"));

    this.parts = { mech, assistBtn, assistNote, faults, slip, xrayBtn, explode, speed };
    /** @type {Record<Exclude<ControlId, "drive" | "draw" | "gearsView">, HTMLElement>} */
    this.blocks = {
      mechanism: block("mechanism", "mechanism", mech.el),
      assist: block("assistBlock", "assist", h("div", {}, [assistBtn, assistNote])),
      xray: block("xrayBlock", "xray", xrayBtn),
      explode: block("explodeBlock", "explode", explode.el),
      faults: block("faultsBlock", "faults", faults.el),
      slip: block("ground", "slip", slip.el),
      speed: block("speed", "speed", speed.el),
      reset: block("resetBlock", "reset", resetBtn),
    };
    // The faults first and set apart: "does it drift?" is what people ask.
    const b = this.blocks;
    this.trouble = bind(h("div", { class: "trouble", role: "group" }, [
      bind(h("p", { class: "trouble-head" }), (s) => s.free.breakHead),
      bind(h("p", { class: "trouble-note" }), (s) => s.free.breakNote),
      b.faults, b.slip,
    ]), (s) => s.free.breakHead, "aria-label");
    this.order = [this.trouble, b.mechanism, b.assist, b.xray, b.explode, b.speed, b.reset];
    this.el = bind(h("div", { class: "tools", role: "group" }, this.order), w("label"), "aria-label");
    /** @type {SceneState | null} */
    this.state = null;
  }

  /**
   * Put the control a task asks for first, right under the task (a short
   * panel would leave it below the fold); null: the usual order.
   * @param {Exclude<ControlId, "drive" | "draw" | "gearsView"> | null} id
   */
  lead(id) {
    const block = id ? this.blocks[id] : null;
    // the faults and the ground sit in their own group: that group leads
    const first = block?.parentElement === this.trouble ? this.trouble : block;
    const want = first && first.parentElement === this.el ? [first, ...this.order.filter((el) => el !== first)] : this.order;
    if (want.some((el, i) => this.el.children[i] !== el)) this.el.replaceChildren(...want);
    this.el.classList.toggle("led", want !== this.order);
    for (const el of this.order) el.classList.toggle("lead", el === want[0] && want !== this.order);
  }

  /** @param {SceneState} st */
  sync(st) {
    this.state = st;
    const p = this.parts;
    p.mech.sync((v) => v === st.mechanism);
    const song = st.mechanism === "song";
    // the differential needs no driver: show the switch off there, not "on but grey"
    p.assistBtn.setAttribute("aria-checked", String(song && st.assist));
    p.assistBtn.classList.toggle("on", song && st.assist);
    p.assistBtn.toggleAttribute("disabled", !song);
    const t = S().tools;
    p.assistNote.textContent = !song ? t.assistOff : st.assist ? t.assistOn : t.assistNone;
    p.faults.sync((v) => (v === "none" ? !hasFaults(st.faults) : v === "track" ? (st.faults.trackScale ?? 1) !== 1 : (st.faults.leftWheelScale ?? 1) !== 1));
    p.slip.sync((v) => v === hasSlip(st.slip));
    p.xrayBtn.setAttribute("aria-pressed", String(st.xray));
    p.xrayBtn.classList.toggle("on", st.xray);
    p.explode.sync(st.explode);
    p.speed.sync((v) => v === st.speed);
    for (const [id, el] of Object.entries(this.blocks)) el.hidden = !st.controls.includes(/** @type {ControlId} */ (id));
    this.el.hidden = Object.values(this.blocks).every((b) => b.hidden);
    this.trouble.hidden = this.blocks.faults.hidden && this.blocks.slip.hidden;
  }
}

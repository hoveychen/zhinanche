// The controls a step can show (ControlId in js/teach/types.js), except the
// drive pad, the draw button and the gears-view button, which live on the 3D
// view (js/app/drive.js, js/main.js).
// Each control changes the scene through the same directive the lessons use.

import { h } from "./dom.js";
import { hasFaults, hasSlip } from "./directive.js";
import { STR } from "../teach/strings.js";

/** @import { SceneDirective, ControlId } from "../teach/types.js" */
/** @import { SceneState } from "./directive.js" */

/**
 * What the tools need from the app.
 * @typedef {object} ToolHost
 * @property {(d: SceneDirective) => void} direct
 * @property {() => void} resetChariot
 */

/**
 * @template T
 * @typedef {{label: string, value: T, hint?: string}} Choice
 */

/**
 * A row of buttons, one pressed.
 * @template T
 * @param {string} label
 * @param {Choice<T>[]} choices
 * @param {(v: T) => void} pick
 */
function segmented(label, choices, pick) {
  const buttons = choices.map((c) => h("button", { type: "button", class: "seg-btn", text: c.label, title: c.hint, onclick: () => pick(c.value) }));
  const el = h("div", { class: "seg", role: "group", "aria-label": label }, buttons);
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
 * @param {string} label
 * @param {(v: number) => void} pick
 */
function slider(label, pick) {
  const range = h("input", {
    type: "range", min: 0, max: 100, step: 1, value: 0, class: "slider-range", "aria-label": label,
    oninput: () => pick(Number(range.value) / 100),
  });
  const end = (/** @type {string} */ text, /** @type {number} */ v) => h("button", { type: "button", class: "slider-end", text, onclick: () => pick(v) });
  const el = h("div", { class: "slider" }, [end("合上", 0), range, end("拆开", 1)]);
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
 * @param {string} title
 * @param {ControlId} id
 * @param {HTMLElement} body
 * @param {string} [note]
 */
function block(title, id, body, note) {
  return h("div", { class: "tool", "data-control": id }, [
    h("div", { class: "tool-title", text: title }),
    body,
    note ? h("p", { class: "tool-note", text: note }) : null,
  ]);
}

export class Tools {
  /** @param {ToolHost} host */
  constructor(host) {
    const mech = segmented("造法", [
      { label: "差动式", value: /** @type {const} */ ("differential"), hint: "现代人猜的造法" },
      { label: "宋史式", value: /** @type {const} */ ("song"), hint: "《宋史》里燕肃的造法" },
    ], (v) => host.direct({ mechanism: v }));
    const assistBtn = h("button", { type: "button", class: "switch", role: "switch", onclick: () => host.direct({ assist: !this.state?.assist }) }, [
      h("span", { class: "knob" }), h("span", { class: "switch-text", text: "车夫帮忙" }),
    ]);
    const assistNote = h("p", { class: "tool-note" });
    const faults = segmented("毛病", [
      { label: "造得刚好", value: "none" },
      { label: "轮距太宽", value: "track", hint: "两个车轮装得太开了一点" },
      { label: "左轮大一点", value: "wheel", hint: "两个车轮一大一小" },
    ], (v) => host.direct({ faults: v === "track" ? { trackScale: 1.1 } : v === "wheel" ? { leftWheelScale: 1.05 } : {} }));
    const slip = segmented("地面", [
      { label: "不打滑", value: false },
      { label: "右轮打滑", value: true },
    ], (v) => host.direct({ slip: v ? { slipR: 0.2 } : {} }));
    const xrayBtn = h("button", { type: "button", class: "toggle", "aria-pressed": "false", onclick: () => host.direct({ xray: !this.state?.xray }) }, [
      h("span", { class: "toggle-icon", "aria-hidden": "true" }), h("span", { text: "透视" }),
    ]);
    const explode = slider("拆开多少", (v) => host.direct({ explode: v }));
    const speed = segmented("快慢", [
      { label: "慢", value: 0.5 },
      { label: "中", value: 1 },
      { label: "快", value: 2 },
    ], (v) => host.direct({ speed: v }));
    const resetBtn = h("button", { type: "button", class: "plain", text: "回到起点", onclick: () => host.resetChariot() });

    this.parts = { mech, assistBtn, assistNote, faults, slip, xrayBtn, explode, speed };
    /** @type {Record<Exclude<ControlId, "drive" | "draw" | "gearsView">, HTMLElement>} */
    this.blocks = {
      mechanism: block("造法", "mechanism", mech.el),
      assist: block("宋史式开法", "assist", h("div", {}, [assistBtn, assistNote])),
      xray: block("看里面", "xray", xrayBtn),
      explode: block("拆开看齿轮", "explode", explode.el),
      faults: block("车造得准不准", "faults", faults.el),
      slip: block("地面", "slip", slip.el),
      speed: block("快慢", "speed", speed.el),
      reset: block("重新开始", "reset", resetBtn),
    };
    // The faults first and set apart: "does it drift?" is what people ask.
    const b = this.blocks;
    this.trouble = h("div", { class: "trouble", role: "group", "aria-label": STR.free.breakHead }, [
      h("p", { class: "trouble-head", text: STR.free.breakHead }),
      h("p", { class: "trouble-note", text: STR.free.breakNote }),
      b.faults, b.slip,
    ]);
    this.el = h("div", { class: "tools", role: "group", "aria-label": "工具" }, [this.trouble, b.mechanism, b.assist, b.xray, b.explode, b.speed, b.reset]);
    /** @type {SceneState | null} */
    this.state = null;
  }

  /** @param {SceneState} st */
  sync(st) {
    this.state = st;
    const p = this.parts;
    p.mech.sync((v) => v === st.mechanism);
    const song = st.mechanism === "song";
    p.assistBtn.setAttribute("aria-checked", String(st.assist));
    p.assistBtn.classList.toggle("on", st.assist);
    p.assistBtn.toggleAttribute("disabled", !song);
    p.assistNote.textContent = !song
      ? "换成宋史式才用得上。"
      : st.assist ? "拐弯时，车夫让里边的车轮停住，车绕着它转。" : "车夫不管了，车随便拐弯。";
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

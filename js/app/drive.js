// Driving by hand: the arrow pad on the 3D view (hold a button to drive),
// the keyboard (arrow keys or WASD), the "draw a route" button, and how fast
// the chariot gets going and stops (ease, used by js/app/app.js).

import { h, touchOnly } from "./dom.js";
import { bind } from "../i18n.js";
import { icon } from "./icons.js";

/** @typedef {"up" | "down" | "left" | "right"} Dir */

/** @type {Record<Dir, import("./icons.js").IconName>} */
const ARROW = { up: "arrow-big-up", down: "arrow-big-down", left: "arrow-big-left", right: "arrow-big-right" };
/**
 * Seconds from standing to full speed, from full speed to a stop, and to
 * swing the steering fully over: a short roll-off and a short brake instead of
 * jumping between still and full speed, while still "hold to drive".
 */
export const RAMP = { up: 0.35, brake: 0.25, steer: 0.2 };

/**
 * Move `now` toward `want` (both −1..1) at the ramp's rates.
 * @param {number} now @param {number} want @param {number} dt
 * @param {number} up seconds 0 → 1 @param {number} down seconds 1 → 0
 */
export function ease(now, want, dt, up, down) {
  const speeding = Math.abs(want) > Math.abs(now) && Math.sign(want) * Math.sign(now) >= 0;
  const rate = dt / (speeding ? up : down);
  return now + Math.max(-rate, Math.min(rate, want - now));
}

/** @type {Record<string, Dir>} */
const KEYS = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };

export class DriveInput {
  /** @param {{onDraw: (on: boolean) => void, onDrive: () => void}} cb */
  constructor(cb) {
    this.cb = cb;
    /** @type {Set<Dir>} pad buttons held */
    this.held = new Set();
    /** @type {Set<Dir>} keys held */
    this.keys = new Set();
    this.enabled = false;
    this.drawOn = false;

    /** @param {Dir} d */
    const btn = (d) => {
      // the arrow alone on the key; its word is its name and its tooltip
      const b = bind(bind(h("button", { type: "button", class: `pad-btn pad-${d}` }, [icon(ARROW[d])]), (s) => s.drive[d], "aria-label"), (s) => s.drive[d], "title");
      const down = (/** @type {PointerEvent} */ e) => {
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        this.held.add(d);
        b.classList.add("held");
        this.cb.onDrive();
      };
      const up = () => {
        this.held.delete(d);
        b.classList.remove("held");
      };
      b.addEventListener("pointerdown", down);
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("lostpointercapture", up);
      // keyboard users: Enter/Space on a focused button drives a short hop
      b.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.keys.add(d);
          this.cb.onDrive();
        }
      });
      b.addEventListener("keyup", (e) => {
        if (e.key === "Enter" || e.key === " ") this.keys.delete(d);
      });
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      return b;
    };
    this.pad = bind(h("div", { class: "pad", "data-control": "drive", role: "group" }, [
      btn("up"), btn("left"), btn("right"), btn("down"),
    ]), (s) => (touchOnly() ? s.drive.padLabelTouch : s.drive.padLabel), "aria-label");
    this.drawBtn = bind(h("button", { type: "button", class: "bar-btn draw-btn", "data-control": "draw", "aria-pressed": "false", onclick: () => this.setDraw(!this.drawOn) }, [
      icon("pencil"),
      bind(h("span"), (s) => s.drive.draw),
    ]), (s) => s.drive.draw, "title");

    window.addEventListener("keydown", (e) => {
      const d = KEYS[e.code];
      if (!d || !this.enabled || isTyping(e.target)) return;
      if (e.target instanceof HTMLButtonElement && e.target.closest(".pad")) return;
      e.preventDefault();
      this.keys.add(d);
      this.cb.onDrive();
    });
    window.addEventListener("keyup", (e) => {
      const d = KEYS[e.code];
      if (d) this.keys.delete(d);
    });
    window.addEventListener("blur", () => this.release());
  }

  /** @param {boolean} on */
  setDraw(on) {
    this.drawOn = on;
    this.drawBtn.classList.toggle("on", on);
    this.drawBtn.setAttribute("aria-pressed", String(on));
    this.cb.onDraw(on);
  }

  release() {
    this.held.clear();
    this.keys.clear();
    for (const b of this.pad.querySelectorAll(".held")) b.classList.remove("held");
  }

  /** Forward −1..1 and turn −1..1 (+ left) from what is held. */
  command() {
    if (!this.enabled) return { fwd: 0, turn: 0 };
    const on = (/** @type {Dir} */ d) => this.held.has(d) || this.keys.has(d);
    const fwd = (on("up") ? 1 : 0) - (on("down") ? 1 : 0);
    const turn = (on("left") ? 1 : 0) - (on("right") ? 1 : 0);
    return { fwd, turn };
  }
}

/** @param {EventTarget | null} t */
function isTyping(t) {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}

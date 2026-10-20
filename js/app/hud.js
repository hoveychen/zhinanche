// Heads-up displays over the 3D view: the south dial (where the figure points,
// turned to match the camera like a map) and the two wheels' distances.

import { h, s } from "./dom.js";
import { CHI_IN_METERS } from "../sim/params.js";

/** Degrees off south still shown as "pointing south". Same as the ground ring. */
const OK_DEG = 1;
const DEG = 180 / Math.PI;

export class Dial {
  constructor() {
    const ticks = [];
    for (let d = 0; d < 360; d += 15) {
      const a = d / DEG;
      const r1 = d % 90 === 0 ? 70 : 76;
      ticks.push(s("line", { x1: Math.sin(a) * r1, y1: -Math.cos(a) * r1, x2: Math.sin(a) * 82, y2: -Math.cos(a) * 82, class: d % 90 === 0 ? "tick major" : "tick" }));
    }
    const letter = (/** @type {string} */ t, /** @type {number} */ x, /** @type {number} */ y) => {
      const el = s("text", { x, y, class: "dir" });
      el.textContent = t;
      return el;
    };
    const seal = s("g", { class: "seal", transform: "translate(0 58)" }, [s("rect", { x: -17, y: -17, width: 34, height: 34, rx: 3 })]);
    const nan = s("text", { x: 0, y: 1 });
    nan.textContent = "南";
    seal.append(nan);
    this.arm = s("g", { class: "arm" }, [
      s("path", { d: "M 6 -5 L 52 -5 L 52 -12 L 74 0 L 52 12 L 52 5 L 6 5 Z" }),
    ]);
    this.cart = s("g", { class: "cart" }, [
      s("rect", { x: -13, y: -10, width: 24, height: 20, rx: 3 }),
      s("line", { x1: 11, y1: 0, x2: 26, y2: 0 }),
      s("rect", { x: -4, y: -15, width: 10, height: 4, class: "wl" }),
      s("rect", { x: -4, y: 11, width: 10, height: 4, class: "wr" }),
    ]);
    this.rose = s("g", { class: "rose" }, [
      ...ticks,
      s("line", { x1: 0, y1: 8, x2: 0, y2: 40, class: "southline" }),
      letter("北", 0, -55), letter("东", 55, 0), letter("西", -55, 0),
      seal, this.arm,
    ]);
    const svg = s("svg", { viewBox: "-100 -100 200 200", "aria-hidden": "true" }, [
      s("circle", { r: 96, class: "rim" }),
      s("circle", { r: 86, class: "face" }),
      this.rose,
      this.cart,
    ]);
    this.text = h("p", { class: "dial-text", "aria-live": "polite" });
    this.el = h("div", { class: "hud-dial", role: "status" }, [/** @type {Node} */ (/** @type {unknown} */ (svg)), this.text]);
    this.lastText = "";
  }

  /**
   * @param {number} figureWorld sim bearing of the arm (rad)
   * @param {number} heading
   * @param {number} errorDeg
   * @param {number} camBearing sim bearing the camera looks along (rad)
   */
  update(figureWorld, heading, errorDeg, camBearing) {
    const rot = camBearing * DEG - 90;
    this.rose.setAttribute("transform", `rotate(${rot.toFixed(2)})`);
    this.arm.setAttribute("transform", `rotate(${(-figureWorld * DEG).toFixed(2)})`);
    // the chariot icon sits outside the rose group, so it gets both rotations
    this.cart.setAttribute("transform", `rotate(${(rot - heading * DEG).toFixed(2)})`);
    const ok = Math.abs(errorDeg) < OK_DEG;
    const deg = Math.round(Math.abs(errorDeg));
    const t = ok ? "木人指着正南" : `木人偏离正南 ${deg}°`;
    if (t !== this.lastText) {
      this.text.textContent = t;
      this.lastText = t;
      this.el.classList.toggle("ok", ok);
      this.el.classList.toggle("off", !ok);
    }
  }
}

/** Format chi with one decimal, no "-0.0". @param {number} v */
const fmt = (v) => {
  const r = Math.round(v * 10) / 10;
  return (Object.is(r, -0) ? 0 : r).toFixed(1);
};

export class Odometer {
  constructor() {
    /** @param {"l" | "r"} side @param {string} name */
    const col = (side, name) => {
      const fill = h("div", { class: "fill" });
      const num = h("b", { class: "num" });
      const m = h("small", { class: "m" });
      const el = h("div", { class: `odo-col ${side}` }, [
        h("div", { class: "odo-read" }, [num, h("span", { class: "unit", text: "尺" }), m]),
        h("div", { class: "bar" }, [h("div", { class: "zero" }), fill]),
        h("div", { class: "odo-name", text: name }),
      ]);
      return { el, fill, num, m };
    };
    this.l = col("l", "左轮");
    this.r = col("r", "右轮");
    this.diff = h("p", { class: "odo-diff" });
    this.el = h("div", { class: "hud-odo", role: "group", "aria-label": "两个车轮各走了多远" }, [
      h("div", { class: "odo-cols" }, [this.l.el, this.r.el]),
      this.diff,
    ]);
    this.scale = 10;
  }

  /** @param {number} distL signed chi @param {number} distR */
  update(distL, distR) {
    const big = Math.max(Math.abs(distL), Math.abs(distR));
    // Grow the scale in steps so the bars do not jitter.
    while (big > this.scale) this.scale *= 2;
    while (this.scale > 10 && big < this.scale / 4) this.scale /= 2;
    const neg = distL < -0.05 || distR < -0.05;
    this.el.classList.toggle("signed", neg);
    for (const [c, v] of /** @type {const} */ ([[this.l, distL], [this.r, distR]])) {
      const f = Math.min(1, Math.abs(v) / this.scale);
      const pct = neg ? f * 50 : f * 100;
      c.fill.style.height = `${pct}%`;
      c.fill.style.bottom = neg && v < 0 ? `${50 - pct}%` : neg ? "50%" : "0";
      c.fill.classList.toggle("back", v < -0.05);
      c.num.textContent = fmt(v);
      c.m.textContent = `约 ${fmt(v * CHI_IN_METERS)} 米`;
    }
    const d = distR - distL;
    let t = "两个轮子走得一样多";
    if (Math.abs(d) >= 0.1) t = d > 0 ? `右轮比左轮多走 ${fmt(d)} 尺` : `左轮比右轮多走 ${fmt(-d)} 尺`;
    this.diff.textContent = t;
    this.diff.dataset.side = Math.abs(d) < 0.1 ? "" : d > 0 ? "r" : "l";
  }
}

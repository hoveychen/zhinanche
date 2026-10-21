// Heads-up displays over the 3D view: the south dial (where the figure points,
// turned to match the camera like a map, its letters kept upright) and the two
// wheels' distances, which fold away with a tap.

import { h, s } from "./dom.js";
import { S, bind, onLang } from "../i18n.js";
import { icon } from "./icons.js";

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
    /** the letters ride round with the rose but are turned back to stay upright */
    /** @type {{el: SVGElement, x: number, y: number}[]} */
    this.upright = [];
    const letter = (/** @type {"north" | "east" | "west"} */ t, /** @type {number} */ x, /** @type {number} */ y) => {
      const el = bind(s("text", { x, y, class: "dir" }), (str) => str.hud[t]);
      this.upright.push({ el, x, y });
      return el;
    };
    const stamp = s("g", {}, [s("rect", { x: -17, y: -17, width: 34, height: 34, rx: 3 })]);
    const nan = bind(s("text", { x: 0, y: 1 }), (str) => str.hud.south);
    stamp.append(nan);
    const seal = s("g", { class: "seal", transform: "translate(0 58)" }, [stamp]);
    this.upright.push({ el: stamp, x: 0, y: 0 });
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
      letter("north", 0, -55), letter("east", 55, 0), letter("west", -55, 0),
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
    this.lastRot = NaN;
    onLang(() => {
      this.lastText = "";
    });
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
    if (!(Math.abs(rot - this.lastRot) <= 0.05)) {
      this.lastRot = rot;
      for (const u of this.upright) u.el.setAttribute("transform", `rotate(${(-rot).toFixed(2)} ${u.x} ${u.y})`);
    }
    this.arm.setAttribute("transform", `rotate(${(-figureWorld * DEG).toFixed(2)})`);
    // the chariot icon sits outside the rose group, so it gets both rotations
    this.cart.setAttribute("transform", `rotate(${(rot - heading * DEG).toFixed(2)})`);
    const ok = Math.abs(errorDeg) < OK_DEG;
    const deg = Math.round(Math.abs(errorDeg));
    const t = ok ? S().hud.onSouth : S().hud.offSouth(deg);
    if (t !== this.lastText) {
      this.text.textContent = t;
      this.lastText = t;
      this.el.classList.toggle("ok", ok);
      this.el.classList.toggle("off", !ok);
    }
  }
}

export class Odometer {
  constructor() {
    /** @param {"l" | "r"} side @param {"wheelL" | "wheelR"} name */
    const col = (side, name) => {
      const fill = h("div", { class: "fill" });
      const num = h("b", { class: "num" });
      const m = h("small", { class: "m" });
      const el = h("div", { class: `odo-col ${side}` }, [
        h("div", { class: "odo-read" }, [num, bind(h("span", { class: "unit" }), (str) => str.hud.unit), m]),
        h("div", { class: "odo-bar" }, [h("div", { class: "zero" }), fill]),
        bind(h("div", { class: "odo-name" }), (str) => str.hud[name]),
      ]);
      return { el, fill, num, m };
    };
    this.l = col("l", "wheelL");
    this.r = col("r", "wheelR");
    this.diff = h("p", { class: "odo-diff" });
    // A tap folds it down to the one line under the bars (small screens need the room).
    this.el = bind(h("div", { class: "hud-odo", role: "button", tabindex: "0", "aria-expanded": "true" }, [
      h("div", { class: "odo-cols" }, [this.l.el, this.r.el]),
      this.diff,
      icon("chevron-down", "odo-fold"),
    ]), (str) => str.hud.odoLabel, "aria-label");
    const fold = () => this.setFolded(!this.el.classList.contains("folded"));
    this.el.addEventListener("click", fold);
    this.el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fold();
      }
    });
    this.scale = 10;
  }

  /** @param {boolean} folded */
  setFolded(folded) {
    this.el.classList.toggle("folded", folded);
    this.el.setAttribute("aria-expanded", String(!folded));
  }

  /** @param {number} distL signed chi @param {number} distR */
  update(distL, distR) {
    const big = Math.max(Math.abs(distL), Math.abs(distR));
    // Grow the scale in steps so the bars do not jitter.
    while (big > this.scale) this.scale *= 2;
    while (this.scale > 10 && big < this.scale / 4) this.scale /= 2;
    const neg = distL < -0.05 || distR < -0.05;
    this.el.classList.toggle("signed", neg);
    const t = S().hud;
    for (const [c, v] of /** @type {const} */ ([[this.l, distL], [this.r, distR]])) {
      const f = Math.min(1, Math.abs(v) / this.scale);
      // the bar's length and where it starts, as fractions; CSS lays the bars
      // out upright or (on phones) lying down
      const len = neg ? f / 2 : f;
      c.fill.style.setProperty("--len", len.toFixed(4));
      c.fill.style.setProperty("--from", (neg && v < 0 ? 0.5 - len : neg ? 0.5 : 0).toFixed(4));
      c.fill.classList.toggle("back", v < -0.05);
      c.num.textContent = t.num(v);
      c.m.textContent = t.sub(v);
    }
    const d = distR - distL;
    let line = t.same;
    // one forward and one back (spinning on the spot): "more" would be wrong
    if (Math.min(distL, distR) <= -0.1 && Math.max(distL, distR) >= 0.1) line = t.opposite;
    else if (Math.abs(d) >= 0.1) line = d > 0 ? t.rightMore(d) : t.leftMore(-d);
    this.diff.textContent = line;
    this.diff.dataset.side = Math.abs(d) < 0.1 ? "" : d > 0 ? "r" : "l";
  }
}

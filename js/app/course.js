// The side panel: the lesson list (home), the lesson player, and free
// driving. The player shows a step's text, picture and task, applies its scene
// directive, and ticks the task off when its check passes.

import { h } from "./dom.js";
import { LESSONS } from "../teach/lessons.js";
import { stateAt } from "./directive.js";
import { checkPassed } from "./checks.js";

/** @import { App } from "./app.js" */
/** @import { Tools } from "./tools.js" */
/** @import { Lesson, LessonStep, ChoiceTask, DoTask } from "../teach/types.js" */

const NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/** Lesson text: paragraphs split on blank lines; trusted inline HTML. @param {string} text */
function paragraphs(text) {
  return text.split(/\n\n+/).map((p) => h("p", { html: p.replace(/\n/g, "<br>") }));
}

export class Course {
  /**
   * @param {App} app
   * @param {Tools} tools
   * @param {HTMLElement} panel
   * @param {{onMode: (mode: "home" | "lesson" | "free") => void}} cb
   */
  constructor(app, tools, panel, cb) {
    this.app = app;
    this.tools = tools;
    this.panel = panel;
    this.cb = cb;
    /** @type {"home" | "lesson" | "free"} */
    this.mode = "home";
    this.lesson = 0;
    this.step = 0;
    /** @type {{el: HTMLElement, task: DoTask, passed: boolean} | null} */
    this.doTask = null;
    /** @type {HTMLButtonElement | null} */
    this.replayBtn = null;
    app.onTick(() => this.#tick());
  }

  // ---------- home ----------

  home() {
    this.mode = "home";
    this.doTask = null;
    const list = h("ol", { class: "lesson-list" }, LESSONS.map((l, i) => h("li", {}, [
      h("button", { type: "button", class: "lesson-item", onclick: () => this.open(i) }, [
        h("span", { class: "lesson-num", "aria-hidden": "true", text: NUM[i] }),
        h("span", { class: "lesson-words" }, [
          h("span", { class: "lesson-title", text: l.title }),
          h("span", { class: "lesson-sum", text: l.summary }),
        ]),
      ]),
    ])));
    const body = h("div", { class: "home" }, [
      h("h2", { class: "home-title", text: "指南车" }),
      h("p", { class: "home-lede", text: "车怎么拐弯，车上木人的手都指着南。车里没有磁铁，只有齿轮。" }),
      h("button", { type: "button", class: "primary big", "data-focus": "free", onclick: () => this.free() }, [h("span", { text: "自己开一开" })]),
      h("h3", { class: "list-head", text: "六节课" }),
      list,
    ]);
    this.#show(body, null);
    this.app.idleLoop = true;
    this.app.direct({ reset: true, view: "overview", play: "sCurve" }, {
      jump: { ...this.app.state, mechanism: "differential", view: "overview", xray: false, explode: 0, highlight: [], trails: true, odometer: false, assist: true, faults: {}, slip: {}, speed: 1, demo: null, controls: [] },
    });
    this.app.idleLoop = true;
    this.cb.onMode("home");
  }

  // ---------- free driving ----------

  free() {
    this.mode = "free";
    this.doTask = null;
    const body = h("div", { class: "free" }, [
      h("h2", { class: "panel-title", text: "自己开" }),
      h("p", { text: "按住方向按钮开车，或者用键盘的方向键。" }),
      h("p", { text: "按「画路线」，在地上画一条路，车会沿着它走。点一点齿轮，看看它叫什么。" }),
    ]);
    this.#show(body, null);
    this.app.free();
    this.cb.onMode("free");
  }

  // ---------- lessons ----------

  /** @param {number} i lesson index @param {number} [step] */
  open(i, step = 0) {
    this.mode = "lesson";
    this.lesson = i;
    this.goto(step, true);
    this.cb.onMode("lesson");
  }

  get current() {
    return LESSONS[this.lesson];
  }

  /**
   * @param {number} k step index
   * @param {boolean} jump fold the directives from the start instead of applying one on top
   */
  goto(k, jump) {
    const lesson = this.current;
    this.step = k;
    const step = lesson.steps[k];
    this.app.idleLoop = false;
    this.app.takeOver();
    this.app.lastPlay = null;
    if (jump) this.app.direct(step.scene ?? {}, { jump: stateAt(lesson.steps, k) });
    else this.app.direct(step.scene ?? {});
    this.app.newTracker();
    this.#render(lesson, step);
  }

  next() {
    const l = this.current;
    if (this.step < l.steps.length - 1) this.goto(this.step + 1, false);
    else if (this.lesson < LESSONS.length - 1) this.open(this.lesson + 1);
    else this.home();
  }

  back() {
    if (this.step > 0) this.goto(this.step - 1, true);
    else if (this.lesson > 0) this.open(this.lesson - 1, LESSONS[this.lesson - 1].steps.length - 1);
  }

  /** @param {Lesson} lesson @param {LessonStep} step */
  #render(lesson, step) {
    const n = lesson.steps.length;
    const dots = h("ol", { class: "dots", "aria-label": `第 ${this.step + 1} 步，共 ${n} 步` },
      lesson.steps.map((_, i) => h("li", { class: i === this.step ? "now" : i < this.step ? "done" : "" })));
    /** @type {(HTMLElement | null)[]} */
    const parts = [
      h("header", { class: "lesson-head" }, [
        h("p", { class: "lesson-kicker", text: `第${NUM[this.lesson]}课` }),
        h("h2", { class: "panel-title", text: lesson.title, tabindex: "-1", "data-focus-home": true }),
        dots,
      ]),
      h("div", { class: "lesson-text" }, paragraphs(step.text)),
    ];
    if (step.picture) {
      parts.push(h("figure", { class: "pic" }, [
        h("img", { src: step.picture.src, alt: step.picture.alt, loading: "lazy" }),
        h("figcaption", { text: step.picture.credit }),
      ]));
    }
    this.replayBtn = null;
    if (step.scene?.play) {
      this.replayBtn = h("button", { type: "button", class: "plain replay", onclick: () => this.app.replay() }, [h("span", { text: "再看一遍" })]);
      parts.push(this.replayBtn);
    }
    if (step.scene?.demo === "holdHands" || (this.app.state.demo === "holdHands")) {
      parts.push(h("button", { type: "button", class: "primary walk", "data-demo": "walk", onclick: () => this.app.world.holdHands.walk() }, [h("span", { text: "让他们走一圈" })]));
    }
    this.doTask = null;
    if (step.task?.kind === "choose") parts.push(this.#choose(step.task));
    if (step.task?.kind === "do") parts.push(this.#do(step.task));
    const last = this.step === n - 1;
    const nav = h("nav", { class: "panel-nav", "aria-label": "翻页" }, [
      h("button", { type: "button", class: "plain", disabled: this.step === 0 && this.lesson === 0, onclick: () => this.back(), text: "上一步" }),
      h("span", { class: "step-count", text: `${this.step + 1} / ${n}` }),
      h("button", { type: "button", class: "primary", "data-focus": "next", onclick: () => this.next(), text: !last ? "下一步" : this.lesson < LESSONS.length - 1 ? "下一课" : "回到目录" }),
    ]);
    this.#show(h("article", { class: "lesson" }, parts), nav);
  }

  /** @param {ChoiceTask} t */
  #choose(t) {
    const fb = h("p", { class: "feedback", "aria-live": "polite" });
    const box = h("div", { class: "task choose" });
    const opts = t.options.map((o, i) => h("button", {
      type: "button", class: "option", text: o,
      onclick: (e) => {
        const b = /** @type {HTMLButtonElement} */ (e.currentTarget);
        const right = i === t.answer;
        for (const x of opts) x.classList.remove("wrong");
        b.classList.add(right ? "right" : "wrong");
        if (right) for (const x of opts) x.setAttribute("disabled", "");
        fb.textContent = right ? t.right : t.wrong;
        box.classList.toggle("passed", right);
        fb.className = `feedback ${right ? "yes" : "hint"}`;
      },
    }));
    box.append(h("p", { class: "task-prompt", text: t.prompt }), h("div", { class: "options" }, opts), fb);
    return box;
  }

  /** @param {DoTask} t */
  #do(t) {
    const el = h("div", { class: "task do", "data-check": t.check }, [
      h("span", { class: "tick", "aria-hidden": "true" }),
      h("div", {}, [h("p", { class: "task-prompt", text: t.prompt }), h("p", { class: "feedback yes", "aria-live": "polite" })]),
    ]);
    this.doTask = { el, task: t, passed: false };
    return el;
  }

  #tick() {
    const d = this.doTask;
    if (d && !d.passed && checkPassed(d.task.check, this.app.tracker, this.app.snapshot())) {
      d.passed = true;
      d.el.classList.add("passed");
      const fb = d.el.querySelector(".feedback");
      if (fb) fb.textContent = d.task.done;
    }
    if (this.replayBtn) this.replayBtn.disabled = this.app.playing;
  }

  /** @param {HTMLElement} body @param {HTMLElement | null} nav */
  #show(body, nav) {
    const scroller = h("div", { class: "panel-body" }, [body, this.tools.el]);
    this.panel.replaceChildren(scroller, ...(nav ? [nav] : []));
    scroller.scrollTop = 0;
    this.tools.sync(this.app.state);
  }
}

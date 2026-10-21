// The side panel: the lesson list (home), the lesson player, and free
// driving. The player shows a step's text, picture and task, applies its scene
// directive, and ticks the task off when its check passes.

import { h, touchOnly } from "./dom.js";
import { icon } from "./icons.js";
import { S, bind, lessons } from "../i18n.js";
import { stateAt } from "./directive.js";
import { checkPassed } from "./checks.js";
import { siteFoot } from "./about.js";
import { placeHref } from "./share.js";

/** @import { App } from "./app.js" */
/** @import { Tools } from "./tools.js" */
/** @import { Lesson, LessonStep, ChoiceTask, DoTask, ControlId } from "../teach/types.js" */

/** The panel tool a "do" task is done with (the rest are done on the 3D view). */
/** @type {Partial<Record<DoTask["check"], Exclude<ControlId, "drive" | "draw" | "gearsView">>>} */
const TOOL_FOR = { xrayOn: "xray", opened: "explode", switchedToSong: "mechanism", madeItDrift: "faults", fixedDrift: "faults" };

/** Lesson text: paragraphs split on blank lines; trusted inline HTML. @param {string} text */
function paragraphs(text) {
  return text.split(/\n\n+/).map((p) => h("p", { html: p.replace(/\n/g, "<br>") }));
}

/**
 * Keep the address bar on where the course is, without a new history entry.
 * @param {Parameters<typeof placeHref>[1]} at
 */
function keepAddress(at) {
  try {
    const to = placeHref(location.href, at);
    if (to !== location.href) history.replaceState(history.state, "", to);
  } catch {}
}

/** A tablet held upright: the lesson panel under the view (css/style.css). */
const UPRIGHT_TABLET = typeof matchMedia === "function" ? matchMedia("(orientation: portrait) and (min-width: 601px)") : { matches: false };
/** ...takes at most and at least this much of the height under the top bar, and a picture in it no less than this (px). */
const PANEL = { most: 0.47, least: 0.36, picLeast: 110 };

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
    /** "walk them round" (the hold-hands demo), held back by a guess-first question */
    /** @type {HTMLButtonElement | null} */
    this.walkBtn = null;
    /** what the child has to press in this step: kept in view (short panels) */
    /** @type {HTMLElement | null} */
    this.target = null;
    /** @type {HTMLElement | null} */
    this.scroller = null;
    /** the option picked in this step's choice, so a relabel can pick it again */
    /** @type {number | null} */
    this.chosen = null;
    /** a guess-first question (ChoiceTask.guess): what plays once it is answered */
    /** @type {{play: string | null, walk: boolean} | null} */
    this.held = null;
    // In the nav bar, in place of the step count, so it never covers the task.
    this.cue = h("button", { type: "button", class: "more-cue", hidden: true, onclick: () => this.#more() }, [
      icon("arrow-down"),
      bind(h("span"), (s) => s.ui.moreBelow),
    ]);
    // Free driving on a phone: the panel is a sheet under the 3D view that
    // stays folded to this handle until it is wanted (CSS decides when).
    this.sheetText = h("span", { class: "sheet-text" });
    this.sheetBtn = h("button", { type: "button", class: "sheet-handle", "aria-expanded": "false", onclick: () => this.setSheet(document.body.dataset.sheet !== "open") }, [
      h("span", { class: "sheet-grip", "aria-hidden": "true" }), this.sheetText,
    ]);
    new ResizeObserver(() => this.#updateCue()).observe(panel);
    // a tablet turned upright: the step's words are measured again
    addEventListener("resize", () => {
      if (this.mode === "lesson") this.#fitPanel();
    });
    app.onTick(() => this.#tick());
  }

  /**
   * While the chariot is still loading: put up the page the address asks for
   * (the lesson list, a step's words, free driving's notes) so the panel is
   * not blank. Nothing in it works until the real one replaces it (inert).
   * @param {{mode: "home" | "free"} | {mode: "lesson", lesson: number, step: number}} at
   */
  preview(at) {
    this.panel.inert = true;
    this.mode = at.mode;
    if (at.mode === "home") this.#renderHome();
    else if (at.mode === "free") {
      this.setSheet(false);
      this.#renderFree();
    } else if (at.mode === "lesson") {
      this.lesson = at.lesson;
      this.step = at.step;
      this.#render(this.current, this.current.steps[at.step]);
    }
    // the step's own controls come with its scene, once the chariot is out
    if (at.mode !== "free") this.tools.el.hidden = true;
    this.cb.onMode(at.mode);
  }

  // ---------- home ----------

  home() {
    this.mode = "home";
    this.#renderHome();
    this.app.idleLoop = true;
    this.app.direct({ reset: true, view: "intro", play: "sCurve" }, {
      jump: { ...this.app.state, mechanism: "differential", view: "intro", xray: false, explode: 0, highlight: [], trails: true, odometer: false, assist: true, faults: {}, slip: {}, speed: 1, demo: null, controls: [] },
    });
    this.app.idleLoop = true;
    this.cb.onMode("home");
    keepAddress({ mode: "home" });
  }

  #renderHome() {
    this.doTask = null;
    const str = S();
    const t = str.home;
    const list = h("ol", { class: "lesson-list" }, lessons().map((l, i) => h("li", {}, [
      h("button", { type: "button", class: "lesson-item", onclick: () => this.open(i) }, [
        h("span", { class: "lesson-num", "aria-hidden": "true", text: str.course.numeral(i) }),
        h("span", { class: "lesson-words" }, [
          h("span", { class: "lesson-title", text: l.title }),
          h("span", { class: "lesson-sum", text: l.summary }),
        ]),
      ]),
    ])));
    // The questions people ask first, straight into the lesson step that answers them.
    const asks = h("ul", { class: "asks" }, str.asks.map((a) => h("li", {}, [
      h("button", { type: "button", class: "ask", "data-ask": `${a.lesson}-${a.step}`, onclick: () => this.open(a.lesson - 1, a.step - 1) }, [
        h("span", { class: "ask-q", text: a.q }),
        h("span", { class: "ask-a", text: a.a }),
        h("span", { class: "ask-go", "aria-hidden": "true", text: str.course.askGo(a.lesson - 1) }),
      ]),
    ])));
    const body = h("div", { class: "home" }, [
      h("p", { class: "home-kicker", text: t.kicker }),
      h("h2", { class: "home-title", text: t.title }),
      h("p", { class: "home-hook", text: t.hook }),
      h("div", { class: "home-cta" }, [
        h("button", { type: "button", class: "primary big", "data-focus": "free", onclick: () => this.free() }, [h("span", { text: t.drive })]),
        h("button", { type: "button", class: "plain big", onclick: () => this.open(0) }, [h("span", { text: t.start })]),
      ]),
      h("h3", { class: "list-head", text: t.askHead }),
      asks,
      h("h3", { class: "list-head", text: t.lessonsHead }),
      list,
      siteFoot(),
    ]);
    this.#show(body, null);
  }

  // ---------- free driving ----------

  /** @param {Partial<import("./directive.js").SceneState>} [over] a shared setup */
  free(over) {
    this.mode = "free";
    this.setSheet(false);
    this.#renderFree();
    this.app.free(over);
    this.cb.onMode("free");
    keepAddress({ mode: "free" });
  }

  #renderFree() {
    this.doTask = null;
    this.tools.lead(null);
    const t = S().free;
    const body = h("div", { class: "free" }, [
      h("h2", { class: "panel-title", text: t.title }),
      h("p", { text: touchOnly() ? t.howDriveTouch : t.howDrive }),
      h("p", { text: t.howDraw }),
    ]);
    this.#show(body, null, this.sheetBtn);
  }

  /**
   * Redraw the panel in the language just switched to, leaving the scene
   * alone: same page, same step, a task already done stays done.
   */
  relabel() {
    this.setSheet(document.body.dataset.sheet === "open");
    const top = this.scroller?.scrollTop ?? 0;
    if (this.mode === "home") this.#renderHome();
    else if (this.mode === "free") this.#renderFree();
    else {
      const passed = this.doTask?.passed ?? false;
      const chosen = this.chosen;
      this.#render(this.current, this.current.steps[this.step], true);
      if (passed && this.doTask) this.#pass(this.doTask);
      if (chosen !== null) /** @type {HTMLButtonElement | undefined} */ (this.panel.querySelectorAll(".option")[chosen])?.click();
    }
    if (this.scroller) this.scroller.scrollTop = top;
    this.#updateCue();
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
    return lessons()[this.lesson];
  }

  /** The odometer's line comparing the wheels waits: for a guess, or for the end of a route the words already tell. */
  get tallyHeld() {
    if (this.held !== null) return true;
    return this.mode === "lesson" && this.current.steps[this.step]?.tallyAtEnd === true && this.app.playing;
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
    // Guess first, then watch: nothing plays until the question is answered.
    const guess = step.task?.kind === "choose" && step.task.guess === true;
    const scene = { ...step.scene };
    if (guess) delete scene.play;
    if (jump) this.app.direct(scene, { jump: stateAt(lesson.steps, k) });
    else this.app.direct(scene);
    this.app.newTracker();
    // A step about the walk the children did ("count their footprints"),
    // reached without walking them (Next pressed, or a link to it): walk them
    // now, or once the guess is in. Half-way round, a guess starts them over.
    const hh = this.app.world.holdHands;
    const about = this.app.state.demo === "holdHands" && !(step.task?.kind === "do" && step.task.check === "playedDemo");
    if (about && guess && hh.walking) hh.reset();
    const unwalked = about && !hh.walking && hh.steps.in === 0;
    if (unwalked && !guess) hh.walk();
    this.held = guess ? { play: step.scene?.play ?? null, walk: unwalked } : null;
    this.#render(lesson, step);
    keepAddress({ mode: "lesson", lesson: this.lesson + 1, step: k + 1 });
  }

  next() {
    const l = this.current;
    if (this.step < l.steps.length - 1) this.goto(this.step + 1, false);
    else if (this.lesson < lessons().length - 1) this.open(this.lesson + 1);
    else this.home();
  }

  back() {
    if (this.step > 0) this.goto(this.step - 1, true);
    else if (this.lesson > 0) this.open(this.lesson - 1, lessons()[this.lesson - 1].steps.length - 1);
  }

  /** @param {Lesson} lesson @param {LessonStep} step @param {boolean} [keep] a relabel: keep the scroll */
  #render(lesson, step, keep = false) {
    const t = S().course;
    const n = lesson.steps.length;
    this.chosen = null;
    const dots = h("ol", { class: "dots", "aria-label": t.stepsLabel(this.step + 1, n) },
      lesson.steps.map((_, i) => h("li", { class: i === this.step ? "now" : i < this.step ? "done" : "" })));
    /** @type {(HTMLElement | null)[]} */
    const parts = [
      h("header", { class: "lesson-head" }, [
        h("p", { class: "lesson-kicker", text: t.kicker(this.lesson) }),
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
      this.replayBtn = h("button", { type: "button", class: "plain replay", hidden: this.held !== null, onclick: () => this.app.replay() }, [icon("repeat"), h("span", { text: t.replay })]);
      parts.push(this.replayBtn);
    }
    this.walkBtn = null;
    if (stateAt(lesson.steps, this.step).demo === "holdHands") {
      // a guess first: walking them now would give the answer away
      const held = this.held !== null;
      this.walkBtn = h("button", { type: "button", class: "primary walk", "data-demo": "walk", disabled: held, onclick: () => this.app.world.holdHands.walk() }, [icon("walk"), h("span", { text: held ? t.walkAfterGuess : t.walk })]);
      parts.push(this.walkBtn);
    }
    this.doTask = null;
    this.target = null;
    if (step.task?.kind === "choose") {
      const box = this.#choose(step.task);
      parts.push(box);
      this.target = box;
    }
    const tool = step.task?.kind === "do" ? TOOL_FOR[step.task.check] ?? null : null;
    if (step.task?.kind === "do") {
      parts.push(this.#do(step.task));
      if (tool) this.target = this.tools.blocks[tool];
    }
    this.tools.lead(tool);
    const last = this.step === n - 1;
    const nav = h("nav", { class: "panel-nav", "aria-label": t.navLabel }, [
      h("button", { type: "button", class: "plain", disabled: this.step === 0 && this.lesson === 0, onclick: () => this.back() }, [icon("chevron-left"), h("span", { text: t.back })]),
      h("span", { class: "step-count", text: `${this.step + 1} / ${n}` }),
      this.cue,
      h("button", { type: "button", class: "primary", "data-focus": "next", onclick: () => this.next() }, [h("span", { text: !last ? t.next : this.lesson < lessons().length - 1 ? t.nextLesson : t.toc }), icon("chevron-right")]),
    ]);
    this.#show(h("article", { class: "lesson" }, parts), nav, null, keep);
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
        this.chosen = i;
        for (const x of opts) x.classList.remove("wrong");
        b.classList.add(right ? "right" : "wrong");
        if (right) for (const x of opts) x.setAttribute("disabled", "");
        fb.textContent = right ? t.right : t.wrong;
        box.classList.toggle("passed", right);
        fb.className = `feedback ${right ? "yes" : "hint"}`;
        this.#release();
        box.querySelector(".guess-note")?.remove();
        this.#reveal(true, fb);
      },
    }));
    const note = t.guess && this.held ? h("p", { class: "guess-note", text: S().course.guessNote }) : null;
    box.append(h("p", { class: "task-prompt", text: t.prompt }), ...(note ? [note] : []), h("div", { class: "options" }, opts), fb);
    return box;
  }

  /** The guess is in: play what the question held back. */
  #release() {
    const held = this.held;
    if (!held) return;
    this.held = null;
    if (held.play) this.app.play(held.play);
    const hh = this.app.world.holdHands;
    // not if "walk them round" already did
    if (held.walk && !hh.walking && hh.steps.in === 0) hh.walk();
    if (this.replayBtn) this.replayBtn.hidden = false;
    if (this.walkBtn) {
      this.walkBtn.disabled = false;
      /** @type {HTMLElement} */ (this.walkBtn.querySelector("span")).textContent = S().course.walk;
    }
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
      this.#pass(d);
    }
    if (this.replayBtn) this.replayBtn.disabled = this.app.playing;
  }

  /** @param {NonNullable<Course["doTask"]>} d */
  #pass(d) {
    d.passed = true;
    d.el.classList.add("passed");
    const fb = d.el.querySelector(".feedback");
    if (fb) fb.textContent = d.task.done;
  }

  /** @param {boolean} open */
  setSheet(open) {
    document.body.dataset.sheet = open ? "open" : "closed";
    this.sheetBtn.setAttribute("aria-expanded", String(open));
    this.sheetText.textContent = open ? S().ui.sheetClose : S().ui.sheetOpen;
  }

  /** @param {HTMLElement} body @param {HTMLElement | null} nav @param {HTMLElement | null} [handle] @param {boolean} [keep] */
  #show(body, nav, handle = null, keep = false) {
    const scroller = h("div", { class: "panel-body", onscroll: () => this.#updateCue() }, [body, this.tools.el]);
    this.panel.replaceChildren(...(handle ? [handle] : []), scroller, ...(nav ? [nav] : []));
    this.scroller = scroller;
    scroller.scrollTop = 0;
    this.tools.sync(this.app.state);
    this.#fitPanel();
    if (keep) return;
    if (body.classList.contains("lesson")) this.#reveal(false);
    else this.target = null;
    this.#updateCue();
  }

  /**
   * A tablet held upright: the view over the lesson panel keeps at least the
   * half of the screen it always had, and takes what a step's words leave
   * empty, up to 1 - PANEL.least of it (a step of two lines left a third of the
   * screen blank). A step longer than the panel first gives up some of its
   * picture's height, so the picture's credit line shows without scrolling.
   * Set once as the step opens: an answer coming up under the question
   * scrolls, it doesn't push the view about.
   */
  #fitPanel() {
    const layout = this.panel.parentElement;
    if (!layout) return;
    layout.style.removeProperty("--panel-h");
    this.panel.style.removeProperty("--pic-h");
    if (this.mode !== "lesson" || !UPRIGHT_TABLET.matches || !this.scroller) return;
    const total = layout.clientHeight;
    const nav = this.panel.querySelector(".panel-nav");
    const edge = this.panel.offsetHeight - this.panel.clientHeight;
    const sc = this.scroller;
    // the words' height, not the scroller's (it fills the panel)
    const words = () => {
      const top = sc.getBoundingClientRect().top - sc.scrollTop;
      let bottom = top;
      for (const c of sc.children) if (c instanceof HTMLElement && !c.hidden) bottom = Math.max(bottom, c.getBoundingClientRect().bottom);
      return bottom - top + parseFloat(getComputedStyle(sc).paddingBottom);
    };
    const need = () => words() + (nav ? nav.getBoundingClientRect().height : 0) + edge;
    const most = total * PANEL.most, least = total * PANEL.least;
    let n = need();
    const img = sc.querySelector(".pic img");
    if (n > most && img) {
      const h = img.getBoundingClientRect().height;
      this.panel.style.setProperty("--pic-h", `${Math.round(Math.max(PANEL.picLeast, h - (n - most)))}px`);
      n = need();
    }
    let ph = Math.round(Math.min(most, Math.max(least, n)));
    layout.style.setProperty("--panel-h", `${ph}px`);
    // what the boxes leave out (the last line's margin): the scroller says
    const over = sc.scrollHeight - sc.clientHeight;
    if (over > 0 && ph < most) {
      ph = Math.round(Math.min(most, ph + over));
      layout.style.setProperty("--panel-h", `${ph}px`);
    }
  }

  /** How far the element's bottom is below the panel's visible part (px). @param {HTMLElement} el */
  #below(el) {
    if (!this.scroller) return 0;
    return el.getBoundingClientRect().bottom - this.scroller.getBoundingClientRect().bottom;
  }

  /**
   * Scroll the panel so what the child has to press is in view. On opening a
   * step (`all` false) scroll at most until the lesson's heading ("第三课"
   * and the title) is at the top, so the child still sees which lesson this
   * is and reads the text from its first line (phones held upright: the panel
   * is short); the cue covers the rest. A control the task is done with may
   * scroll the heading away, as far as the text's first line.
   * @param {boolean} all
   * @param {HTMLElement | null} [el] default: this step's target
   */
  #reveal(all, el = this.target) {
    const sc = this.scroller;
    if (!sc || !el) return;
    const need = this.#below(el) + 14;
    if (need <= 0) return;
    const by = all ? need : this.#stop(need, this.doTask !== null && el !== this.doTask.el);
    if (by <= 0) return;
    if (all) sc.scrollBy({ top: by, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    else sc.scrollTop += by;
  }

  /**
   * How far opening a step may scroll: only to where a block of the heading
   * or the text begins (never through a line of words), at most to the text's
   * first line (`past` true) or the heading. The least that shows all of the
   * control, else the most allowed: better a control half in view than a
   * line of words cut in two.
   * @param {number} need @param {boolean} past
   */
  #stop(need, past) {
    const sc = /** @type {HTMLElement} */ (this.scroller);
    const y0 = sc.getBoundingClientRect().top + 2;
    const head = sc.querySelector(".lesson-head");
    const text = sc.querySelector(".lesson-text");
    if (!head || !text) return 0;
    /** The lines of words in a box (a big heading's glyphs reach above its box). @param {Element} box */
    const linesIn = (box) => {
      /** @type {DOMRect[]} */
      const out = [];
      const tw = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const r = document.createRange();
        r.selectNodeContents(n);
        out.push(...r.getClientRects());
      }
      return out;
    };
    const lines = [...linesIn(head), ...linesIn(text)];
    // the step dots alone on top would mean nothing: not a place to stop
    const blocks = past ? [...head.children].filter((b) => !b.matches(".dots")).concat(text) : [head];
    // a short panel can't scroll that far: the browser would stop mid-line
    const most = sc.scrollHeight - sc.clientHeight - sc.scrollTop;
    const stops = blocks.map((b) => Math.min(b.getBoundingClientRect().top, ...linesIn(b).map((l) => l.top)))
      .filter((y) => !lines.some((l) => l.top < y - 0.5 && l.bottom > y + 0.5))
      .map((y) => Math.floor(y - y0)).filter((d) => d > 0 && d <= most).sort((a, b) => a - b);
    return stops.find((d) => d >= need) ?? stops.at(-1) ?? 0;
  }

  /**
   * The first thing to press that the panel cuts off: this step's target, or
   * else any button or task card under the fold (the step's tools, "回到起点").
   * @returns {HTMLElement | null}
   */
  #cutOff() {
    const sc = this.scroller;
    if (!sc) return null;
    if (this.target && this.#below(this.target) > 1) return this.target;
    for (const el of sc.querySelectorAll(".task, button")) {
      if (el instanceof HTMLElement && el.getClientRects().length > 0 && this.#below(el) > 1) return el;
    }
    return null;
  }

  /** "往下看" pressed: bring the first cut-off control into view. */
  #more() {
    const el = this.#cutOff();
    if (el) this.#reveal(true, el);
  }

  /** Show "往下看" while something to press is still below the fold. */
  #updateCue() {
    const show = this.#cutOff() !== null;
    this.cue.hidden = !show;
    this.panel.querySelector(".panel-nav")?.classList.toggle("cue-on", show);
  }
}

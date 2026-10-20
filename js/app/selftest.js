// ?selftest: walk every step of every lesson in the browser the way a child
// would (Next, Next, …), and check that nothing throws, auto-play finishes,
// the step's controls (and only those) are on show, there is no sideways
// scrolling, and each task can be done through the real controls. Results go
// to the console and to window.__selftest / body[data-selftest].

import { S, lessons } from "../i18n.js";
import { ALL_CONTROLS } from "./directive.js";

/** @import { App } from "./app.js" */
/** @import { Course } from "./course.js" */
/** @import { World } from "../scene/world.js" */
/** @import { Tools } from "./tools.js" */
/** @import { DriveInput, Dir } from "./drive.js" */
/** @import { CheckId } from "../teach/types.js" */

const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

/** @param {Element | null} el */
function visible(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest("[hidden]")) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * @param {{app: App, course: Course, world: World, tools: Tools, input: DriveInput}} ctx
 */
export async function selftest({ app, course, world, input }) {
  /** @type {string[]} */
  const errors = [];
  const onErr = (/** @type {ErrorEvent} */ e) => errors.push(String(e.message));
  const onRej = (/** @type {PromiseRejectionEvent} */ e) => errors.push(String(e.reason));
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onRej);
  const origError = console.error;
  console.error = (...a) => {
    errors.push(a.map(String).join(" "));
    origError.apply(console, a);
  };

  /**
   * Hold keys for `secs` of sim time.
   * @param {Dir[]} keys @param {number} secs
   */
  const hold = (keys, secs) => {
    app.takeOver();
    for (const k of keys) input.keys.add(k);
    for (let t = 0; t < secs; t += 0.05) app.tick(0.05);
    input.release();
  };
  /** @param {string} sel */
  const click = (sel) => {
    const el = document.querySelector(sel);
    if (!(el instanceof HTMLElement) || !visible(el)) throw new Error(`cannot click ${sel}`);
    el.click();
  };
  /** @param {string} label */
  const clickText = (label) => {
    const el = [...document.querySelectorAll("#panel button")].find((b) => b.textContent?.trim() === label);
    if (!(el instanceof HTMLElement) || !visible(el)) throw new Error(`no visible button "${label}"`);
    el.click();
  };

  /** @type {Record<CheckId, () => void>} */
  const DO = {
    drove: () => hold(["up"], 2),
    turnedLeft: () => hold(["up", "left"], 2),
    turnedRight: () => hold(["up", "right"], 2),
    turnedAround: () => hold(["left"], 4),
    drewRoute: () => {
      const s = app.where();
      const pts = [];
      for (let i = 1; i <= 30; i++) pts.push({ x: s.x + Math.sin(i / 5) * 6, z: s.z - i });
      app.followRoute(pts);
      for (let i = 0; i < 4000 && app.follow; i++) app.tick(0.05);
    },
    opened: () => clickText(S().tools.apart),
    xrayOn: () => clickText(S().tools.xray),
    switchedToSong: () => clickText(S().tools.song),
    madeItDrift: () => {
      clickText(S().tools.faultTrack);
      hold(["up", "left"], 3);
    },
    fixedDrift: () => {
      clickText(S().tools.faultNone);
      clickText(S().tools.noSlip);
    },
    playedDemo: () => {
      click("[data-demo=walk]");
      world.holdHands.finish();
    },
  };

  /** @type {{at: string, ok: boolean, problems: string[]}[]} */
  const results = [];
  const LESSONS = lessons();
  for (let li = 0; li < LESSONS.length; li++) {
    const lesson = LESSONS[li];
    for (let si = 0; si < lesson.steps.length; si++) {
      const at = `${li + 1}.${si + 1}`;
      /** @type {string[]} */
      const problems = [];
      const errBefore = errors.length;
      try {
        if (si === 0) course.open(li);
        else course.next();
        if (course.lesson !== li || course.step !== si) problems.push(`player at ${course.lesson + 1}.${course.step + 1}`);
        await frame();
        await frame();
        const step = lesson.steps[si];
        const st = app.state;
        for (const id of ALL_CONTROLS) {
          const shown = visible(document.querySelector(`[data-control="${id}"]`));
          if (shown !== st.controls.includes(id)) problems.push(`control ${id} ${shown ? "shown" : "hidden"}`);
        }
        if (step.scene?.play) {
          if (!app.player) problems.push("play did not start");
          app.finishPlayback();
          if (app.player && !app.player.done) problems.push("play did not finish");
          if (!Number.isFinite(app.chariot.pose().errorDeg)) problems.push("pose is not finite");
        }
        if (document.documentElement.scrollWidth > window.innerWidth + 1) problems.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${window.innerWidth})`);
        const t = step.task;
        if (t?.kind === "choose") {
          const opts = [...document.querySelectorAll(".task.choose .option")];
          /** @type {HTMLElement} */ (opts[t.answer]).click();
          if (!document.querySelector(".task.choose.passed")) problems.push("right answer not accepted");
        } else if (t?.kind === "do") {
          DO[t.check]();
          app.tick(0);
          await frame();
          if (!document.querySelector(".task.do.passed")) problems.push(`task ${t.check} did not pass`);
        }
        await frame();
      } catch (e) {
        problems.push(`threw: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
      }
      problems.push(...errors.slice(errBefore).map((m) => `error: ${m}`));
      results.push({ at, ok: problems.length === 0, problems });
      if (problems.length) origError.call(console, `[selftest] FAIL ${at} ${lesson.title}: ${problems.join("; ")}`);
      else console.log(`[selftest] ok ${at} ${lesson.title}`);
    }
  }
  console.error = origError;
  window.removeEventListener("error", onErr);
  window.removeEventListener("unhandledrejection", onRej);
  const passed = results.filter((r) => r.ok).length;
  const summary = `[selftest] ${passed}/${results.length} steps passed${passed === results.length ? " — ALL PASS" : ""}`;
  (passed === results.length ? console.log : console.warn)(summary);
  /** @type {any} */ (window).__selftest = { passed, total: results.length, results };
  document.body.dataset.selftest = passed === results.length ? "pass" : "fail";
  course.home();
  return results;
}

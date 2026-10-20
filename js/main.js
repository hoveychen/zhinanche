// Page entry: builds the 3D view, the HUD, the controls and the lesson panel,
// wires pointer input (drawing routes, tapping parts) and runs the frame loop.

import { World, toWorld } from "./scene/world.js";
import { App } from "./app/app.js";
import { DriveInput } from "./app/drive.js";
import { Tools } from "./app/tools.js";
import { Course } from "./app/course.js";
import { Dial, Odometer } from "./app/hud.js";
import { byId, h, s } from "./app/dom.js";
import { LESSONS } from "./teach/lessons.js";
import { STR } from "./teach/strings.js";
import { decodeShare, setupOf } from "./app/share.js";
import { ShareButton } from "./app/sharelink.js";

/** @import { Object3D, Vector3 } from "three" */

const stage = byId("stage");
const glHost = byId("stage-gl");
const overlay = byId("stage-overlay");
const loading = byId("loading");

const world = new World(glHost);
// the other chariot's model is fetched the first time it is picked
world.onLoading = (on, err) => {
  loading.hidden = !on && !err;
  if (err) {
    loading.textContent = STR.ui.modelFailed;
    loading.classList.add("error");
  }
};
const input = new DriveInput({
  onDraw: (on) => {
    world.controls.enabled = !on;
    stage.classList.toggle("drawing", on);
    hint.hidden = !on;
    if (on && app.state.view !== "top") app.direct({ view: "top" });
  },
  onDrive: () => app.takeOver(),
});
const app = new App(world, input);
app.onPause((on) => {
  pauseBtn.classList.toggle("on", on);
  pauseBtn.setAttribute("aria-pressed", String(on));
  pauseText.textContent = on ? STR.ui.resume : STR.ui.pause;
  pausedNote.hidden = !on;
  stage.classList.toggle("paused", on);
});
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  // Space on a control reached with the keyboard presses that control;
  // anything else (a button only clicked with the mouse keeps the focus) pauses.
  if (t instanceof HTMLElement && t !== document.body && t.matches(":focus-visible") && t.closest("button, [role=button], a")) return;
  e.preventDefault();
  app.setPaused(!app.paused);
});
const tools = new Tools({ direct: (d) => app.direct(d), resetChariot: () => app.resetChariot() });
const dial = new Dial();
const odo = new Odometer();
const hint = h("p", { class: "stage-hint", hidden: true, text: "用手指在地上画一条路，松手车就出发" });
const demoCount = h("p", { class: "demo-count", hidden: true });
const callout = h("div", { class: "callout", hidden: true, role: "status" });
// Home page only (CSS): what to look at, and that the view can be dragged.
const stageHook = h("div", { class: "stage-hook" }, [
  h("p", { class: "stage-hook-line", text: STR.stage.hook }),
  h("p", { class: "drag-hint" }, [
    /** @type {Node} */ (/** @type {unknown} */ (s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, [s("path", { d: "M4 12 L8 8 V10.5 H16 V8 L20 12 L16 16 V13.5 H8 V16 Z" })]))),
    h("span", { text: STR.stage.dragHint }),
  ]),
]);
// The global pause: holds the lesson's auto-play, hand driving, a drawn route,
// the gears and the walking demo; the view can still be dragged round.
const pauseText = h("span", { text: STR.ui.pause });
const pauseBtn = h("button", { type: "button", class: "pause-btn", "aria-pressed": "false", title: "空格键", onclick: () => app.setPaused(!app.paused) }, [
  /** @type {Node} */ (/** @type {unknown} */ (s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, [s("path", { class: "i-pause", d: "M6 4 H10 V20 H6 Z M14 4 H18 V20 H14 Z" }), s("path", { class: "i-play", d: "M7 4 L20 12 L7 20 Z" })]))),
  pauseText,
]);
const share = new ShareButton(() => setupOf(app.state, app.drawn));
const pausedNote = h("p", { class: "paused-note", hidden: true, role: "status" }, [h("b", { text: STR.ui.paused }), h("span", { text: STR.ui.pausedHow })]);
overlay.append(dial.el, odo.el, h("div", { class: "drive-dock" }, [input.drawBtn, input.pad]), hint, demoCount, callout, stageHook, pauseBtn, share.el, share.status, pausedNote);

const course = new Course(app, tools, byId("panel"), {
  onMode: (mode) => {
    for (const b of document.querySelectorAll("[data-go]")) {
      const on = /** @type {HTMLElement} */ (b).dataset.go === mode || (mode === "lesson" && /** @type {HTMLElement} */ (b).dataset.go === "home");
      b.classList.toggle("on", on);
      b.setAttribute("aria-current", on ? "page" : "false");
    }
    document.body.dataset.mode = mode;
  },
});
for (const b of document.querySelectorAll("[data-go]")) {
  b.addEventListener("click", () => ((/** @type {HTMLElement} */ (b)).dataset.go === "free" ? course.free() : course.home()));
}

app.onState((st) => {
  tools.sync(st);
  odo.el.hidden = !st.odometer || st.demo === "holdHands";
  input.pad.hidden = !st.controls.includes("drive");
  input.drawBtn.hidden = !st.controls.includes("draw");
  demoCount.hidden = st.demo !== "holdHands";
  dial.el.hidden = st.demo === "holdHands";
  hideCallout();
});
world.holdHands.onLap = () => app.tracker.demoLap();
// Routes are framed beside the HUD: each panel on the view takes its side.
world.hudInsets = () => {
  const r = stage.getBoundingClientRect();
  const ins = { left: 0, right: 0, top: 0, bottom: 0 };
  if (!r.width || !r.height) return ins;
  for (const el of [dial.el, odo.el, input.pad, input.drawBtn]) {
    if (el.hidden || el.offsetParent === null) continue;
    const b = el.getBoundingClientRect();
    if ((b.left + b.right) / 2 < r.left + r.width / 2) ins.left = Math.max(ins.left, (b.right - r.left + 8) / r.width);
    else ins.right = Math.max(ins.right, (r.right - b.left + 8) / r.width);
  }
  return ins;
};

// ---------- pointer: draw a route, or tap a part ----------

/** @type {{x: number, z: number}[] | null} */
let drawing = null;
/** @type {{x: number, y: number, t: number} | null} */
let press = null;
const canvas = world.renderer.domElement;

canvas.addEventListener("pointerdown", (e) => {
  press = { x: e.clientX, y: e.clientY, t: performance.now() };
  stage.classList.add("touched");
  // back to the view: fold the free-driving sheet away (phones)
  if (document.body.dataset.sheet === "open") course.setSheet(false);
  if (!input.drawOn || !e.isPrimary) return;
  const p = world.groundAt(e.clientX, e.clientY);
  if (!p) return;
  canvas.setPointerCapture(e.pointerId);
  app.takeOver();
  drawing = [p];
  world.route.set([toWorld(app.chariot), p]);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = world.groundAt(e.clientX, e.clientY);
  const last = drawing[drawing.length - 1];
  if (p && Math.hypot(p.x - last.x, p.z - last.z) > 0.4 && drawing.length < 600) {
    drawing.push(p);
    world.route.set([toWorld(app.chariot), ...drawing]);
  }
});
const endDraw = () => {
  if (!drawing) return;
  const pts = drawing;
  drawing = null;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  if (len < 4) world.route.clear();
  else app.followRoute(pts);
};
canvas.addEventListener("pointerup", (e) => {
  if (drawing) {
    endDraw();
    return;
  }
  if (press && !input.drawOn && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 8 && performance.now() - press.t < 500) {
    const hit = world.pick(e.clientX, e.clientY);
    if (hit) showCallout(hit);
    else hideCallout();
  }
  press = null;
});
canvas.addEventListener("pointercancel", endDraw);

// ---------- the part callout ----------

/** @type {{node: Object3D, local: Vector3, until: number} | null} */
let pinned = null;

/** @param {NonNullable<ReturnType<World["pick"]>>} hit */
function showCallout(hit) {
  callout.replaceChildren(h("b", { text: hit.title }), hit.detail ? h("span", { text: hit.detail }) : "");
  callout.className = `callout${hit.side ? ` ${hit.side}` : ""}`;
  callout.hidden = false;
  const node = world.holder;
  pinned = { node, local: node.worldToLocal(hit.point.clone()), until: performance.now() + 6000 };
}

function hideCallout() {
  callout.hidden = true;
  pinned = null;
}

function placeCallout() {
  if (!pinned) return;
  if (performance.now() > pinned.until) return hideCallout();
  const p = world.project(pinned.node.localToWorld(pinned.local.clone()));
  if (p.behind) return hideCallout();
  const w = overlay.clientWidth;
  callout.style.left = `${Math.max(8, Math.min(w - callout.offsetWidth - 8, p.x - callout.offsetWidth / 2))}px`;
  callout.style.top = `${Math.max(8, p.y - callout.offsetHeight - 18)}px`;
}

// ---------- frame loop ----------

let last = performance.now();
let hudClock = 0;
function frame(/** @type {number} */ now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  app.tick(dt);
  if (app.paused) {
    // hold everything that moves by itself; the camera still follows a drag
    world.animate(0);
    world.cam.update(dt, world.camFocus());
  } else world.animate(dt);
  hudClock += dt;
  if (hudClock > 1 / 30) {
    hudClock = 0;
    const pose = app.chariot.pose();
    const cam = world.camera.position, tgt = world.controls.target;
    const camBearing = Math.atan2(-(tgt.z - cam.z), tgt.x - cam.x);
    dial.update(pose.figureWorld, pose.heading, pose.errorDeg, camBearing);
    if (!odo.el.hidden) odo.update(pose.distL, pose.distR);
    if (!demoCount.hidden) demoCount.textContent = `里圈走了 ${world.holdHands.steps.in} 步，外圈走了 ${world.holdHands.steps.out} 步`;
    placeCallout();
  }
  world.render();
  requestAnimationFrame(frame);
}

/**
 * A shared link (#s=1&…, js/app/share.js): free driving set up as it was,
 * driving the route that was drawn.
 * @param {import("./app/share.js").ShareSetup} sh
 */
function openShared(sh) {
  const { route, ...setup } = sh;
  course.free(setup);
  if (route) app.driveDrawn(route);
}
window.addEventListener("hashchange", () => {
  const sh = decodeShare(location.hash);
  if (sh) openShared(sh);
});

try {
  const shared = decodeShare(location.hash);
  // load the shared chariot first, not the default one
  if (shared) world.mechanism = shared.mechanism;
  await world.load();
  loading.hidden = true;
  // ?free opens free driving; ?lesson=N&step=K (1-based) opens a lesson step.
  const q = new URLSearchParams(location.search);
  const li = Number(q.get("lesson")) - 1;
  if (shared) openShared(shared);
  else if (q.has("free")) course.free();
  else if (Number.isInteger(li) && li >= 0 && li < LESSONS.length) {
    const k = Math.min(LESSONS[li].steps.length, Math.max(1, Math.trunc(Number(q.get("step")) || 1)));
    course.open(li, k - 1);
  }
  else course.home();
  requestAnimationFrame(frame);
  if (q.has("selftest")) {
    const { selftest } = await import("./app/selftest.js");
    await selftest({ app, course, world, tools, input });
  }
} catch (err) {
  loading.textContent = "车没能搬出来，请刷新页面再试一次。";
  loading.classList.add("error");
  throw err;
}

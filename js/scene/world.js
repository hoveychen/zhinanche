// The 3D view: renderer, lights, courtyard, the two chariot models, tracks,
// the compass ring and the mini demos. It shows a sim Pose; the app decides
// what the pose is (js/app/).

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Rig } from "./rig.js";
import { COLORS, CompassRing } from "./ground.js";
import { Pointer } from "./pointer.js";
import { LANDMARK_DISTANCE, Landmark } from "./landmark.js";
import { Ribbon, RouteLine } from "./trails.js";
import { CompassDemo, HoldHands } from "./demos.js";
import { CameraRig } from "./cameraRig.js";
import { partCaption } from "./parts.js";
import { Ice } from "./ice.js";
import { bind } from "../i18n.js";
import { Look } from "./look.js";
import { HighlightGlow, OUTLINES, setBoxLineSize, updateOutlines } from "./gearviz.js";

/** @import { Pose } from "../sim/chariot.js" */
/** @import { MechanismId } from "../sim/params.js" */
/** @import { PartId, ViewId, DemoId } from "../teach/types.js" */
/** @import { Insets } from "./cameraRig.js" */

/** Parts small enough to be hard to tap: a tap this near one (CSS px) picks it. */
const SMALL_PART = /pinion/;
const PICK_RING = 12;

/** Half the distance between the model's wheels (chi). */
const HALF_TRACK = 3;

/** sim (x, y) → three.js world (x, −y). @param {{x: number, y: number}} p */
export const toWorld = (p) => ({ x: p.x, z: -p.y });
/** @param {{x: number, z: number}} p */
export const toSim = (p) => ({ x: p.x, y: -p.z });

export class World {
  /** @type {Map<MechanismId, Promise<Rig>>} */
  #pending = new Map();
  /** what setLook / setFigureBig last said, for a chariot that arrives later */
  /** @type {{xray: boolean, highlight: PartId[]}} */
  #lookState = { xray: false, highlight: [] };
  #figureBig = true;
  #viewed = false;
  /** the sheet's cover when the chase view last framed for it */
  #coverAt = 0;

  /** @param {HTMLElement} host */
  constructor(host) {
    this.host = host;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    host.appendChild(r.domElement);
    bind(r.domElement, (s) => s.stage.sceneLabel, "aria-label");
    this.renderer = r;
    // Asking the driver whether a program linked waits for it to finish: the
    // first frame drawn with a new program stalls on it (~150 ms for x-ray's
    // wireframe on a laptop, compiled in the background or not). The
    // self-test still checks.
    r.debug.checkShaderErrors = /[?&]selftest\b/.test(location.search);

    const scene = new THREE.Scene();
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
    this.camera.position.set(14, 12, 12);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 220;
    this.controls.screenSpacePanning = false;
    this.cam = new CameraRig(this.camera, this.controls);

    // sky, sun, courtyard, materials, post-processing, quality tiers
    this.look = new Look(this);
    this.sun = this.look.sun;
    // stepping down off post-processing changes every program: what was
    // compiled ahead for the passes (x-ray, the chariot not on show) is
    // compiled again for the screen
    this.look.onDrop = () => {
      void this.#idle()
        .then(() => this.warmXray()).then(() => Promise.all(Object.values(this.rigs)
        .filter((rig) => rig !== this.rig)
        .map((rig) => Promise.all([this.look.precompile(rig.root), this.#xrayPrograms(rig)]))));
    };

    this.ring = new CompassRing();
    scene.add(this.ring.group);
    // the gate stands in the courtyard, which stays put (design/decisions/0018)
    scene.add(new Landmark().group);
    this.trackL = new Ribbon(COLORS.left, 0.32);
    this.trackR = new Ribbon(COLORS.right, 0.32);
    scene.add(this.trackL.mesh, this.trackR.mesh);
    /** a sheet of ice under the chariot while a wheel slips */
    /** the halo round the parts a step names */
    this.glow = new HighlightGlow();
    this.ice = new Ice();
    scene.add(this.ice.mesh);
    this.route = new RouteLine(COLORS.off);
    scene.add(this.route.line);

    this.holdHands = new HoldHands();
    this.compass = new CompassDemo();
    this.holdHands.group.visible = false;
    this.compass.group.visible = false;
    scene.add(this.holdHands.group, this.compass.group);

    this.holder = new THREE.Group();
    this.holder.name = "chariotHolder";
    scene.add(this.holder);
    this.look.attach(this.holder);
    /** @type {Partial<Record<MechanismId, Rig>>} */
    this.rigs = {};
    this.base = "assets/";
    /** a model being fetched shows nothing; the page can say so (err: it failed) */
    /** @type {(on: boolean, err?: unknown) => void} */
    this.onLoading = () => {};
    /** @type {MechanismId} */
    this.mechanism = "differential";
    /** @type {Partial<Record<MechanismId, Pointer>>} */
    this.beams = {};
    this.explode = 0;
    this.explodeTarget = 0;
    /** where the parts are while taken apart (the camera keeps them in the picture) */
    this.partsBox = new THREE.Box3();
    /** @type {DemoId | null} */
    this.demo = null;
    this.trailsOn = true;
    this.time = 0;
    this.focus = { x: 0, z: 0, heading: Math.PI / 2 };
    /** someone is driving: background work waits (set by the page) */
    this.busy = () => false;
    /** the HUD's margins over the view, for framing routes (set by the page) */
    /** @type {(low?: boolean) => Insets} low: only what sits in the lower part of the view */
    this.hudInsets = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
    /** the HUD's margins cleared at the sides, or above and below (framing the parts; set by the page) */
    /** @type {() => Insets[]} */
    this.hudBands = () => [this.hudInsets()];
    this.cam.insets = () => this.hudInsets();
    /** how much of the view, from the bottom, a panel lies over (a phone's sheet; set by the page) */
    this.cover = () => 0;
    /** the picture is moved up this far (CSS px) to sit in what the panel leaves showing */
    this.lift = 0;
    this.cam.bands = () => this.hudBands();
    this.cam.lowInsets = () => this.hudInsets(true);
    this.cam.cover = () => this.cover();

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  /**
   * Load the chariot on show; the other one waits until it is first wanted
   * (setMechanism) or the page is idle (prefetchOther), so the first picture
   * costs one model, not two. Resolves when the first picture is ready to
   * show whole: courtyard built, textures on, every shader compiled.
   * @param {string} [base]
   */
  async load(base = "assets/") {
    this.base = base;
    await Promise.all([
      this.ensure(this.mechanism),
      this.look.warmPasses(),
      this.look.buildYard(),
      this.look.texReady.catch(() => {}),
    ]);
    this.setMechanism(this.mechanism);
    await this.look.warm();
  }

  /**
   * Once the page is up and the browser is idle, load the chariot not on show
   * too (hidden), so the first switch to it shows it at once.
   */
  prefetchOther() {
    /** @type {MechanismId} */
    const other = this.mechanism === "song" ? "differential" : "song";
    // x-ray warmed up first (the chariot on show), then the other chariot:
    // a failure shows when it is picked; compiled now, so showing it doesn't stall
    // each step waits while the chariot is being driven: one costs up to a
    // couple of hundred ms on a slow tablet, a stutter as a child sets off
    const go = () => this.warmXray()
      .then(() => this.#idle())
      .then(() => this.ensure(other))
      .then((rig) => this.#idle().then(() => Promise.all([this.look.precompile(rig.root), this.#xrayPrograms(rig)])), () => {});
    // after the first frames
    setTimeout(() => void this.#idle().then(go), 1500);
  }

  /** Resolves once the browser is idle and no one is driving. @returns {Promise<void>} */
  #idle() {
    return new Promise((ok) => {
      const wait = () => {
        if (this.busy()) setTimeout(wait, 500);
        else if (typeof requestIdleCallback === "function") requestIdleCallback(() => (this.busy() ? wait() : ok()), { timeout: 3000 });
        else ok();
      };
      wait();
    });
  }

  /**
   * Compile what x-ray shows on a chariot without showing it: the outlines,
   * the body's wireframe, its see-through materials and the spin arcs are
   * hidden until then, so the first compile skipped them. The look is put
   * back before anything is drawn (the programs are made when compiling
   * starts; the wait is for them to finish).
   * @param {Rig} rig
   */
  #xrayPrograms(rig) {
    const st = this.#lookState;
    this.#xrayLook(rig, true);
    const done = this.look.compile(rig.root);
    this.#xrayLook(rig, false);
    rig.setLook(st.xray, st.highlight);
    return done;
  }

  /** @param {Rig} rig @param {boolean} on */
  #xrayLook(rig, on) {
    // one part lit, so the lit and the faded outlines are made too
    if (on) rig.setLook(true, rig.mechanism === "song" ? ["smallL"] : ["sideA"]);
    for (const sp of rig.spinners) if (sp.arc) sp.arc.group.visible = on;
  }

  /**
   * Once the page is idle: make the first press on x-ray as smooth as the
   * rest (it stalled ~125 ms compiling and uploading). Its programs are
   * compiled in the background, then one frame is drawn in x-ray and drawn
   * over at once with the real look, in the same task, so only the real one
   * is ever shown; that uploads the outlines and wireframes.
   */
  async warmXray() {
    const rig = this.rig;
    if (!rig || this.#lookState.xray || this.explode > 0) return;
    await this.#xrayPrograms(rig);
    // what x-ray adds, a kind at a time (the first draw of each sets up its
    // pipeline on the GPU, a few ms each): one kind per frame, not one long stall
    /** @type {((o: THREE.Object3D) => boolean)[]} */
    const kinds = [
      () => false, // the gears and wheels in x-ray colours
      (o) => o.name.endsWith(".ghost"),
      (o) => o instanceof THREE.Mesh && o.material === OUTLINES.ink,
      (o) => o instanceof THREE.Mesh && o.material === OUTLINES.faded,
      (o) => o.name === "spinArc",
    ];
    const extras = [
      ...rig.hulls.map((h) => h.hull),
      ...rig.looks.flatMap((l) => (l.lines ? [l.lines] : [])),
      ...rig.spinners.flatMap((sp) => (sp.arc ? [sp.arc.group] : [])),
    ];
    for (const kind of kinds) {
      while (this.busy()) await new Promise((ok) => setTimeout(ok, 500));
      await new Promise((ok) => requestAnimationFrame(ok));
      if (this.rig !== rig || this.#lookState.xray || this.explode > 0) return;
      const st = this.#lookState;
      this.#xrayLook(rig, true);
      for (const o of extras) if (!kind(o)) o.visible = false;
      this.render();
      this.#xrayLook(rig, false);
      rig.setLook(st.xray, st.highlight);
      this.render();
    }
    // the highlight's halo: its programs (drawn with nothing in it), then
    // (not holding up what comes next) the shapes of the gears and wheels
    this.glow.warm(this.renderer, this.camera);
    void this.#hulls(rig);
  }

  /** The shapes the halo is drawn round, a few at a time while idle (a wheel's takes a few ms). @param {Rig} rig */
  async #hulls(rig) {
    const round = rig.turnedMeshes();
    for (let i = 0; i < round.length; i++) {
      if (i % 4 === 0) await this.#idle();
      this.glow.proxy(round[i], true);
    }
  }

  /** Load a chariot model (once). @param {MechanismId} m @returns {Promise<Rig>} */
  ensure(m) {
    const have = this.rigs[m];
    if (have) return Promise.resolve(have);
    let p = this.#pending.get(m);
    if (!p) {
      p = this.#loadRig(m);
      this.#pending.set(m, p);
      p.catch(() => this.#pending.delete(m));
    }
    return p;
  }

  /** @param {MechanismId} m */
  async #loadRig(m) {
    const gltf = await new GLTFLoader().loadAsync(`${this.base}chariot-${m}.glb`);
    await this.look.dress(gltf.scene);
    const rig = new Rig(gltf.scene);
    if (rig.mechanism !== m) throw new Error(`chariot-${m}.glb holds the ${rig.mechanism} chariot`);
    const fig = rig.node("figure");
    if (fig) {
      const beam = new Pointer(rig.armTip);
      fig.add(beam.mesh);
      this.beams[m] = beam;
    }
    gltf.scene.visible = false;
    this.holder.add(gltf.scene);
    // catch up with what the other chariot has been told
    rig.setLook(this.#lookState.xray, this.#lookState.highlight);
    rig.setFigureBig(this.#figureBig, true);
    this.rigs[m] = rig;
    return rig;
  }

  /** The chariot on show, or undefined while its model is still coming. */
  get rig() {
    return this.rigs[this.mechanism];
  }

  /** @param {MechanismId} m */
  setMechanism(m) {
    this.mechanism = m;
    for (const [k, rig] of Object.entries(this.rigs)) {
      /** @type {THREE.Object3D} */ (rig.root.parent).visible = k === m;
    }
    const rig = this.rig;
    if (rig) {
      rig.setExplode(this.explode);
      return;
    }
    // first time this chariot is wanted: show nothing until it has arrived
    this.onLoading(true);
    this.ensure(m).then(() => {
      if (this.mechanism === m) this.setMechanism(m);
      this.onLoading(false);
    }, (err) => {
      this.onLoading(false, err);
    });
  }

  /**
   * @param {boolean} xray
   * @param {PartId[]} highlight
   */
  setLook(xray, highlight) {
    const was = this.#lookState.xray;
    this.#lookState = { xray, highlight };
    for (const rig of Object.values(this.rigs)) rig.setLook(xray, highlight);
    // the gears view frames the whole cart until it can be seen through
    if (xray !== was && this.cam.view === "gears" && this.#viewed) this.cam.setView("gears", this.camFocus());
  }

  /** Big figure for wide views (every chariot). @param {boolean} big @param {boolean} [instant] */
  setFigureBig(big, instant = false) {
    this.#figureBig = big;
    for (const r of Object.values(this.rigs)) r.setFigureBig(big, instant);
  }

  /** @param {number} v 0..1 @param {boolean} [instant] */
  setExplode(v, instant = false) {
    this.cam.setApart(v > 0);
    // closing up: glide back to the view's own framing
    if (v === 0 && this.explodeTarget > 0 && !instant) this.cam.setView(this.cam.view, this.camFocus());
    this.explodeTarget = v;
    if (instant) {
      this.explode = v;
      this.rig?.setExplode(v);
    }
  }

  /** @param {DemoId | null} d */
  setDemo(d) {
    this.demo = d;
    this.holdHands.group.visible = d === "holdHands";
    this.compass.group.visible = d === "compass";
    this.holder.visible = d !== "holdHands";
    this.ring.group.visible = d !== "holdHands";
    if (d === "holdHands") {
      this.holdHands.reset();
      this.holdHands.group.position.set(this.focus.x, 0, this.focus.z);
    }
    this.trackL.mesh.visible = this.trackR.mesh.visible = this.trailsOn && d !== "holdHands";
  }

  /** Ice on the ground: a wheel slips. @param {boolean} on */
  setIce(on) {
    this.ice.set(on);
  }

  /** @param {boolean} on */
  setTrails(on) {
    this.trailsOn = on;
    this.trackL.mesh.visible = this.trackR.mesh.visible = on && this.demo !== "holdHands";
  }

  clearTrails() {
    this.trackL.clear();
    this.trackR.clear();
  }

  /**
   * Show the chariot at a pose.
   * @param {Pose} pose
   * @param {number} dt seconds since the last frame (0 = jump)
   */
  showPose(pose, dt) {
    const w = toWorld(pose);
    this.holder.position.set(w.x, 0, w.z);
    this.holder.rotation.y = pose.heading;
    this.focus = { x: w.x, z: w.z, heading: pose.heading };
    this.rig?.apply(pose, dt);
    this.ring.update(w.x, w.z, pose.figureWorld, pose.errorDeg);
    // the beam reaches about as far as the gate's plaque, however near it is
    this.beams[this.mechanism]?.update(pose.errorDeg, LANDMARK_DISTANCE - w.z - 8);
    // Wheel contact points: left is −Z in the chariot frame.
    const c = Math.cos(pose.heading), s = Math.sin(pose.heading);
    const dx = c, dz = -s;
    this.trackL.add(w.x - s * HALF_TRACK, w.z - c * HALF_TRACK, dx, dz);
    this.trackR.add(w.x + s * HALF_TRACK, w.z + c * HALF_TRACK, dx, dz);
    this.look.follow(w.x, w.z);
  }

  /** The focus the camera presets need. */
  camFocus() {
    const fig = this.rigs[this.mechanism]?.node("figure");
    return { ...this.focus, mechanism: this.mechanism, figureX: fig ? fig.position.x : 0, inside: this.#lookState.xray || this.explodeTarget > 0 };
  }

  /** @param {ViewId} v @param {boolean} [instant] */
  setView(v, instant = false) {
    this.cam.extraRadius = this.demo === "holdHands" ? this.holdHands.radius : this.demo === "compass" ? 14 : 0;
    // the first view is where the first picture is taken: no glide in from
    // the constructor's placeholder spot
    this.cam.setView(v, this.camFocus(), instant || !this.#viewed);
    this.#viewed = true;
  }

  /**
   * Top view framing a route (sim points).
   * @param {{x: number, y: number}[]} pts
   */
  frameRoute(pts) {
    this.cam.frameTop(pts.map(toWorld), this.camFocus(), this.hudInsets());
  }

  /**
   * Per-frame animation that does not depend on the sim.
   * @param {number} dt
   */
  animate(dt) {
    this.time += dt;
    this.look.update(dt);
    if (this.explode !== this.explodeTarget) {
      // a press on 合上/拆开 plays the whole sequence (about 1.4 s); dragging
      // the slider follows the finger closely
      const gap = this.explodeTarget - this.explode;
      const step = dt * Math.max(0.7, Math.abs(gap) * 5);
      this.explode += Math.sign(gap) * Math.min(Math.abs(gap), step);
      this.rig?.setExplode(this.explode);
      this.cam.reframe = this.explode > 0.001 ? 0.9 : 0;
    }
    const rig = this.rig;
    if (this.cam.reframe > 0 && rig) {
      this.cam.parts = rig.bounds(this.partsBox, this.cam.gearsOnly);
      this.cam.partsInset = this.#partsBands();
    }
    this.ice.update(dt, this.focus);
    rig?.pulse(this.time);
    if (this.demo === "holdHands") this.holdHands.update(dt);
    if (this.demo === "compass") this.compass.update(this.focus.x, this.focus.z, dt);
    this.ring.fadeLabels(!(this.cam.view === "gears" || this.cam.view === "works" || this.cam.view === "pair" || this.cam.view === "diff"), dt);
    this.cam.update(dt, this.camFocus());
    // a sheet pulled up or put away: the chase view frames afresh for what shows
    const c = this.cover();
    if (Math.abs(c - this.#coverAt) > 0.05) {
      this.#coverAt = c;
      if (this.cam.view === "follow" && this.cam.atPreset && !this.cam.glide) this.cam.setView("follow", this.camFocus());
    }
    this.#liftOver(dt);
  }

  /**
   * Where the parts may go: the HUD's bands, and with a sheet pulled up over
   * the view, only what it leaves showing (the picture is moved up to the
   * middle of that, #liftOver).
   * @returns {Insets[]}
   */
  #partsBands() {
    const bands = this.hudBands(), c = this.cover();
    if (c <= 0.05) return bands;
    const k = Math.min(c, 0.7) / 2;
    return bands.map((b) => ({ left: b.left, right: b.right, top: b.top + k, bottom: c - k + Math.max(0, b.bottom - c) }));
  }

  /**
   * A sheet pulled up over the view (free driving on a phone) would hide the
   * chariot, which every view puts in the middle: move the picture up so its
   * middle is the middle of what still shows. Picking and drawing follow, as
   * they go through the same projection.
   * @param {number} dt
   */
  #liftOver(dt) {
    const h = this.host.clientHeight, w = this.host.clientWidth;
    const c = this.cover();
    const want = c > 0.05 ? (Math.min(c, 0.7) * h) / 2 : 0;
    const a = dt > 0 ? 1 - Math.exp(-dt * 6) : 1;
    this.lift += (want - this.lift) * a;
    if (Math.abs(want - this.lift) < 0.5) this.lift = want;
    if (this.lift > 0.5) this.camera.setViewOffset(w, h, 0, this.lift, w, h);
    else if (this.camera.view) this.camera.clearViewOffset();
  }

  render() {
    updateOutlines(this.renderer);
    // looking at the works is a diagram: every gear sharp, near or far
    if (this.look.postfx) this.look.postfx.dofOn = !this.rig?.inside;
    this.rig?.fadeBoxLines(this.camera);
    this.look.render();
    // the highlighted parts' halo, over the finished picture
    const lit = this.rig?.glowParts();
    if (lit?.length) this.glow.render(this.renderer, this.camera, lit, this.time);
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.cam.short = h < 600;
    // OrbitControls turns 2π × rotateSpeed per view height dragged: about a
    // quarter turn for 300 px, slow enough for a child to stop where they mean to
    this.controls.rotateSpeed = THREE.MathUtils.clamp(h / 1200, 0.25, 1);
    // a view placed before the layout settled was framed for the old shape
    if (this.#viewed && this.cam.atPreset && !this.cam.glide) this.cam.setView(this.cam.view, this.camFocus(), true);
    this.route.resize(w, h);
    setBoxLineSize(w, h);
    this.look?.resize(w, h);
  }

  /** @param {number} clientX @param {number} clientY */
  #ray(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }

  /**
   * Point on the ground under the pointer (world), or null.
   * @param {number} clientX @param {number} clientY
   */
  groundAt(clientX, clientY) {
    const p = new THREE.Vector3();
    return this.#ray(clientX, clientY).ray.intersectPlane(this.groundPlane, p) ? { x: p.x, z: p.z } : null;
  }

  /**
   * The chariot part under the pointer, with its caption.
   * @param {number} clientX @param {number} clientY
   * @returns {{title: string, detail: string, point: THREE.Vector3, side: "l" | "r" | null} | null}
   */
  pick(clientX, clientY) {
    const rig = this.rig;
    if (!this.holder.visible || !rig) return null;
    let hit = rig.pick(this.#ray(clientX, clientY));
    // Looking inside, a finger is wider than the differential's small gears,
    // and from behind and above the top flat gear's teeth stand in front of
    // most of them: look round the point as well (a ring of PICK_RING CSS
    // px). A small gear there wins; a tap between parts takes what is round it.
    if (rig.inside && !SMALL_PART.test(String(hit?.node.userData.name ?? ""))) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const near = rig.pick(this.#ray(clientX + Math.cos(a) * PICK_RING, clientY + Math.sin(a) * PICK_RING));
        if (!near) continue;
        if (SMALL_PART.test(String(near.node.userData.name ?? ""))) {
          hit = near;
          break;
        }
        hit ??= near;
      }
    }
    if (!hit) return null;
    const cap = partCaption(hit.node.userData);
    const name = String(hit.node.userData.name ?? "");
    const side = /\.L$|sideA/.test(name) ? "l" : /\.R$|sideB/.test(name) ? "r" : null;
    return { ...cap, point: hit.point, side };
  }

  /** World point → CSS pixels within the host. @param {THREE.Vector3} p */
  project(p) {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * this.host.clientWidth, y: ((1 - v.y) / 2) * this.host.clientHeight, behind: v.z > 1 };
  }
}

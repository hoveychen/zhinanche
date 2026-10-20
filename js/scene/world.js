// The 3D view: renderer, lights, courtyard, the two chariot models, tracks,
// the compass ring and the mini demos. It shows a sim Pose; the app decides
// what the pose is (js/app/).

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Rig } from "./rig.js";
import { COLORS, CompassRing } from "./ground.js";
import { Pointer } from "./pointer.js";
import { Landmark } from "./landmark.js";
import { Ribbon, RouteLine } from "./trails.js";
import { CompassDemo, HoldHands } from "./demos.js";
import { CameraRig } from "./cameraRig.js";
import { partCaption } from "./parts.js";
import { bind } from "../i18n.js";
import { Look } from "./look.js";
import { updateOutlines } from "./gearviz.js";

/** @import { Pose } from "../sim/chariot.js" */
/** @import { MechanismId } from "../sim/params.js" */
/** @import { PartId, ViewId, DemoId } from "../teach/types.js" */
/** @import { Insets } from "./cameraRig.js" */

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

  /** @param {HTMLElement} host */
  constructor(host) {
    this.host = host;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    host.appendChild(r.domElement);
    bind(r.domElement, (s) => s.stage.sceneLabel, "aria-label");
    this.renderer = r;

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

    this.ring = new CompassRing();
    scene.add(this.ring.group);
    this.ring.group.add(new Landmark().group);
    this.trackL = new Ribbon(COLORS.left, 0.32);
    this.trackR = new Ribbon(COLORS.right, 0.32);
    scene.add(this.trackL.mesh, this.trackR.mesh);
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
    /** the HUD's margins over the view, for framing routes (set by the page) */
    /** @type {() => Insets} */
    this.hudInsets = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
    /** the HUD's margins cleared at the sides, or above and below (framing the parts; set by the page) */
    /** @type {() => Insets[]} */
    this.hudBands = () => [this.hudInsets()];
    this.cam.insets = () => this.hudInsets();

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
    // a failure shows when it is picked; compiled now, so showing it doesn't stall
    const go = () => this.ensure(other).then((rig) => this.look.precompile(rig.root), () => {});
    // after the first frames
    setTimeout(() => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: 3000 });
      else go();
    }, 1500);
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
    this.beams[this.mechanism]?.update(pose.errorDeg);
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
      this.cam.parts = rig.bounds(this.partsBox, this.cam.view === "gears");
      this.cam.partsInset = this.hudBands();
    }
    rig?.pulse(this.time);
    if (this.demo === "holdHands") this.holdHands.update(dt);
    if (this.demo === "compass") this.compass.update(this.focus.x, this.focus.z, dt);
    this.ring.fadeLabels(!(this.cam.view === "gears" || this.cam.view === "works"), dt);
    this.cam.update(dt, this.camFocus());
  }

  render() {
    updateOutlines(this.renderer, this.time);
    // looking at the works is a diagram: every gear sharp, near or far
    if (this.look.postfx) this.look.postfx.dofOn = !this.rig?.inside;
    this.look.render();
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // OrbitControls turns 2π × rotateSpeed per view height dragged: about a
    // quarter turn for 300 px, slow enough for a child to stop where they mean to
    this.controls.rotateSpeed = THREE.MathUtils.clamp(h / 1200, 0.25, 1);
    // a view placed before the layout settled was framed for the old shape
    if (this.#viewed && this.cam.atPreset && !this.cam.glide) this.cam.setView(this.cam.view, this.camFocus(), true);
    this.route.resize(w, h);
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
    if (!this.holder.visible || !this.rig) return null;
    const hit = this.rig.pick(this.#ray(clientX, clientY));
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

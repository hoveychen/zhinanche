// Camera presets (ViewId in js/teach/types.js) that follow the chariot while
// the child is still free to orbit. Switching view glides there.

import * as THREE from "three";

/** @import { ViewId } from "../teach/types.js" */
/** @import { OrbitControls } from "three/addons/controls/OrbitControls.js" */

/**
 * @typedef {object} Focus where the chariot is
 * @property {number} x three.js world x
 * @property {number} z
 * @property {number} heading sim heading (rad)
 * @property {"differential" | "song"} mechanism
 * @property {number} figureX figure shaft's local x (chi)
 */

const GLIDE = 0.8;

export class CameraRig {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {OrbitControls} controls
   */
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    /** @type {ViewId} */
    this.view = "overview";
    /** @type {{fromPos: THREE.Vector3, fromTarget: THREE.Vector3, t: number} | null} */
    this.glide = null;
    /** fixed framing for the top view (route playback), else null */
    /** @type {{cx: number, cz: number, h: number} | null} */
    this.box = null;
    this.last = { x: 0, z: 0, heading: Math.PI / 2 };
    this.extraRadius = 0;
  }

  /** Distance at which a sphere of radius r fills the view. @param {number} r */
  fit(r) {
    const v = THREE.MathUtils.degToRad(this.camera.fov);
    const h = 2 * Math.atan(Math.tan(v / 2) * this.camera.aspect);
    return r / Math.sin(Math.min(v, h) / 2);
  }

  /**
   * The preset's camera position and target for a chariot at `f`.
   * @param {ViewId} view
   * @param {Focus} f
   * @returns {{pos: THREE.Vector3, target: THREE.Vector3}}
   */
  desired(view, f) {
    const local = (/** @type {number} */ lx, /** @type {number} */ ly, /** @type {number} */ lz) => {
      // chariot local (+X forward, +Y up, +Z right) → world
      const c = Math.cos(f.heading), s = Math.sin(f.heading);
      return new THREE.Vector3(f.x + lx * c + lz * s, ly, f.z - lx * s + lz * c);
    };
    const dirLocal = (/** @type {number} */ lx, /** @type {number} */ ly, /** @type {number} */ lz) => {
      const c = Math.cos(f.heading), s = Math.sin(f.heading);
      return new THREE.Vector3(lx * c + lz * s, ly, -lx * s + lz * c).normalize();
    };
    switch (view) {
      case "top": {
        if (this.box) {
          return { target: new THREE.Vector3(this.box.cx, 0, this.box.cz), pos: new THREE.Vector3(this.box.cx, this.box.h, this.box.cz + 0.01) };
        }
        if (this.extraRadius) {
          // A demo on the ground: frame just the demo, tipped a little (north
          // still up) so the walkers read as people, not dots.
          const d = this.fit(this.extraRadius), tip = THREE.MathUtils.degToRad(28);
          return { target: new THREE.Vector3(f.x, 0, f.z), pos: new THREE.Vector3(f.x, d * Math.cos(tip), f.z + d * Math.sin(tip)) };
        }
        const h = this.fit(16);
        return { target: new THREE.Vector3(f.x, 0, f.z), pos: new THREE.Vector3(f.x, h, f.z + 0.01) };
      }
      case "follow": {
        const target = local(2, 5, 0);
        return { target, pos: target.clone().addScaledVector(dirLocal(-1, 0.62, 0.42), this.fit(11)) };
      }
      case "gears": {
        // From the front and above: the wheels stand at the sides (local ±Z,
        // radius 3) and would hide the gears from any side-on angle; the front
        // board goes see-through with x-ray.
        const song = f.mechanism === "song";
        const target = song ? local(1.1, 4.1, 0) : local(0, 2.2, -0.6);
        const r = song ? 3.9 : 3.3;
        return { target, pos: target.clone().addScaledVector(dirLocal(1, 0.72, 0.28), this.fit(r)) };
      }
      case "wheels": {
        const target = local(0, 2.8, 0);
        return { target, pos: target.clone().addScaledVector(dirLocal(-1, 0.32, 0.3), this.fit(5.5)) };
      }
      case "figure": {
        const target = local(f.figureX, 12.3, 0);
        return { target, pos: target.clone().addScaledVector(dirLocal(0.4, 0.35, 1), this.fit(2.2)) };
      }
      case "overview":
      default: {
        const target = new THREE.Vector3(f.x, 5.8, f.z);
        return { target, pos: target.clone().addScaledVector(new THREE.Vector3(0.8, 0.5, 0.62).normalize(), this.fit(Math.max(11.5, this.extraRadius))) };
      }
    }
  }

  /**
   * Glide to a preset (or jump with `instant`).
   * @param {ViewId} view
   * @param {Focus} f
   * @param {boolean} [instant]
   */
  setView(view, f, instant = false) {
    this.view = view;
    if (view !== "top") this.box = null;
    this.last = { x: f.x, z: f.z, heading: f.heading };
    if (instant) {
      const d = this.desired(view, f);
      this.camera.position.copy(d.pos);
      this.controls.target.copy(d.target);
      this.glide = null;
    } else {
      this.glide = { fromPos: this.camera.position.clone(), fromTarget: this.controls.target.clone(), t: 0 };
    }
    this.controls.update();
  }

  /**
   * Frame a region of the ground from above (route playback in the top view).
   * @param {{x: number, z: number}[]} pts world points
   * @param {Focus} f
   */
  frameTop(pts, f) {
    let x0 = f.x, x1 = f.x, z0 = f.z, z1 = f.z;
    for (const p of pts) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    const pad = 13; // room for the HUD (dial, odometer, drive pad) round the edges
    const ex = (x1 - x0) / 2 + pad, ez = (z1 - z0) / 2 + pad;
    const v = THREE.MathUtils.degToRad(this.camera.fov);
    const tv = Math.tan(v / 2), th = tv * this.camera.aspect;
    const h = Math.max(ez / tv, ex / th, this.fit(14));
    this.box = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, h };
    this.setView("top", f);
  }

  /** Back to following the chariot in the top view. */
  unframe() {
    this.box = null;
  }

  /**
   * Follow the chariot and finish any glide.
   * @param {number} dt
   * @param {Focus} f
   */
  update(dt, f) {
    const cam = this.camera, ctl = this.controls;
    if (this.glide) {
      const g = this.glide;
      g.t = Math.min(1, g.t + dt / GLIDE);
      const k = g.t * g.t * (3 - 2 * g.t);
      const d = this.desired(this.view, f);
      cam.position.lerpVectors(g.fromPos, d.pos, k);
      ctl.target.lerpVectors(g.fromTarget, d.target, k);
      if (g.t >= 1) this.glide = null;
    } else if (!(this.view === "top" && this.box)) {
      let dx = f.x - this.last.x, dz = f.z - this.last.z;
      if (this.view === "top") {
        // Keep the drawing still; only pan when the chariot nears the edge.
        const h = cam.position.y;
        const v = THREE.MathUtils.degToRad(cam.fov);
        const ez = h * Math.tan(v / 2), ex = ez * cam.aspect;
        const ox = f.x - ctl.target.x, oz = f.z - ctl.target.z;
        dx = Math.abs(ox) > ex * 0.45 ? ox - Math.sign(ox) * ex * 0.45 : 0;
        dz = Math.abs(oz) > ez * 0.45 ? oz - Math.sign(oz) * ez * 0.45 : 0;
      }
      cam.position.x += dx; cam.position.z += dz;
      ctl.target.x += dx; ctl.target.z += dz;
      if (this.view === "follow" || this.view === "gears" || this.view === "wheels" || this.view === "figure") {
        // Swing round with the chariot.
        const dh = Math.atan2(Math.sin(f.heading - this.last.heading), Math.cos(f.heading - this.last.heading));
        if (dh !== 0) {
          // rotate camera and target together about the chariot's vertical axis
          const up = new THREE.Vector3(0, 1, 0), c = new THREE.Vector3(f.x, 0, f.z);
          cam.position.sub(c).applyAxisAngle(up, dh).add(c);
          ctl.target.sub(c).applyAxisAngle(up, dh).add(c);
        }
      }
    }
    this.last = { x: f.x, z: f.z, heading: f.heading };
    ctl.update(dt);
  }
}

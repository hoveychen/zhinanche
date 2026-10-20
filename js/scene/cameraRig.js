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
 * @property {boolean} [inside] looking at the works (x-ray on, or taken apart)
 */

/**
 * @typedef {object} Insets parts of the view covered by the HUD, as fractions of its size
 * @property {number} left
 * @property {number} right
 * @property {number} top
 * @property {number} bottom
 */

const GLIDE = 0.8;

/**
 * The follow view looks along a fixed bearing in the world: from the north
 * and a little west, south past the chariot at the gate (js/scene/landmark.js).
 */
const CHASE_DIR = new THREE.Vector3(-0.2, 0.125, -1).normalize();

/**
 * Where the camera may go, relative to the chariot (the courtyard rides along
 * with it, js/scene/look.js): inside the corridor columns (x ±63.5), short of
 * the lions and the south gate (z 92, 105) and the pines and cauldrons in
 * the north (z −108). A drag that would take it further brings it in closer
 * along the line of sight instead of through a wall.
 */
const ROOM = { x: 56, north: -100, south: 84 };

/** The chariot's bulk (centre height, radius): the wide views keep out of it. */
const BULK = { y: 5, r: 9 };

/** Views close in on the works on purpose: they may look from inside the body. */
const CLOSE = new Set(["gears", "works", "wheels", "figure"]);

/** Views that swing round with the chariot. */
const TURNING = new Set(["gears", "works", "wheels", "figure"]);

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
    /** seconds left to keep the taken-apart parts framed (set while they move) */
    this.reframe = 0;
    /** @type {THREE.Box3 | null} round the parts, world space */
    this.parts = null;
    /** @type {Insets[]} ways to keep clear of the HUD when framing the parts (the one that shows them biggest wins) */
    this.partsInset = [{ left: 0, right: 0, top: 0, bottom: 0 }];
    /** which of them was used last (kept unless another is clearly better: no flip-flopping) */
    this.partsPick = 0;
    /** the view is under 600 CSS px tall (set by the world) */
    this.short = false;
    /** the HUD's margins over the view (set by the world) */
    /** @type {() => Insets} */
    this.insets = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
    /** how far from the target the camera wanted to be when last kept in the room (0: it wasn't) */
    this.wantDist = 0;
    /** the camera is where its view put it (nobody has dragged it since) */
    this.atPreset = false;
    controls.addEventListener("start", () => {
      this.atPreset = false;
    });
  }

  /**
   * Keep the camera in the courtyard and out of the chariot, moving it along
   * its line of sight (the view keeps its direction). Remembers how far it
   * wanted to be, so it eases back out once the way is clear.
   * @param {Focus} f
   */
  #keepIn(f) {
    const cam = this.camera.position, tgt = this.controls.target;
    const off = cam.clone().sub(tgt);
    const want = off.length();
    // the room: shrink the offset until the camera is inside
    let t = 1;
    const lim = (/** @type {number} */ o, /** @type {number} */ base, /** @type {number} */ lo, /** @type {number} */ hi) => {
      const p = base + o;
      if (p > hi && o > 0) t = Math.min(t, (hi - base) / o);
      if (p < lo && o < 0) t = Math.min(t, (lo - base) / o);
    };
    lim(off.x, tgt.x - f.x, -ROOM.x, ROOM.x);
    lim(off.z, tgt.z - f.z, ROOM.north, ROOM.south);
    t = Math.max(0, t);
    off.multiplyScalar(t);
    if (!CLOSE.has(this.view)) {
      // out of the chariot: if inside its sphere, go on along the line of
      // sight to the far side of it, or back toward the target if nearer
      const c = new THREE.Vector3(f.x, BULK.y, f.z).sub(tgt);
      const d = off.clone();
      const len = d.length();
      if (len > 1e-6) {
        d.divideScalar(len);
        const b = d.dot(c), cc = c.lengthSq() - BULK.r * BULK.r;
        const disc = b * b - cc;
        if (disc > 0) {
          const s0 = b - Math.sqrt(disc), s1 = b + Math.sqrt(disc);
          if (len > s0 && len < s1) off.copy(d).multiplyScalar(s0 > 0.5 ? s0 : s1);
        }
      }
    }
    const got = off.length();
    if (Math.abs(got - want) < 1e-4) return;
    cam.copy(tgt).add(off);
    // brought in by a wall: ease back out later; pushed out of the chariot:
    // that is simply where it is now (zooming out again starts from there)
    this.wantDist = got < want ? want : 0;
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
        // A chase camera that does not turn with the chariot: the chariot
        // turns on screen while the figure's hand keeps pointing at the gate.
        const target = new THREE.Vector3(f.x + 1, 7.5, f.z + 3.5);
        // Phones held upright (polish-mobile): fit() goes by the narrow width
        // there and leaves the chariot small, so come in closer.
        // A short stage (a tablet held upright, the lesson panel below it)
        // leaves it small too.
        const r = this.camera.aspect < 0.8 ? 15.5 : this.short ? 16 : 19;
        return { target, pos: target.clone().addScaledVector(CHASE_DIR, this.fit(r)) };
      }
      case "gears": {
        const song = f.mechanism === "song";
        if (!f.inside) {
          // Not seeing through the body yet: the whole cart from behind and
          // above (sunlit side, figure in the picture); x-ray glides in close.
          const target = local(song ? 0.6 : 0.2, 5.6, 0);
          return { target, pos: target.clone().addScaledVector(dirLocal(-1, 0.85, 1.05), this.fit(9.5)) };
        }
        // From behind and above, so the left wheel is on the left of the
        // screen: the wheels stand at the sides (local ±Z, radius 3) and would
        // hide the gears from any side-on angle. Close on the gears, which
        // fill the view (the figure is up its shaft, out of the picture: the
        // dial shows where it points); a little to the right so the big left
        // crown wheel shows its face. The boards go see-through with x-ray.
        const target = song ? local(1.1, 3.7, 0) : local(0.2, 2.5, -0.5);
        const r = song ? 4.9 : 4.4;
        return { target, pos: target.clone().addScaledVector(dirLocal(-1, 1.35, 0.75), this.fit(r)) };
      }
      case "works": {
        // The gears and, up the shaft, the figure standing on them: the
        // carrier and the man can be seen turning together. Higher and
        // further back than the gears view, from the same side.
        const target = local(f.figureX * 0.5 + 0.1, 6.2, -0.3);
        return { target, pos: target.clone().addScaledVector(dirLocal(-1, 1.15, 0.8), this.fit(6.6)) };
      }
      case "above": {
        // Close over the chariot, north up, tipped so the figure reads as a
        // figure; set in the part of the view the HUD leaves free.
        const ins = this.insets();
        const r = 11.5, tip = THREE.MathUtils.degToRad(32);
        const ux = Math.max(0.4, 1 - ins.left - ins.right), uy = Math.max(0.4, 1 - ins.top - ins.bottom);
        const v = THREE.MathUtils.degToRad(this.camera.fov);
        const tv = Math.tan(v / 2), th = tv * this.camera.aspect;
        const d = r / Math.min(ux * th, uy * tv);
        const target = new THREE.Vector3(f.x - (ins.left - ins.right) * d * th, 0, f.z - (ins.top - ins.bottom) * d * tv);
        return { target, pos: target.clone().add(new THREE.Vector3(0, d * Math.cos(tip), d * Math.sin(tip))) };
      }
      case "wheels": {
        const target = local(0, 2.8, 0);
        return { target, pos: target.clone().addScaledVector(dirLocal(-1, 0.32, 0.3), this.fit(5.5)) };
      }
      case "figure": {
        // the figure is drawn big here (js/scene/rig.js FIGURE_SCALE)
        const target = local(f.figureX, 13.4, 0);
        return { target, pos: target.clone().addScaledVector(dirLocal(0.4, 0.35, 1), this.fit(4.2)) };
      }
      case "overview":
      default: {
        const target = new THREE.Vector3(f.x, 3.4, f.z + 4.6);
        return { target, pos: target.clone().addScaledVector(new THREE.Vector3(0.66, 0.62, 0.78).normalize(), this.fit(Math.max(13.5, this.extraRadius))) };
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
    this.atPreset = true;
    // zooming in stops short of the chariot, except in the views that look inside it
    this.controls.minDistance = CLOSE.has(view) ? 2 : 16;
    this.wantDist = 0;
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
   * Frame a region of the ground from above (route playback in the top view),
   * in the part of the view the HUD leaves free.
   * @param {{x: number, z: number}[]} pts world points
   * @param {Focus} f
   * @param {Insets} [inset] HUD margins as fractions of the view
   */
  frameTop(pts, f, inset = { left: 0, right: 0, top: 0, bottom: 0 }) {
    let x0 = f.x, x1 = f.x, z0 = f.z, z1 = f.z;
    for (const p of pts) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    const pad = 9; // the compass ring (radius 8.2) round the chariot at every path point
    x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
    const ux = Math.max(0.3, 1 - inset.left - inset.right), uz = Math.max(0.3, 1 - inset.top - inset.bottom);
    const v = THREE.MathUtils.degToRad(this.camera.fov);
    const tv = Math.tan(v / 2), th = tv * this.camera.aspect;
    const h = Math.max((z1 - z0) / (2 * uz * tv), (x1 - x0) / (2 * ux * th), this.fit(14));
    // shift so the region sits in the middle of the free part
    const ex = h * th, ez = h * tv;
    this.box = { cx: (x0 + x1) / 2 - (inset.left - inset.right) * ex, cz: (z0 + z1) / 2 - (inset.top - inset.bottom) * ez, h };
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
    // put back the distance taken off last frame, so the camera eases out
    // again once the way is clear (a glide or a jump places it afresh)
    if (this.wantDist && !this.glide) {
      const off = cam.position.clone().sub(ctl.target);
      cam.position.copy(ctl.target).addScaledVector(off.normalize(), this.wantDist);
    }
    this.wantDist = 0;
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
      if (TURNING.has(this.view)) {
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
    if (this.reframe > 0 && this.parts && !this.glide && this.view !== "top") this.#frameParts(dt, this.parts, this.partsInset);
    this.reframe = Math.max(0, this.reframe - dt);
    this.last = { x: f.x, z: f.z, heading: f.heading };
    ctl.update(dt);
    this.#keepIn(f);
  }

  /**
   * While the chariot comes apart, keep every part in the picture: same
   * direction of view (the child may have turned it), centre and distance
   * eased so the box round the parts just fits in the part of the view the
   * HUD leaves free. The HUD can be cleared beside it (a column free in the
   * middle) or above and below it (a band free across the view); whichever
   * shows the parts bigger is used.
   * @param {number} dt @param {THREE.Box3} box @param {Insets[]} insets
   */
  #frameParts(dt, box, insets) {
    const cam = this.camera, ctl = this.controls;
    const a = 1 - Math.exp(-dt * 5);
    const off = cam.position.clone().sub(ctl.target);
    const dist = off.length();
    off.divideScalar(dist);
    const centre = box.getCenter(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(cam.up, off).normalize();
    const up = new THREE.Vector3().crossVectors(off, right);
    const tv0 = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), th0 = tv0 * cam.aspect;
    const fits = insets.map((inset) => {
      const ux = Math.max(0.3, 1 - inset.left - inset.right), uy = Math.max(0.3, 1 - inset.top - inset.bottom);
      const th = th0 * ux, tv = tv0 * uy;
      let want = 0;
      const c = new THREE.Vector3();
      for (let i = 0; i < 8; i++) {
        c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(centre);
        const z = c.dot(off);
        want = Math.max(want, z + Math.abs(c.dot(right)) / th, z + Math.abs(c.dot(up)) / tv);
      }
      return want * 1.06;
    });
    let k = Math.min(this.partsPick, fits.length - 1);
    fits.forEach((w, i) => {
      if (w < fits[k] * 0.9) k = i;
    });
    this.partsPick = k;
    const want = fits[k], inset = insets[k];
    // aim off-centre so the parts sit in the middle of the free part
    const goal = centre.clone()
      .addScaledVector(right, -(inset.left - inset.right) * th0 * want)
      .addScaledVector(up, -(inset.bottom - inset.top) * tv0 * want);
    ctl.target.lerp(goal, a);
    cam.position.copy(ctl.target).addScaledVector(off, dist + (want - dist) * a);
  }
}

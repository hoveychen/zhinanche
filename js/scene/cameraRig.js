// Camera presets (ViewId in js/teach/types.js) that follow the chariot while
// the child is still free to orbit. Switching view glides there.

import * as THREE from "three";
import { SUN_DIR } from "./environment.js";

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

/** The home page's opening: how long the close view of the figure holds, and how long the pull back to the chase view takes (s). */
const INTRO = { hold: 1.8, out: 3.2 };
/** A lesson step's opening (its demo waits for it): a glance at the hand, then out. */
const INTRO_BRIEF = { hold: 0.5, out: 2.2 };

/** The figure's middle, arm included (chariot local, big figure: js/scene/rig.js), and its height with the arm. */
const FIGURE_MID = { x: 0, y: 13.4, z: 0.9, h: 3.4 };

/**
 * The follow view looks along a fixed bearing in the world: from the north
 * and to the west, south past the chariot at the gate (js/scene/landmark.js),
 * 8° up. How far round to the west goes by how wide the view is (this much of
 * half its width, within these bounds): the further round, the more of the
 * near wheel shows under the box, and the further right the gate is. The
 * chariot is set this much of half the width left of the middle, so the gate
 * has room on the right; and drawn this much bigger than the sphere fit.
 */
const CHASE = { side: 0.85, least: 11, most: 22, up: 0.14, left: 0.1, close: 0.78 };
/** How far round the chariot the chase view keeps clear of the HUD, whichever way it turns (the shafts reach further). */
const CHASE_ROOM = 6;

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

/** Framing a route: the chariot's reach round its centre and its height (no figure: it is over the centre). */
const BODY = { r: 5, h: 8 };
/** ...tipped this far from straight down (degrees), with this much room to spare round it. */
const TOP_TIP = 30;
const TOP_SPARE = 1.1;

/**
 * The close view over the chariot frames the ground this far round it (x;
 * north and south, the south seal of the ring included: js/scene/ground.js)
 * and the figure up to its head (the big figure: js/scene/rig.js), looking
 * from the west, a little south, 33° up.
 */
const ABOVE = { x: 6, north: 7, south: 11.2 };
const ABOVE_DIR = new THREE.Vector3(-1, 0.66, 0.2).normalize();
const FIGURE_TOP = FIGURE_MID.y + FIGURE_MID.h / 2 + 0.6;

/**
 * The overview frames a sphere this big round the chariot (a demo on the
 * ground: the demo's own, if bigger), from the west and a little south, 30°
 * up: the sunlit side (the sun is low in the west-north-west,
 * js/scene/environment.js), the near wheel under the box, the south seal by it.
 */
const OVERVIEW_R = 12;
const OVERVIEW_DIR = new THREE.Vector3(-0.9, 0.62, 0.5).normalize();

/** Views close in on the works on purpose: they may look from inside the body. */
const CLOSE = new Set(["gears", "works", "pair", "diff", "wheels", "figure", "hero", "intro"]);

/** The gears view looks from behind and above, a little to the right (chariot local). */
const GEARS_DIR = /** @type {const} */ ([-1, 1.35, 0.75]);

/** Views that swing round with the chariot. */
const TURNING = new Set(["gears", "works", "pair", "diff", "wheels", "figure"]);

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
    /** @type {{fromPos: THREE.Vector3, fromTarget: THREE.Vector3, t: number, dur?: number} | null} */
    this.glide = null;
    /** the home page's opening (view "intro"): seconds into it, and whether it has pulled back yet */
    this.intro = { t: 0, out: false };
    /** the opening is a lesson step's, which waits with its demo till it is out: keep it short */
    this.brief = false;
    /** fixed framing for the top view (route playback), else null */
    /** @type {{target: THREE.Vector3, pos: THREE.Vector3} | null} */
    this.box = null;
    this.last = { x: 0, z: 0, heading: Math.PI / 2 };
    this.extraRadius = 0;
    /** seconds left to keep the taken-apart parts framed (set while they move) */
    this.reframe = 0;
    /** @type {THREE.Box3 | null} round the parts, world space */
    this.parts = null;
    /** the chariot is taken apart (setApart): the camera may come in among the parts */
    this.apart = false;
    /** @type {Insets[]} ways to keep clear of the HUD when framing the parts (the one that shows them biggest wins) */
    this.partsInset = [{ left: 0, right: 0, top: 0, bottom: 0 }];
    /** which of them was used last (kept unless another is clearly better: no flip-flopping) */
    this.partsPick = 0;
    /** which wheel the wheels view looks at: 1 the right (local +Z), -1 the left */
    this.wheelSide = 1;
    /** the view is under 600 CSS px tall (set by the world) */
    this.short = false;
    /** the HUD's margins over the view (set by the world) */
    /** @type {() => Insets} */
    this.insets = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
    /** the HUD's margins over the lower part of the view, where the chase view has the chariot (set by the world) */
    /** @type {() => Insets} */
    this.lowInsets = () => this.insets();
    /** how much of the view's height a sheet pulled up over it covers (set by the world) */
    this.cover = () => 0;
    /** the ways to keep clear of the HUD: beside it, or above and below it (set by the world) */
    /** @type {() => Insets[]} */
    this.bands = () => [this.insets()];
    /** how far from the target the camera wanted to be when last kept in the room (0: it wasn't) */
    this.wantDist = 0;
    /** the camera is where its view put it (nobody has dragged it since) */
    this.atPreset = false;
    controls.addEventListener("start", () => {
      this.atPreset = false;
      // a drag in the opening: the child has taken the view, no pull back later
      this.intro.out = true;
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
    if (!CLOSE.has(this.view) && !this.apart) {
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

  /**
   * How far back from a box's centre, looking along -`off`, every corner of
   * the box fits in the part of the view the inset leaves free.
   * @param {THREE.Box3} box @param {THREE.Vector3} off unit, from the box toward the camera
   * @param {Insets} inset @param {number} least the smallest free fraction of the view to count on
   */
  #fitBox(box, off, inset, least) {
    const { right, up } = axes(off);
    const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2), th = tv * this.camera.aspect;
    const ux = Math.max(least, 1 - inset.left - inset.right), uy = Math.max(least, 1 - inset.top - inset.bottom);
    const centre = box.getCenter(new THREE.Vector3());
    const c = new THREE.Vector3();
    let want = 0;
    for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(centre);
      const z = c.dot(off);
      want = Math.max(want, z + Math.abs(c.dot(right)) / (th * ux), z + Math.abs(c.dot(up)) / (tv * uy));
    }
    return want;
  }

  /**
   * Camera and target `d` back from a box's centre along `off`, aimed off
   * centre so the box sits in the middle of the part of the view the inset
   * leaves free.
   * @param {THREE.Box3} box @param {THREE.Vector3} off @param {number} d @param {Insets} inset
   */
  #aimBox(box, off, d, inset) {
    const { right, up } = axes(off);
    const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2), th = tv * this.camera.aspect;
    const target = box.getCenter(new THREE.Vector3())
      .addScaledVector(right, -(inset.left - inset.right) * th * d)
      .addScaledVector(up, -(inset.bottom - inset.top) * tv * d);
    return { target, pos: target.clone().addScaledVector(off, d) };
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
    const dirLocal = (/** @type {number} */ lx, /** @type {number} */ ly, /** @type {number} */ lz) => fromChariot(f, lx, ly, lz);
    if (view === "intro") view = this.intro.out ? "follow" : "hero";
    switch (view) {
      case "hero": {
        // Close on the figure from behind it and to one side, the arm side-on
        // enough to read, the South Gate it points at in the same picture.
        // Figure and arm take about a third of the height; the wider the view,
        // the further round to the side it can go and still have the gate in.
        const v = THREE.MathUtils.degToRad(this.camera.fov);
        const hf = 2 * Math.atan(Math.tan(v / 2) * this.camera.aspect);
        const side = THREE.MathUtils.clamp(hf * 0.72, THREE.MathUtils.degToRad(14), THREE.MathUtils.degToRad(36));
        const fig = new THREE.Vector3(f.x + FIGURE_MID.x, FIGURE_MID.y, f.z + FIGURE_MID.z);
        const d = (FIGURE_MID.h * 2.05) / Math.tan(v / 2);
        // from the north and a little west (the sunlit side, as the chase view)
        const pos = fig.clone().addScaledVector(new THREE.Vector3(-Math.sin(side), 0.2, -Math.cos(side)).normalize(), d);
        // aim between the figure and the gate (js/scene/landmark.js), so both are in
        const gate = new THREE.Vector3(f.x, 12.5, f.z + 105);
        const aim = fig.clone().sub(pos).normalize().add(gate.sub(pos).normalize()).normalize();
        return { pos, target: pos.clone().addScaledVector(aim, d) };
      }
      case "top": {
        if (this.box) {
          return { target: this.box.target.clone(), pos: this.box.pos.clone() };
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
        const th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect;
        const side = THREE.MathUtils.clamp(Math.atan(th) * CHASE.side, THREE.MathUtils.degToRad(CHASE.least), THREE.MathUtils.degToRad(CHASE.most));
        const dir = new THREE.Vector3(-Math.sin(side), CHASE.up, -Math.cos(side)).normalize();
        const target = new THREE.Vector3(f.x + 1, 7.5, f.z + 3.5);
        // Phones held upright (polish-mobile): fit() goes by the narrow width
        // there and leaves the chariot small, so come in closer.
        // A short stage (a tablet held upright, the lesson panel below it)
        // leaves it small too, and so does a stage narrower than it is tall
        // (a tablet held flat, the panel beside it).
        const r = CHASE.close * (this.camera.aspect < 0.8 ? 15.5 : this.short || this.camera.aspect < 1 ? 16 : 19);
        // ...but never so close that the figure's head leaves the top (a wide, short view)
        const whole = new THREE.Box3(new THREE.Vector3(f.x - 5.5, 0, f.z - 5.5), new THREE.Vector3(f.x + 5.5, FIGURE_TOP, f.z + 5.5));
        const d = Math.max(this.fit(r), this.#fitBox(whole, dir, { left: 0, right: 0, top: 0, bottom: 0 }, 1) * 1.08);
        // in the middle of what the HUD leaves free across the view (the
        // drive pad on a phone would sit on the chariot)
        const ins = this.lowInsets();
        // The camera keeps this framing as the chariot drives and turns; side
        // on (shafts and all) it is twice as long as head on. If that would
        // not fit between the panels down the sides (free driving on a
        // tablet: the odometer one side, "See the gears" and the arrows the
        // other), set it where the HUD leaves the most room, further back if
        // it must be.
        const round = new THREE.Box3(new THREE.Vector3(f.x - CHASE_ROOM, 0, f.z - CHASE_ROOM), new THREE.Vector3(f.x + CHASE_ROOM, FIGURE_TOP, f.z + CHASE_ROOM));
        // A sheet pulled up over the view (free driving on a phone): the
        // picture is moved up into what still shows (World #liftOver), so
        // keep the chariot and the figure whole in that, further back.
        const c = Math.min(this.cover(), 0.7);
        if (c > 0.05) {
          const none = { left: 0, right: 0, top: 0, bottom: 0 };
          return this.#aimBox(round, dir, Math.max(d, this.#fitBox(round, dir, { ...none, top: c / 2, bottom: c / 2 }, 0.25)), none);
        }
        let best = { d: this.#fitBox(round, dir, ins, 0.25), ins };
        if (best.d > d) {
          for (const b of this.bands()) {
            const bd = this.#fitBox(round, dir, b, 0.25);
            if (bd < best.d * 0.95) best = { d: bd, ins: b };
          }
          if (best.ins !== ins) return this.#aimBox(round, dir, Math.max(d, best.d), best.ins);
        }
        const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
        target.addScaledVector(right, ((ins.right - ins.left) / 2 + CHASE.left) * d * th);
        return { target, pos: target.clone().addScaledVector(dir, d) };
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
        // The differential from lower down: from as high as the Song one, its
        // small top flat gear covers the small gears and carrier under it.
        const target = song ? local(1.1, 3.7, 0) : local(0.1, 2.2, -0.4);
        const r = song ? 4.9 : 4.2;
        return { target, pos: target.clone().addScaledVector(song ? dirLocal(...GEARS_DIR) : dirLocal(-1, 0.72, 0.62), this.fit(r)) };
      }
      case "works": {
        // The gears and, up the shaft, the figure standing on them: the
        // carrier and the man can be seen turning together. Higher and
        // further back than the gears view, from the same side.
        const target = local(f.figureX * 0.5 + 0.1, 6.2, -0.3);
        return { target, pos: target.clone().addScaledVector(dirLocal(-1, 1.15, 0.8), this.fit(6.6)) };
      }
      case "pair": {
        // Low behind the differential, a little to the right: its two flat
        // gears lie one above the other on the shaft (big left one under,
        // small right one over), and from this low they and their turning
        // arrows stand apart; the left wheel is on the left of the screen.
        const target = local(0, 1.55, 0);
        return { target, pos: target.clone().addScaledVector(dirLocal(-1, 0.42, 0.25), this.fit(3.1)) };
      }
      case "diff": {
        // In at the height of the gap between the two flat gears (big left one
        // under, top 1.28; small right one over, from 1.72): the small gears
        // that roll between them stand on edge on the carrier's arms (local
        // x ±0.6). From behind and a little right the near one shows its face
        // and the far one its edge past the carrier's hub.
        const target = local(-0.15, 1.5, 0.05);
        return { target, pos: target.clone().addScaledVector(dirLocal(-1, 0.2, 0.42), this.fit(1.9)) };
      }
      case "above": {
        // Over the chariot from its sunlit west side, a little south of west,
        // tipped a third of the way up from the ground: low enough that the
        // near wheel shows under the box (the box overhangs the wheels by
        // 1.75; from higher up, or from the front, it hides them), high
        // enough that the two wheel tracks lie apart, one in front of the
        // chariot, one behind. The world keeps still (north to the left, the
        // gate to the right), so the figure is seen to keep pointing south
        // as the chariot turns. Framed: the ground round the chariot with the
        // south seal of the ring, and the figure up its pole, set in the part
        // of the view the HUD leaves free (beside it, or above and below it:
        // whichever leaves the chariot bigger).
        const box = new THREE.Box3(new THREE.Vector3(f.x - ABOVE.x, 0, f.z - ABOVE.north), new THREE.Vector3(f.x + ABOVE.x, FIGURE_TOP, f.z + ABOVE.south));
        let best = { d: Infinity, ins: this.insets() };
        for (const ins of this.bands()) {
          const d = this.#fitBox(box, ABOVE_DIR, ins, 0.4);
          if (d < best.d * 0.95) best = { d, ins };
        }
        return this.#aimBox(box, ABOVE_DIR, best.d, best.ins);
      }
      case "wheels": {
        // The box (9.5 wide) hangs over the wheels (at local ±3): from the
        // chariot's middle only their lower halves show, so look at one wheel
        // from outside it, low and a little from behind: a little under the
        // box's floor (3.55), so all of the wheel under it shows (rim, spokes,
        // hub and its bands, the axle's cap and linchpin) and the hub still
        // catches the light from above (from lower it is all in the box's
        // shade). The wheel on the sun's side when the view was chosen (the
        // other is in the box's shadow): it stays that wheel as the chariot turns.
        const sz = this.wheelSide;
        const target = local(0.1, 1.95, 3.4 * sz);
        return { target, pos: target.clone().addScaledVector(dirLocal(-0.5, 0.1, sz), this.fit(3.7)) };
      }
      case "figure": {
        // the figure is drawn big here (js/scene/rig.js FIGURE_SCALE)
        const target = local(f.figureX, 13.4, 0);
        return { target, pos: target.clone().addScaledVector(dirLocal(0.4, 0.35, 1), this.fit(4.2)) };
      }
      case "overview":
      default: {
        const target = new THREE.Vector3(f.x, 6.2, f.z + 4.6);
        return { target, pos: target.clone().addScaledVector(OVERVIEW_DIR, this.fit(Math.max(OVERVIEW_R, this.extraRadius))) };
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
    // the opening plays once: a reset while it runs (the home page's demo
    // drive starting over) keeps going where it got to
    if (view === "intro" && this.view !== "intro") this.intro = { t: 0, out: false };
    this.view = view;
    // the wheels view looks at the sunlit wheel: right (local +Z) or left
    if (view === "wheels") this.wheelSide = fromChariot(f, 0, 0, 1).dot(SUN_DIR) >= 0 ? 1 : -1;
    this.atPreset = true;
    // zooming in stops short of the chariot, except in the views that look inside it
    this.controls.minDistance = CLOSE.has(view) || this.apart ? 2 : 16;
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
   * Frame a route from above (route playback in the top view), in the part of
   * the view the HUD leaves free: the chariot's path and its bulk with about a
   * fifth to spare, tipped a little (north still up) so it reads as a chariot.
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
    // the chariot round each path point: wheels at ±3.6, the body and pole about as far
    const pad = BODY.r;
    x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
    const tip = THREE.MathUtils.degToRad(TOP_TIP);
    const off = new THREE.Vector3(0, Math.cos(tip), Math.sin(tip));
    const box = new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, BODY.h, z1));
    const want = Math.max(this.#fitBox(box, off, inset, 0.3) * TOP_SPARE, this.fit(8));
    this.box = this.#aimBox(box, off, want, inset);
    this.setView("top", f);
  }

  /** The chariot is taken apart, or put back together. @param {boolean} on */
  setApart(on) {
    this.apart = on;
    this.controls.minDistance = CLOSE.has(this.view) || on ? 2 : 16;
  }

  /** Taken apart, frame only the gears (else the wheels too): the gears are what a view not about the works gets taken apart for. */
  get gearsOnly() {
    return this.view === "gears" || !CLOSE.has(this.view);
  }

  /** Back to following the chariot in the top view. */
  unframe() {
    this.box = null;
  }

  /** Still in the opening's close view or pulling back from it. */
  get opening() {
    return this.view === "intro" && (!this.intro.out || this.glide !== null);
  }

  /**
   * Follow the chariot and finish any glide.
   * @param {number} dt
   * @param {Focus} f
   */
  update(dt, f) {
    const cam = this.camera, ctl = this.controls;
    if (this.view === "intro" && !this.intro.out) {
      this.intro.t += dt;
      const o = this.brief ? INTRO_BRIEF : INTRO;
      if (this.intro.t >= o.hold && !this.glide) {
        // slowly back out to the whole scene
        this.intro.out = true;
        this.glide = { fromPos: cam.position.clone(), fromTarget: ctl.target.clone(), t: 0, dur: o.out };
      }
    }
    // put back the distance taken off last frame, so the camera eases out
    // again once the way is clear (a glide or a jump places it afresh)
    if (this.wantDist && !this.glide) {
      const off = cam.position.clone().sub(ctl.target);
      cam.position.copy(ctl.target).addScaledVector(off.normalize(), this.wantDist);
    }
    this.wantDist = 0;
    if (this.glide) {
      const g = this.glide;
      g.t = Math.min(1, g.t + dt / (g.dur ?? GLIDE));
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
    if (this.reframe > 0 && this.parts && !this.glide && this.view !== "top") this.#frameParts(dt, this.parts, this.partsInset, f);
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
   * shows the parts bigger is used. A view that is not about the works (the
   * chase view in free driving) swings round to where the gears view looks
   * from: from the side the wheels and the body hide the gears.
   * @param {number} dt @param {THREE.Box3} box @param {Insets[]} insets @param {Focus} f
   */
  #frameParts(dt, box, insets, f) {
    const cam = this.camera, ctl = this.controls;
    const a = 1 - Math.exp(-dt * 5);
    const off = cam.position.clone().sub(ctl.target);
    const dist = off.length();
    off.divideScalar(dist);
    if (!CLOSE.has(this.view)) off.lerp(fromChariot(f, ...GEARS_DIR), a).normalize();
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

/**
 * A direction in the chariot's frame (+X forward, +Y up, +Z right), in the world.
 * @param {Focus} f @param {number} lx @param {number} ly @param {number} lz
 */
function fromChariot(f, lx, ly, lz) {
  const c = Math.cos(f.heading), s = Math.sin(f.heading);
  return new THREE.Vector3(lx * c + lz * s, ly, -lx * s + lz * c).normalize();
}

/**
 * Screen right and up for a camera looking along -`off`, world up kept up.
 * @param {THREE.Vector3} off
 */
function axes(off) {
  const right = new THREE.Vector3(0, 1, 0).cross(off);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  return { right, up: new THREE.Vector3().crossVectors(off, right) };
}

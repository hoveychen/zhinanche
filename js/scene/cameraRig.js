// Camera presets (ViewId in js/teach/types.js) that follow the chariot while
// the child is still free to orbit. Switching view glides there.

import * as THREE from "three";
import { SUN_DIR } from "./environment.js";
import { LANDMARK_DISTANCE } from "./landmark.js";

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
 * Where the figure is seen from (it faces south, world +z): 45° round from
 * south to west, a little above.
 */
const FIGURE_DIR = new THREE.Vector3(-Math.sin(Math.PI / 4), 0.35, Math.cos(Math.PI / 4)).normalize();
/** ...and in the opening close-up (view "hero"): 50° round, lower. */
const HERO_DIR = new THREE.Vector3(-Math.sin(THREE.MathUtils.degToRad(50)), 0.14, Math.cos(THREE.MathUtils.degToRad(50))).normalize();

/**
 * The follow view looks along a fixed bearing in the world: from the north
 * and to the west, south past the chariot at the gate (js/scene/landmark.js),
 * 8° up. The chariot is set this much of half the width left of the middle
 * (about the left third, as far as the HUD beside it allows), so it and the
 * red gate stand apart; then it looks as far round from the west as keeps the
 * gate's middle this far right of the middle at most (the chariot starts
 * facing north, end on to a view from the north: the box overhangs the
 * wheels 5.45 front and back and hides them; three-quarters on, 1.75 at the
 * side, the near wheel shows under it), within these bounds (degrees). Drawn
 * this much bigger than the sphere fit (closer on a wide stage: there the
 * chariot was a third of the picture, measured, and lost against the court;
 * on a narrow one, closer put the near wheel under the home page's caption).
 */
const CHASE = { least: 11, most: 40, gate: 0.75, up: 0.14, left: 0.3, close: 0.78, wide: 0.7 };
/** The gate's plaque, south of the origin (js/scene/landmark.js), and its height. */
const GATE = { z: LANDMARK_DISTANCE, y: 17 };
/** How far round the chariot the chase view keeps clear of the HUD, whichever way it turns (the shafts reach further). */
const CHASE_ROOM = 5;

/**
 * Where the camera may go in the courtyard (it stands at the origin,
 * design/decisions/0018): inside the corridor columns (x ±63.5), short of
 * the lions and the south gate (z 92, 105) and the pines and cauldrons in
 * the north (z −108). A drag, or the chariot driving toward a wall, that
 * would take it further brings it in closer along the line of sight instead
 * of through the wall.
 */
const ROOM = { x: 56, north: -100, south: 84 };

/** The chariot's bulk (centre height, radius): the wide views keep out of it. */
const BULK = { y: 5, r: 9 };

/** Framing a route: the chariot's reach round its centre and its height (no figure: it is over the centre). */
const BODY = { r: 5, h: 8 };
/** ...with this much room to spare round it. */
const TOP_SPARE = 1.1;
/**
 * The top view (drawing a road, and the road framed after) looks down from
 * the west, a little south, tipped this far from straight down (degrees):
 * near enough overhead to draw on, far enough round that the near wheel
 * shows under the box (it overhangs the wheels by 1.75; straight down, the
 * box hides them). North is to the left and the gate to the right, as in the
 * view over the chariot (ABOVE_DIR below).
 */
const TOP_TIP = 45;
const TOP_DIR = new THREE.Vector3(-1, 1 / Math.tan(THREE.MathUtils.degToRad(TOP_TIP)), 0.2).normalize();

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
 * ground: the demo's own, if bigger), from the west and a little south, 22°
 * up: the sunlit side (the sun is low in the west-north-west,
 * js/scene/environment.js), the near wheel under the box, the south seal by
 * it. How far south of west (degrees) is picked when the view is chosen, for
 * the way the chariot faces then (a step can open with it facing any way):
 * the bearing in this range most side on to it, as near the usual one as
 * that allows. End on, the box (5.45 longer than the wheels front and back)
 * hid both wheels. North of west, the compass demo (east-south-east of the
 * chariot) would be behind it. The world keeps still while the view lasts.
 */
const OVERVIEW = { r: 12, up: 22, from: 10, to: 50, usual: 29 };
/**
 * The gears view before the body is seen through: the whole cart from behind
 * and to the side the sun is on, 27° up (chariot local), the near wheel under
 * the box (from higher, and more from behind, the box hid both).
 */
const OUTSIDE_DIR = /** @type {const} */ ([-0.55, 0.62, 1.1]);

/** Views close in on the works on purpose: they may look from inside the body. */
const CLOSE = new Set(["gears", "works", "pair", "diff", "wheels", "figure", "hero", "intro"]);

/**
 * The gears view looks from behind and above, a little to the right (chariot
 * local): the Song one 56° up, the differential 40°, both 22° right of
 * straight behind (decision 0017). From further right (37°, 32°) the right
 * wheel stood in front of where the right gears mesh.
 */
const GEARS_DIR = /** @type {const} */ ([-1, 1.6, 0.4]);
const DIFF_DIR = /** @type {const} */ ([-1, 0.9, 0.4]);

/** Views that swing round with the chariot. */
const TURNING = new Set(["gears", "works", "pair", "diff", "wheels"]);

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
    /** @type {{fromPos: THREE.Vector3, fromTarget: THREE.Vector3, t: number, dur?: number, arc?: boolean} | null} */
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
    /** the side the gears view looks from before the body is seen through: 1 the right (local +Z), -1 the left */
    this.sunSide = 1;
    /** the overview's bearing, degrees south of west */
    this.overviewAt = OVERVIEW.usual;
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
    /** how much of the view's height the home page's caption takes along the bottom (set by the world) */
    this.caption = () => 0;
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
   * Keep the camera in the courtyard (ROOM) and out of the chariot, moving it
   * along its line of sight (the view keeps its direction). Remembers how far
   * it wanted to be, so it eases back out once the way is clear.
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
    lim(off.x, tgt.x, -ROOM.x, ROOM.x);
    lim(off.z, tgt.z, ROOM.north, ROOM.south);
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

  /**
   * The chase view (see CHASE) looking round `deg` from the north toward the west.
   * @param {Focus} f @param {number} deg
   * @returns {{pos: THREE.Vector3, target: THREE.Vector3}}
   */
  #chaseAt(f, deg) {
    const side = THREE.MathUtils.degToRad(deg);
    const th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect;
    const dir = new THREE.Vector3(-Math.sin(side), CHASE.up, -Math.cos(side)).normalize();
    const none = { left: 0, right: 0, top: 0, bottom: 0 };
    // Phones held upright (polish-mobile): fit() goes by the narrow width
    // there and leaves the chariot small, so come in closer.
    // A short stage (a tablet held upright, the lesson panel below it)
    // leaves it small too, and so does a stage narrower than it is tall
    // (a tablet held flat, the panel beside it).
    const r = this.camera.aspect < 0.8 ? CHASE.close * 15.5 : this.short || this.camera.aspect < 1 ? CHASE.close * 16 : CHASE.wide * 19;
    // ...but never so close that the figure's head leaves the top (a wide,
    // short view), and on the home page the wheels stay above its caption
    // along the bottom (it sat over them)
    const whole = new THREE.Box3(new THREE.Vector3(f.x - 5.5, 0, f.z - 5.5), new THREE.Vector3(f.x + 5.5, FIGURE_TOP, f.z + 5.5));
    const cap = THREE.MathUtils.clamp(this.caption(), 0, 0.4);
    const d = Math.max(this.fit(r), this.#fitBox(whole, dir, { ...none, bottom: cap }, 0.5) * 1.08);
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
    // Across: the chariot about on the left third, as far as the panels
    // down the sides leave its turning room clear (x: its middle, in halves
    // of the view's width from the middle).
    const { right, up } = axes(dir);
    const centre = round.getCenter(new THREE.Vector3()), k = new THREE.Vector3();
    let hw = 0;
    for (let i = 0; i < 8; i++) {
      k.set(i & 1 ? round.max.x : round.min.x, i & 2 ? round.max.y : round.min.y, i & 4 ? round.max.z : round.min.z).sub(centre);
      hw = Math.max(hw, Math.abs(k.dot(right)) / (th * (d - k.dot(dir))));
    }
    const lo = -1 + 2 * ins.left + hw, hi = 1 - 2 * ins.right - hw;
    const x = lo > hi ? (lo + hi) / 2 : THREE.MathUtils.clamp(-CHASE.left, lo, hi);
    const tv = th / this.camera.aspect;
    const target = new THREE.Vector3(f.x + 1, 7.5, f.z + 3.5)
      .addScaledVector(right, -x * d * th)
      .addScaledVector(up, -cap * tv * d);
    return { target, pos: target.clone().addScaledVector(dir, d) };
  }

  /**
   * How far right of the middle the gate's plaque is in a chase view (in
   * halves of the view's width).
   * @param {{pos: THREE.Vector3, target: THREE.Vector3}} c
   */
  #gateX(c) {
    const th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect;
    const fwd = c.target.clone().sub(c.pos).normalize();
    const right = fwd.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const g = new THREE.Vector3(0, GATE.y, GATE.z).sub(c.pos);
    return g.dot(right) / (g.dot(fwd) * th);
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
        // Close on the figure from in front of it and to the west (the sunlit
        // side), its face and beard three-quarters on, the arm and the green
        // line it points along running off south across the picture. Figure
        // and arm take about a third of the height. (From behind, the South
        // Gate was in the picture too, but the first sight of the figure was
        // its back; it faces the gate, so the two can't both be in.)
        const v = THREE.MathUtils.degToRad(this.camera.fov);
        const fig = new THREE.Vector3(f.x + FIGURE_MID.x, FIGURE_MID.y, f.z + FIGURE_MID.z);
        const d = (FIGURE_MID.h * 1.3) / Math.tan(v / 2);
        const pos = fig.clone().addScaledVector(HERO_DIR, d);
        // aim a little down the line it points along, so the figure sits left of the middle
        const along = fig.clone().add(new THREE.Vector3(0, 0.3, 0.7));
        return { pos, target: pos.clone().addScaledVector(along.sub(pos).normalize(), d) };
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
        // aimed at the wheels' height, so the chariot sits in the middle
        const target = new THREE.Vector3(f.x, 2.5, f.z);
        return { target, pos: target.clone().addScaledVector(TOP_DIR, this.fit(16)) };
      }
      case "follow": {
        // A chase camera that does not turn with the chariot: the chariot
        // turns on screen while the figure's hand keeps pointing at the gate.
        // As far round as keeps the gate in, from where the chariot is when
        // the view is chosen (not which way it faces); driving, the camera
        // keeps that bearing and the court goes by.
        let at = this.#chaseAt(f, CHASE.least);
        for (let deg = CHASE.most; deg > CHASE.least; deg -= 1) {
          const c = this.#chaseAt(f, deg);
          if (this.#gateX(c) <= CHASE.gate) {
            at = c;
            break;
          }
        }
        return at;
      }
      case "gears": {
        const song = f.mechanism === "song";
        if (!f.inside) {
          // Not seeing through the body yet: the whole cart from behind and
          // above (sunlit side, figure in the picture); x-ray glides in close.
          const target = local(song ? 0.6 : 0.2, 5.6, 0);
          const [lx, ly, lz] = OUTSIDE_DIR;
          return { target, pos: target.clone().addScaledVector(dirLocal(lx, ly, lz * this.sunSide), this.fit(9.5)) };
        }
        // From behind and above, so the left wheel is on the left of the
        // screen: the wheels stand at the sides (local ±Z, radius 3) and would
        // hide the gears from any side-on angle. Close on the gears, which
        // fill the view (the figure is up its shaft, out of the picture: the
        // dial shows where it points); a little to the right so the big left
        // crown wheel shows its face. The boards go see-through with x-ray,
        // and the shaft and the pole (rig.js CLEAR) go to glass: the shaft
        // rises from the middle of the gears, and from any angle low enough
        // to see under the top flat gear it stood over where they mesh.
        // The differential from lower down: from as high as the Song one, its
        // small top flat gear covers the small gears and carrier under it.
        const target = song ? local(1.1, 3.7, 0) : local(0.1, 2.2, -0.4);
        const r = song ? 4.9 : 4.8;
        const [dx, dy, dz] = song ? GEARS_DIR : DIFF_DIR;
        return { target, pos: target.clone().addScaledVector(dirLocal(dx, dy, dz), this.fit(r)) };
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
        // The figure faces south whichever way the chariot goes, so this view is
        // set in the world: from the south-west, the sunlit side, its face,
        // beard and pointing arm three-quarters on (from the chariot's side it
        // was seen from behind as often as not).
        const target = local(f.figureX, 13.4, 0);
        return { target, pos: target.clone().addScaledVector(FIGURE_DIR, this.fit(4.2)) };
      }
      case "overview":
      default: {
        const a = THREE.MathUtils.degToRad(this.overviewAt), e = THREE.MathUtils.degToRad(OVERVIEW.up);
        const dir = new THREE.Vector3(-Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
        const target = new THREE.Vector3(f.x, 6.2, f.z + 4.6);
        return { target, pos: target.clone().addScaledVector(dir, this.fit(Math.max(OVERVIEW.r, this.extraRadius))) };
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
    // the sunlit side, and the overview's bearing, for the way the chariot faces now
    this.sunSide = fromChariot(f, 0, 0, 1).dot(SUN_DIR) >= 0 ? 1 : -1;
    if (view === "overview") this.overviewAt = sideOn(f.heading, OVERVIEW.from, OVERVIEW.to, OVERVIEW.usual);
    this.atPreset = true;
    // zooming in stops short of the chariot, except in the views that look inside it
    this.controls.minDistance = CLOSE.has(view) || this.apart ? 2 : 16;
    this.wantDist = 0;
    if (view !== "top") this.box = null;
    // The glide sets off from where the camera was with respect to the
    // chariot: a step that puts the chariot back at the start (it jumps
    // there before the view is set) would otherwise swing the view over
    // empty paving from where the chariot had got to.
    const jump = new THREE.Vector3(f.x - this.last.x, 0, f.z - this.last.z);
    this.last = { x: f.x, z: f.z, heading: f.heading };
    if (instant) {
      const d = this.desired(view, f);
      this.camera.position.copy(d.pos);
      this.controls.target.copy(d.target);
      this.glide = null;
    } else {
      this.glide = { fromPos: this.camera.position.clone().add(jump), fromTarget: this.controls.target.clone().add(jump), t: 0 };
    }
    this.controls.update();
  }

  /**
   * Frame a route from above (route playback in the top view), in the part of
   * the view the HUD leaves free: the chariot's path and its bulk with about a
   * tenth to spare, from the same side as the top view.
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
    const off = TOP_DIR;
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

  /**
   * End a glide where it was going, at once: a finger put down to draw while
   * the view is still swinging round to the top view would draw on ground
   * that moves under it (the stroke comes out bent and kinked).
   * @param {Focus} f
   */
  land(f) {
    if (!this.glide) return;
    const d = this.desired(this.view, f);
    this.camera.position.copy(d.pos);
    this.controls.target.copy(d.target);
    this.glide = null;
    this.controls.update();
    // picked from at once (world.groundAt), before the next frame draws
    this.camera.updateMatrixWorld();
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
        // slowly back out to the whole scene, round the chariot (from in front
        // of the figure to the chase view behind it: straight, it passed the figure close)
        this.intro.out = true;
        this.glide = { fromPos: cam.position.clone(), fromTarget: ctl.target.clone(), t: 0, dur: o.out, arc: true };
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
      // where it glides from moves with the chariot too
      const mx = f.x - this.last.x, mz = f.z - this.last.z;
      g.fromPos.x += mx; g.fromPos.z += mz;
      g.fromTarget.x += mx; g.fromTarget.z += mz;
      g.t = Math.min(1, g.t + dt / (g.dur ?? GLIDE));
      const k = g.t * g.t * (3 - 2 * g.t);
      const d = this.desired(this.view, f);
      if (g.arc) {
        // bearing, distance and height round the chariot each eased on their own
        const ax = g.fromPos.x - f.x, az = g.fromPos.z - f.z, bx = d.pos.x - f.x, bz = d.pos.z - f.z;
        const a0 = Math.atan2(az, ax), da = Math.atan2(Math.sin(Math.atan2(bz, bx) - a0), Math.cos(Math.atan2(bz, bx) - a0));
        const r = THREE.MathUtils.lerp(Math.hypot(ax, az), Math.hypot(bx, bz), k), a = a0 + da * k;
        cam.position.set(f.x + r * Math.cos(a), THREE.MathUtils.lerp(g.fromPos.y, d.pos.y, k), f.z + r * Math.sin(a));
      } else cam.position.lerpVectors(g.fromPos, d.pos, k);
      ctl.target.lerpVectors(g.fromTarget, d.target, k);
      if (g.t >= 1) this.glide = null;
    } else if (!(this.view === "top" && this.box)) {
      let dx = f.x - this.last.x, dz = f.z - this.last.z;
      if (this.view === "top") {
        // Keep the drawing still; only pan when the chariot nears the edge
        // (the view's height runs east-west when it looks from the west).
        const v = THREE.MathUtils.degToRad(cam.fov);
        const ey = cam.position.distanceTo(ctl.target) * Math.tan(v / 2), ex = ey * cam.aspect;
        const fromWest = Math.abs(cam.position.x - ctl.target.x) > Math.abs(cam.position.z - ctl.target.z);
        const [wx, wz] = fromWest ? [ey, ex] : [ex, ey];
        const ox = f.x - ctl.target.x, oz = f.z - ctl.target.z;
        dx = Math.abs(ox) > wx * 0.45 ? ox - Math.sign(ox) * wx * 0.45 : 0;
        dz = Math.abs(oz) > wz * 0.45 ? oz - Math.sign(oz) * wz * 0.45 : 0;
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
      } else if (this.view === "figure") {
        // Not turning (the figure doesn't), but following the figure's shaft
        // round the chariot's centre as it turns.
        const X = f.figureX, ex = X * (Math.cos(f.heading) - Math.cos(this.last.heading)), ez = -X * (Math.sin(f.heading) - Math.sin(this.last.heading));
        cam.position.x += ex; cam.position.z += ez;
        ctl.target.x += ex; ctl.target.z += ez;
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
 * The bearing between `from` and `to` (degrees south of west, seen from the
 * chariot) most side on to a chariot facing `heading`, the nearest to
 * `usual` of those about as good.
 * @param {number} heading @param {number} from @param {number} to @param {number} usual
 */
function sideOn(heading, from, to, usual) {
  const fx = Math.cos(heading), fz = -Math.sin(heading);
  let best = usual, score = -Infinity;
  for (let a = from; a <= to; a++) {
    const r = THREE.MathUtils.degToRad(a);
    const s = Math.abs(-Math.cos(r) * fz - Math.sin(r) * fx) - Math.abs(a - usual) * 0.002;
    if (s > score) {
      score = s;
      best = a;
    }
  }
  return best;
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

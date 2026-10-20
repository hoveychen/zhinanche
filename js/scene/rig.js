// Binds a loaded chariot GLB to the sim's pose through the node extras
// (docs/model-contract.md): rotate/lift motions, explode offsets, x-ray of the
// shell group, highlights, and picking a part for its label and tooth count.
// The rig only reads the pose; it never integrates motion.

import * as THREE from "three";
import { ClutchDisplay } from "./clutchPhase.js";
import { LEFT_NODES, PART_NODES, RIGHT_NODES, ownerOf } from "./parts.js";
import { OUTLINES, SpinArc, TRAIN, makeHull, makeWire } from "./gearviz.js";

/** @import { Pose } from "../sim/chariot.js" */
/** @import { PartId } from "../teach/types.js" */

/**
 * @typedef {object} Motion
 * @property {THREE.Object3D} node
 * @property {string} name
 * @property {"rotate" | "lift"} motion
 * @property {string} key pose key
 * @property {THREE.Vector3} axis
 * @property {number} factor
 * @property {number} distance
 */

/**
 * @typedef {object} Look per-mesh material state
 * @property {THREE.MeshStandardMaterial} mat
 * @property {THREE.Color} color
 * @property {string} group
 * @property {string} owner node name the mesh belongs to (marker teeth → their gear)
 * @property {boolean} wire drawn as a wireframe in x-ray (the body and the frame round the gears)
 * @property {boolean} [dim] faded back because other parts are highlighted
 */

/** @param {THREE.Object3D} o @returns {string} */
const nameOf = (o) => /** @type {string} */ (o.userData.name ?? o.name);

/** Parts faded back while others are highlighted: toward a pale grey, so they still read as wood. */
const FADE = new THREE.Color(0xb8b0a4);
const FADE_K = 0.62;
/** How bright a turning gear glows in its train's colour (x-ray / taken apart). */
const SPIN_GLOW = 0.55;
/** Angular speed (rad/s) at which a gear counts as fully "turning". */
const SPIN_FULL = 0.35;
const TMP = new THREE.Color();
/** Groups whose parts fade back (highlights) or light up (turning). */
const MOVING_GROUPS = new Set(["gear", "wheel", "figure"]);

/**
 * Spin arcs: which gears get one, how far outside the teeth (chi), and the
 * gear it meshes with (the arc's gap faces it so the arc doesn't cut the
 * teeth in mesh). `lift` raises the arc along the axis; `radius` fixes it.
 * @type {Record<string, {pad?: number, radius?: number, lift?: number, toward?: string}>}
 */
const ARCS = {
  "diff.crown.L": { pad: 0.22, toward: "diff.sideA" },
  "diff.crown.R": { pad: 0.22, toward: "diff.sideB" },
  "diff.sideA": { pad: 0.25, lift: -0.15, toward: "diff.crown.L" },
  "diff.sideB": { pad: 0.25, lift: 0.3, toward: "diff.crown.R" },
  "song.foot.L": { pad: 0.22, toward: "song.small.L" },
  "song.foot.R": { pad: 0.22, toward: "song.small.R" },
  "song.small.L": { pad: 0.2, lift: 0.35, toward: "song.bigFlat" },
  "song.small.R": { pad: 0.2, lift: 0.35, toward: "song.bigFlat" },
  "song.bigFlat": { pad: 0.25, lift: 0.35, toward: "body.pole" },
};
/** The differential's carrier sits between the side gears: its arc goes on the shaft, above them. */
const SHAFT_ARC = { radius: 0.75, lift: 2.4 };

/**
 * @typedef {object} Spinner a turning part, watched for how fast it turns
 * @property {Motion} m
 * @property {number} angle physical angle about its axis
 * @property {number} prev
 * @property {number} act 0..1, eased
 * @property {THREE.Color} color its train's colour
 * @property {SpinArc | null} arc
 * @property {number} lift arc offset along the axis
 */

/**
 * The figure is drawn bigger than in the model (about 1.4 chi tall there, a
 * speck on screen): it is what the viewer has to watch. Scaled about its
 * feet, so it still stands on its shaft. Close up on the gears it goes back
 * to its real size (setFigureBig), or it would fill the view.
 */
export const FIGURE_SCALE = 2.4;
/** seconds to grow or shrink the figure */
const FIGURE_EASE = 0.5;

export class Rig {
  /** @param {THREE.Object3D} scene the GLB scene */
  constructor(scene) {
    const root = scene.getObjectByName("chariot");
    if (!root) throw new Error("GLB has no chariot node");
    /** @type {THREE.Object3D} */
    this.root = root;
    /** @type {"differential" | "song"} */
    this.mechanism = root.userData.mechanism;
    /** @type {Motion[]} */
    this.motions = [];
    /** @type {Map<THREE.Object3D, {rest: THREE.Vector3, explode: THREE.Vector3, lift: Motion | null}>} */
    this.placed = new Map();
    /** @type {Look[]} */
    this.looks = [];
    /** @type {Map<string, THREE.Object3D>} */
    this.byName = new Map();
    /** @type {THREE.Mesh[]} */
    this.meshes = [];
    this.clutch = new ClutchDisplay();
    this.explode = 0;
    this.xray = false;
    /** @type {Set<string>} */
    this.lit = new Set();
    this.dimming = false;
    /** @type {{hull: THREE.Mesh, owner: string}[]} */
    this.hulls = [];
    /** @type {THREE.LineSegments[]} */
    this.wires = [];
    /** @type {Spinner[]} */
    this.spinners = [];
    /** @type {Map<string, Spinner>} */
    this.spinOf = new Map();
    /** figure's arm tip in figure-local coordinates */
    this.armTip = new THREE.Vector3(1, 0, 0);

    root.traverse((o) => {
      const ud = o.userData;
      const name = nameOf(o);
      if (ud.name) this.byName.set(name, o);
      /** @type {Motion | null} */
      let motion = null;
      if (ud.motion === "rotate" || ud.motion === "lift") {
        motion = {
          node: o, name, motion: ud.motion, key: ud.pose,
          axis: new THREE.Vector3().fromArray(ud.axis ?? [0, 1, 0]).normalize(),
          factor: ud.factor ?? 1, distance: ud.distance ?? 0,
        };
        this.motions.push(motion);
      }
      const ex = ud.explode;
      if (motion?.motion === "lift" || (Array.isArray(ex) && ex.some((v) => v !== 0))) {
        this.placed.set(o, {
          rest: o.position.clone(),
          explode: new THREE.Vector3().fromArray(Array.isArray(ex) ? ex : [0, 0, 0]),
          lift: motion?.motion === "lift" ? motion : null,
        });
      }
    });

    /** @type {THREE.Mesh[]} */
    const found = [];
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) found.push(o);
    });
    for (const o of found) {
      o.castShadow = true;
      o.receiveShadow = true;
      this.meshes.push(o);
      let n = /** @type {THREE.Object3D | null} */ (o);
      while (n && !n.userData.group) n = n.parent;
      const group = n?.userData.group ?? "chassis";
      const owner = ownerOf(n ? nameOf(n) : "");
      o.userData.partNode = n;
      const src = /** @type {THREE.MeshStandardMaterial} */ (o.material);
      const mat = src.clone();
      o.material = mat;
      const wire = group === "shell" || owner === "body.frame";
      this.looks.push({ mat, color: mat.color.clone(), group, owner, wire });
      if (wire) {
        const lines = makeWire(o);
        o.add(lines);
        this.wires.push(lines);
      } else if (group === "gear" || group === "wheel" || group === "figure") {
        if (n && nameOf(n).endsWith(".marker")) continue;
        const hull = makeHull(o);
        o.add(hull);
        this.hulls.push({ hull, owner });
      }
    }

    root.updateMatrixWorld(true);
    for (const m of this.motions) {
      if (m.motion !== "rotate" || m.name === "figure") continue;
      const color = LEFT_NODES.has(m.name) ? TRAIN.left : RIGHT_NODES.has(m.name) ? TRAIN.right : TRAIN.middle;
      /** @type {Spinner} */
      const sp = { m, angle: 0, prev: 0, act: 0, color, arc: null, lift: 0 };
      const cfg = ARCS[m.name] ?? (m.name === "figure.shaft" && this.mechanism === "differential" ? SHAFT_ARC : null);
      if (cfg) {
        const radius = cfg.radius ?? radiusAbout(m.node, m.axis, this.meshes) + (cfg.pad ?? 0.2);
        sp.arc = new SpinArc(radius, color);
        sp.lift = cfg.lift ?? 0;
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), m.axis);
        // turn the arc's gap (local angle GAP) toward the gear it meshes with
        const other = "toward" in cfg && cfg.toward ? this.byName.get(cfg.toward) : null;
        if (other && m.node.parent) {
          const want = m.node.parent.worldToLocal(other.getWorldPosition(new THREE.Vector3())).sub(m.node.position);
          want.addScaledVector(m.axis, -want.dot(m.axis));
          if (want.lengthSq() > 1e-6) {
            const gap = new THREE.Vector3(Math.cos(SpinArc.GAP), Math.sin(SpinArc.GAP), 0).applyQuaternion(q);
            const ang = Math.atan2(new THREE.Vector3().crossVectors(gap, want).dot(m.axis), gap.dot(want));
            q.premultiply(new THREE.Quaternion().setFromAxisAngle(m.axis, ang));
          }
        }
        sp.arc.group.quaternion.copy(q);
        m.node.parent?.add(sp.arc.group);
      }
      this.spinners.push(sp);
      this.spinOf.set(m.name, sp);
    }
    // the figure turns with its shaft
    const shaft = this.spinOf.get("figure.shaft");
    if (shaft) this.spinOf.set("figure", shaft);

    const figure = this.byName.get("figure");
    /** @type {THREE.Object3D | null} */
    this.figure = figure ?? null;
    this.figureScale = FIGURE_SCALE;
    this.figureTarget = FIGURE_SCALE;
    this.lastPulse = 0;
    if (figure) {
      figure.scale.setScalar(FIGURE_SCALE);
      this.armTip = armTipOf(figure);
    }
  }

  /**
   * Show a pose. `dt` drives the clutch easing (0 = jump).
   * @param {Pose} pose
   * @param {number} dt
   */
  apply(pose, dt) {
    const g = pose.gears;
    /** @type {Record<string, number>} */
    let shown = g;
    if (this.mechanism === "song") {
      this.clutch.update(pose.clutch, g, dt);
      shown = { ...g, ...this.clutch.shown(g) };
    }
    const q = new THREE.Quaternion();
    for (const m of this.motions) {
      if (m.motion !== "rotate") continue;
      const angle = m.name === "figure" ? pose.figureRel : (shown[m.key] ?? 0);
      m.node.quaternion.copy(q.setFromAxisAngle(m.axis, m.factor * angle));
      const sp = this.spinOf.get(m.name);
      if (sp) sp.angle = m.factor * angle;
    }
    this.#place();
  }

  /** Positions from explode and lift. */
  #place() {
    for (const [node, p] of this.placed) {
      node.position.copy(p.rest).addScaledVector(p.explode, this.explode);
      if (p.lift) {
        const e = this.clutch.eased(p.lift.key === "clutchL" ? "L" : "R");
        node.position.addScaledVector(p.lift.axis, p.lift.distance * (1 - e));
      }
    }
  }

  /** @param {number} v 0..1 */
  setExplode(v) {
    const was = this.inside;
    this.explode = v;
    this.#place();
    if (this.inside !== was) this.#outline();
  }

  /** Looking at the works: x-ray on, or taken apart. */
  get inside() {
    return this.xray || this.explode > 0.001;
  }

  /** Outlines on the gears while looking inside; bright on the highlighted ones. */
  #outline() {
    const on = this.inside;
    for (const { hull, owner } of this.hulls) {
      hull.visible = on;
      hull.material = this.lit.has(owner) ? OUTLINES.lit : this.dimming ? OUTLINES.faded : OUTLINES.ink;
    }
  }

  /** Start the clutch display afresh (after a reset). */
  resetClutch() {
    this.clutch.reset();
  }

  /**
   * @param {boolean} xray
   * @param {PartId[]} highlight
   */
  setLook(xray, highlight) {
    this.xray = xray;
    this.lit = new Set(highlight.flatMap((id) => PART_NODES[id] ?? []));
    const dimming = this.lit.size > 0 && this.looks.some((l) => this.lit.has(l.owner));
    this.dimming = dimming;
    for (const l of this.looks) {
      const m = l.mat;
      // x-ray: the body stops drawing (it still writes nothing, casts no
      // shadow) and its wireframe shows instead; no stacked see-through layers
      const see = xray && l.wire;
      m.transparent = see;
      m.opacity = see ? 0 : 1;
      m.depthWrite = !see;
      m.colorWrite = !see;
      m.color.copy(l.color);
      m.emissive.setRGB(0, 0, 0);
      l.dim = dimming && !this.lit.has(l.owner) && MOVING_GROUPS.has(l.group);
      if (l.dim) m.color.lerp(FADE, FADE_K);
      m.needsUpdate = true;
    }
    for (const w of this.wires) w.visible = xray;
    this.#outline();
  }

  /**
   * Draw the figure big (wide views) or at its real size (close on the gears).
   * @param {boolean} big @param {boolean} [instant]
   */
  setFigureBig(big, instant = false) {
    this.figureTarget = big ? FIGURE_SCALE : 1;
    if (instant) {
      this.figureScale = this.figureTarget;
      this.figure?.scale.setScalar(this.figureScale);
    }
  }

  /** Pulse the highlighted parts, and ease the figure's size. @param {number} t seconds */
  pulse(t) {
    const dt = Math.min(0.1, Math.max(0, t - this.lastPulse));
    this.lastPulse = t;
    if (this.figure && this.figureScale !== this.figureTarget) {
      const step = ((FIGURE_SCALE - 1) * dt) / FIGURE_EASE;
      const gap = this.figureTarget - this.figureScale;
      this.figureScale += Math.sign(gap) * Math.min(Math.abs(gap), step);
      this.figure.scale.setScalar(this.figureScale);
    }
    this.#spin(dt, t);
  }

  /**
   * Watch how fast each part turns; while looking inside, a turning part
   * glows in its train's colour and its spin arc shows. Highlighted parts pulse.
   * @param {number} dt @param {number} t
   */
  #spin(dt, t) {
    const inside = this.inside;
    if (dt > 0) {
      const rise = 1 - Math.exp(-dt / 0.12), fall = 1 - Math.exp(-dt / 0.5);
      for (const sp of this.spinners) {
        // a jump (reset, new step) is not turning
        const step = sp.angle - sp.prev;
        const omega = Math.abs(step) > 0.8 ? 0 : step / dt;
        sp.prev = sp.angle;
        const want = inside ? Math.min(1, Math.abs(omega) / SPIN_FULL) : 0;
        sp.act += (want - sp.act) * (want > sp.act ? rise : fall);
        if (sp.arc) {
          const g = sp.arc.group;
          g.position.copy(sp.m.node.position).addScaledVector(sp.m.axis, sp.lift);
          sp.arc.update(sp.angle, omega, sp.act);
        }
      }
    }
    // While anything turns, what stands still fades back: the train that is
    // driving stands out in its own colour.
    let moving = 0;
    for (const sp of this.spinners) moving = Math.max(moving, sp.act);
    const k = 0.18 + 0.14 * Math.sin(t * 4);
    for (const l of this.looks) {
      if (!MOVING_GROUPS.has(l.group)) continue;
      const sp = this.spinOf.get(l.owner);
      const act = inside && sp ? sp.act : 0;
      const f = Math.max(l.dim ? FADE_K * (1 - act) : 0, moving * (1 - act) * FADE_K);
      l.mat.color.copy(l.color).lerp(FADE, f);
      if (this.lit.has(l.owner)) l.mat.emissive.copy(l.color).multiplyScalar(k);
      else l.mat.emissive.setRGB(0, 0, 0);
      if (act > 0.001 && sp && l.owner !== "figure") l.mat.emissive.add(TMP.copy(sp.color).multiplyScalar(act * SPIN_GLOW));
    }
  }

  /**
   * The part under a ray, skipping the see-through shell.
   * @param {THREE.Raycaster} ray
   * @returns {{node: THREE.Object3D, point: THREE.Vector3} | null}
   */
  pick(ray) {
    const targets = this.xray ? this.meshes.filter((_, i) => !this.looks[i].wire) : this.meshes;
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit) return null;
    let n = /** @type {THREE.Object3D | null} */ (hit.object.userData.partNode);
    if (n && nameOf(n).endsWith(".marker")) n = n.parent;
    while (n && !n.userData.label) n = n.parent;
    return n ? { node: n, point: hit.point } : null;
  }

  /** @param {string} name GLB node name */
  node(name) {
    return this.byName.get(name) ?? null;
  }
}

/**
 * How far a part reaches from its axis (its own meshes and marker, not its
 * moving children), in its local frame.
 * @param {THREE.Object3D} node @param {THREE.Vector3} axis @param {THREE.Mesh[]} meshes
 */
function radiusAbout(node, axis, meshes) {
  const inv = node.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  let r = 0;
  for (const o of meshes) {
    const p = o.userData.partNode;
    if (p !== node && !(p?.parent === node && nameOf(p).endsWith(".marker"))) continue;
    const pos = o.geometry.getAttribute("position");
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      r = Math.max(r, v.addScaledVector(axis, -v.dot(axis)).length());
    }
  }
  return r;
}

/**
 * The figure's outstretched hand: the vertex furthest along local +X.
 * @param {THREE.Object3D} figure
 */
function armTipOf(figure) {
  figure.updateMatrixWorld(true);
  const inv = figure.matrixWorld.clone().invert();
  const best = new THREE.Vector3(-Infinity, 0, 0);
  const v = new THREE.Vector3();
  figure.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.partNode !== figure) return;
    const pos = o.geometry.getAttribute("position");
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (v.x > best.x) best.copy(v);
    }
  });
  return Number.isFinite(best.x) ? best : new THREE.Vector3(1, 0, 0);
}

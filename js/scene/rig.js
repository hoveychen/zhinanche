// Binds a loaded chariot GLB to the sim's pose through the node extras
// (docs/model-contract.md): rotate/lift motions, explode offsets, x-ray of the
// shell group, highlights, and picking a part for its label and tooth count.
// The rig only reads the pose; it never integrates motion.

import * as THREE from "three";
import { ClutchDisplay } from "./clutchPhase.js";
import { PART_NODES, ownerOf } from "./parts.js";

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
 */

/** @param {THREE.Object3D} o @returns {string} */
const nameOf = (o) => /** @type {string} */ (o.userData.name ?? o.name);

const GLOW = new THREE.Color(0xffc24a);
const DIM = 0.32;

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

    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
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
      this.looks.push({ mat, color: mat.color.clone(), group, owner });
    });

    const figure = this.byName.get("figure");
    if (figure) this.armTip = armTipOf(figure);
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
    this.explode = v;
    this.#place();
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
    for (const l of this.looks) {
      const m = l.mat;
      const see = xray && l.group === "shell";
      m.transparent = see;
      m.opacity = see ? 0.13 : 1;
      m.depthWrite = !see;
      m.color.copy(l.color);
      m.emissive.setRGB(0, 0, 0);
      if (dimming && !this.lit.has(l.owner) && (l.group === "gear" || l.group === "wheel" || l.group === "figure")) {
        m.color.multiplyScalar(DIM);
      }
      m.needsUpdate = true;
    }
  }

  /** Pulse the highlighted parts. @param {number} t seconds */
  pulse(t) {
    if (this.lit.size === 0) return;
    const k = 0.28 + 0.22 * Math.sin(t * 4);
    for (const l of this.looks) if (this.lit.has(l.owner)) l.mat.emissive.copy(GLOW).multiplyScalar(k);
  }

  /**
   * The part under a ray, skipping the see-through shell.
   * @param {THREE.Raycaster} ray
   * @returns {{node: THREE.Object3D, point: THREE.Vector3} | null}
   */
  pick(ray) {
    const targets = this.xray ? this.meshes.filter((m) => m.userData.partNode?.userData.group !== "shell") : this.meshes;
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

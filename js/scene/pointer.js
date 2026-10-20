// What the figure points with: a solid arrow out of its hand, and a long
// beam beyond it that fades out on the way to the gate in the south. Child of
// the figure node, so it turns with the figure; green on south, vermilion off.

import * as THREE from "three";
import { COLORS, OK_DEG } from "./ground.js";
import { FIGURE_SCALE } from "./rig.js";
import { LANDMARK_DISTANCE } from "./landmark.js";

/** Lengths in chi, as seen in the world while the figure is drawn big. */
const SHAFT = 3.2, HEAD = 1.3;
/** The beam reaches about as far as the gate, so a hand on south lights up its plaque. */
const BEAM = LANDMARK_DISTANCE - 8;

/** Opaque at the hand, clear at the far end (canvas top = far end of the beam). */
function fadeTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, "#fff");
  grad.addColorStop(0.15, "#aaa");
  grad.addColorStop(0.85, "#888");
  grad.addColorStop(1, "#000");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * A cylinder along +X from x0 to x0 + len.
 * @param {number} r0 radius at x0 @param {number} r1 radius at the far end @param {number} len @param {number} x0
 */
function along(r0, r1, len, x0) {
  const geo = new THREE.CylinderGeometry(r1, r0, len, 16, 1);
  geo.rotateZ(-Math.PI / 2);
  geo.translate(x0 + len / 2, 0, 0);
  return geo;
}

export class Pointer {
  /** @param {THREE.Vector3} tip figure-local hand position */
  constructor(tip) {
    this.mat = new THREE.MeshBasicMaterial({ color: COLORS.ok });
    this.beamMat = new THREE.MeshBasicMaterial({ color: COLORS.ok, transparent: true, opacity: 0.6, alphaMap: fadeTexture(), depthWrite: false });
    const g = new THREE.Group();
    g.name = "pointer";
    const shaft = new THREE.Mesh(along(0.16, 0.16, SHAFT, 0.1), this.mat);
    const head = new THREE.Mesh(along(0.5, 0.001, HEAD, 0.1 + SHAFT), this.mat);
    const beam = new THREE.Mesh(along(0.12, 0.3, BEAM, 0.1 + SHAFT + HEAD * 0.6), this.beamMat);
    beam.renderOrder = 4;
    for (const m of [shaft, head]) m.castShadow = true;
    g.add(shaft, head, beam);
    // Sized for the big figure; it shrinks with the figure close on the gears.
    g.scale.setScalar(1 / FIGURE_SCALE);
    g.position.copy(tip);
    this.mesh = g;
  }

  /** @param {number} errorDeg */
  update(errorDeg) {
    const hex = Math.abs(errorDeg) < OK_DEG ? COLORS.ok : COLORS.off;
    this.mat.color.setHex(hex);
    this.beamMat.color.setHex(hex);
  }
}

// A landmark far to the south: a red gate (牌楼) with a big 南 plaque facing
// the chariot. It gives the figure's hand something to point at, so the
// viewer can tell it points the same way without reading a compass.
//
// It is meant to be added to a group that moves with the chariot but never
// turns (the compass ring): it then always stands due south, like a far
// mountain, however far the chariot drives.

import * as THREE from "three";
import { STR } from "../teach/strings.js";

/** How far south of the chariot the gate stands (chi). */
export const LANDMARK_DISTANCE = 105;

/** Haze mixed into the gate's colours: it is far away. Not fogged (the fog would hide it). */
const SKY = new THREE.Color(0xd5e4df);
const HAZE = 0.16;

/** @param {number} hex */
function mat(hex) {
  const c = new THREE.Color(hex).lerp(SKY, HAZE);
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0, fog: false });
}

/** The plaque: a big gold 南 on azurite, framed in gold. */
function plaqueTexture() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  g.fillStyle = "#e0b04a";
  g.fillRect(0, 0, S, S);
  g.fillStyle = "#1f4a5c";
  g.fillRect(26, 26, S - 52, S - 52);
  g.strokeStyle = "#e0b04a";
  g.lineWidth = 8;
  g.strokeRect(48, 48, S - 96, S - 96);
  g.fillStyle = "#f6d77a";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = 'bold 340px "Kaiti SC", "STKaiti", "KaiTi", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", serif';
  g.fillText(STR.landmarkPlaque, S / 2, S / 2 + 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * A roof seen from the front: flat eaves that sweep up at both ends, a ridge
 * on top. Width w, along x, centred; depth d along z.
 * @param {number} w @param {number} d @param {number} hgt
 */
function roofGeometry(w, d, hgt) {
  const s = new THREE.Shape();
  const half = w / 2;
  s.moveTo(-half + 1.2, 0);
  s.lineTo(half - 1.2, 0);
  s.quadraticCurveTo(half - 0.2, 0, half + 0.6, hgt * 0.55);
  s.lineTo(half - 1.6, hgt * 0.45);
  s.lineTo(half - 2.6, hgt);
  s.lineTo(-half + 2.6, hgt);
  s.lineTo(-half + 1.6, hgt * 0.45);
  s.lineTo(-half - 0.6, hgt * 0.55);
  s.quadraticCurveTo(-half + 0.2, 0, -half + 1.2, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return geo;
}

export class Landmark {
  constructor() {
    const red = mat(0xb8321e), tile = mat(0x2c4f55), beamM = mat(0x2d6a6a), stone = mat(0xb9b2a2), gold = mat(0xd8a640);
    const g = new THREE.Group();
    g.name = "landmark";
    /** @param {THREE.BufferGeometry} geo @param {THREE.Material} m @param {number} x @param {number} y @param {number} z */
    const add = (geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    // Three bays: a tall middle one between the inner pillars, lower ones at the sides.
    const inner = 8, outer = 19, hi = 25, lo = 17, P = 1.7;
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(P, hi, P), red, sx * inner, hi / 2, 0);
      add(new THREE.BoxGeometry(P, lo, P), red, sx * outer, lo / 2, 0);
      for (const x of [inner, outer]) add(new THREE.BoxGeometry(P + 1.4, 2.4, P + 1.4), stone, sx * x, 1.2, 0);
      // side bay: lintel and roof
      add(new THREE.BoxGeometry(outer - inner + P, 1.6, 1.2), beamM, sx * (inner + outer) / 2, lo - 2.2, 0);
      add(roofGeometry(outer - inner + 5, 4.4, 2.8), tile, sx * (inner + outer) / 2, lo - 1.2, 0);
    }
    // middle bay: two lintels with the plaque between, and the high roof
    add(new THREE.BoxGeometry(inner * 2 + P, 1.6, 1.4), beamM, 0, hi - 2.6, 0);
    add(new THREE.BoxGeometry(inner * 2 + P, 1.3, 1.4), red, 0, hi - 15.2, 0);
    add(roofGeometry(inner * 2 + 7, 5, 3.6), tile, 0, hi - 1.6, 0);
    add(new THREE.BoxGeometry(inner * 2 - 2, 0.5, 0.6), gold, 0, hi + 2.1, 0);
    const PL = 11;
    const plaque = add(new THREE.PlaneGeometry(PL, PL), new THREE.MeshBasicMaterial({ map: plaqueTexture(), fog: false }), 0, hi - 3.6 - PL / 2 - 0.2, -0.8);
    // face north, towards the chariot (a plane faces +z)
    plaque.rotation.y = Math.PI;
    g.position.set(0, 0, LANDMARK_DISTANCE);
    this.group = g;
  }
}

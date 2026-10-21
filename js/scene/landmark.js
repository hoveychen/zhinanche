// A landmark far to the south: a red gate (牌楼) with a big 南 plaque facing
// the chariot. It gives the figure's hand something to point at, so the
// viewer can tell it points the same way without reading a compass.
//
// It is meant to be added to a group that moves with the chariot but never
// turns (the compass ring): it then always stands due south, like a far
// mountain, however far the chariot drives.

import * as THREE from "three";
import { S as strings, canvasFont, onLang } from "../i18n.js";
import { Eaves, UV_PER_CHI } from "./eaves.js";

/** How far south of the chariot the gate stands (chi). */
export const LANDMARK_DISTANCE = 105;

/**
 * @param {number} hex @param {number} [roughness] @param {number} [metalness]
 * Lit by the sun and fogged like the courtyard round it, so its distance
 * haze is the sky's own colour (environment.js FOG).
 */
function mat(hex, roughness = 0.8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
}

/** The plaque: a big gold 南 on azurite, framed in gold (with a small line under it in some languages). */
function plaqueTexture() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const draw = () => {
    const str = strings();
    const sub = str.scene.plaqueSub;
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
    g.font = `bold ${sub ? 270 : 340}px ${canvasFont()}`;
    g.fillText(str.landmarkPlaque, S / 2, sub ? S / 2 - 34 : S / 2 + 14);
    if (sub) {
      g.font = `bold 84px ${canvasFont()}`;
      g.letterSpacing = "10px";
      g.fillText(sub, S / 2 + 5, S - 118);
      g.letterSpacing = "0px";
    }
    t.needsUpdate = true;
  };
  draw();
  onLang(draw);
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
  // the courtyard's roof tiles: u in chi along the eave as on its roofs (so
  // the rows meet the tile ends), v a little stretched (the face stands for
  // a slope seen from in front)
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * UV_PER_CHI, uv.getY(i) * UV_PER_CHI * 1.6);
  return geo;
}

/**
 * A lintel carrying the bracket band (courtyard.js bracketBand, build_photo.py
 * dougong_band) on its front and back: u counts sets, whole ones across.
 * @param {number} w @param {number} h @param {number} d
 */
function bracketBeam(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const sets = Math.max(1, Math.round(w / (h * 1.25)));
  const uv = geo.getAttribute("uv"), n = geo.getAttribute("normal");
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getZ(i)) > 0.5) uv.setXY(i, uv.getX(i) * sets, 0.01 + 0.98 * uv.getY(i));
    else uv.setXY(i, uv.getX(i), 0.03);
  }
  return geo;
}

export class Landmark {
  constructor() {
    const red = mat(0xb8321e), tile = mat(0x2c4f55), beamM = mat(0x2d6a6a), stone = mat(0xb9b2a2), gold = mat(0xd8a640);
    const trim = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, vertexColors: true });
    // the courtyard's materials take over these once it is built (Courtyard.dressGate)
    tile.userData.yard = "roofGreen";
    beamM.userData.yard = "dougong";
    trim.userData.yard = "eave";
    // how each weathers (aging.js, applied by look.js)
    red.userData.ageKind = "lacquer";
    tile.userData.ageKind = "roof";
    stone.userData.ageKind = "stone";
    gold.userData.ageKind = "gold";
    const g = new THREE.Group();
    g.name = "landmark";
    /** @param {THREE.BufferGeometry} geo @param {THREE.Material} m @param {number} x @param {number} y @param {number} z */
    const add = (geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    const eaves = new Eaves();
    /** a roof (roofGeometry) at x, y and the tile ends along its front eave @param {number} w @param {number} d @param {number} h @param {number} x @param {number} y */
    const roof = (w, d, h, x, y) => {
      add(roofGeometry(w, d, h), tile, x, y, 0);
      // the straight part of the eave; the ends sweep up
      eaves.eave((a) => new THREE.Vector3(x + a, y, -d / 2), new THREE.Vector3(0, 0, -1), -w / 2 + 1.4, w / 2 - 1.4, { fascia: true, rafters: true });
    };
    // Three bays: a tall middle one between the inner pillars, lower ones at the sides.
    const inner = 8, outer = 19, hi = 25, lo = 17, P = 1.7;
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(P, hi, P), red, sx * inner, hi / 2, 0);
      add(new THREE.BoxGeometry(P, lo, P), red, sx * outer, lo / 2, 0);
      for (const x of [inner, outer]) add(new THREE.BoxGeometry(P + 1.4, 2.4, P + 1.4), stone, sx * x, 1.2, 0);
      // side bay: lintel and roof
      add(bracketBeam(outer - inner + P, 1.6, 1.2), beamM, sx * (inner + outer) / 2, lo - 2.2, 0);
      roof(outer - inner + 5, 4.4, 2.8, sx * (inner + outer) / 2, lo - 1.2);
    }
    // middle bay: two lintels with the plaque between, and the high roof
    add(bracketBeam(inner * 2 + P, 1.6, 1.4), beamM, 0, hi - 2.6, 0);
    add(new THREE.BoxGeometry(inner * 2 + P, 1.3, 1.4), red, 0, hi - 15.2, 0);
    roof(inner * 2 + 7, 5, 3.6, 0, hi - 1.6);
    const tg = eaves.tiles.geometry(), rg = eaves.trim.geometry();
    if (tg) add(tg, tile, 0, 0, 0);
    if (rg) add(rg, trim, 0, 0, 0);
    add(new THREE.BoxGeometry(inner * 2 - 2, 0.5, 0.6), gold, 0, hi + 2.1, 0);
    const PL = 11;
    const plaque = add(new THREE.PlaneGeometry(PL, PL), new THREE.MeshBasicMaterial({ map: plaqueTexture() }), 0, hi - 3.6 - PL / 2 - 0.2, -0.8);
    // face north, towards the chariot (a plane faces +z)
    plaque.rotation.y = Math.PI;
    g.position.set(0, 0, LANDMARK_DISTANCE);
    this.group = g;
  }
}

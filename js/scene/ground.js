// The ground the chariot drives on: a paved courtyard, and the compass ring
// that rides along under the chariot with 南 marked on it and an arrow showing
// where the figure points. Green when the arrow sits on 南, vermilion when not.

import * as THREE from "three";

export const COLORS = {
  sky: 0xd5e4df,
  ok: 0x2f8a57,
  off: 0xc8361f,
  ink: 0x3a3128,
  left: 0x2e70d6,
  right: 0xf08a24,
};

/** Degrees off south that still count as "pointing south". */
export const OK_DEG = 1;

/**
 * The courtyard floor: a big plane of stone slabs (procedural texture, 12 chi
 * per tile, see texgen.js), plain until the textures arrive (dressGround).
 * Size in chi; the far edge is lost in the fog.
 */
export function makeGround(size = 3000) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 0xa29d93, roughness: 0.9, metalness: 0 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.name = "ground";
  mesh.userData.size = size;
  return mesh;
}

/**
 * Lay the stone texture on the ground, with a slow tone variation so the
 * 12-chi tile doesn't read as a repeat.
 * @param {THREE.Mesh} mesh from makeGround
 * @param {Record<string, THREE.Texture>} tex
 */
export function dressGround(mesh, tex) {
  const mat = /** @type {THREE.MeshStandardMaterial} */ (mesh.material);
  const reps = mesh.userData.size / 12;
  for (const k of ["stone", "stoneRough", "stoneNormal"]) tex[k].repeat.set(reps, reps);
  mat.color.setRGB(1, 1, 1);
  mat.map = tex.stone;
  mat.roughnessMap = tex.stoneRough;
  mat.normalMap = tex.stoneNormal;
  mat.normalScale.setScalar(1);
  const macro = tex.clouds;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.macroMap = { value: macro };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D macroMap;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float macroA = texture2D(macroMap, vMapUv * 0.043).g;
        float macroB = texture2D(macroMap, vMapUv * 0.011 + 0.37).g;
        diffuseColor.rgb *= mix(0.9, 1.07, macroA) * mix(0.94, 1.05, macroB);`,
      );
  };
  mat.needsUpdate = true;
}

const RING_R = 8.2;
const RING_SIZE = 22;

/** Canvas for the ring: north up (canvas top = world −z = north). */
function ringTexture() {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const px = S / RING_SIZE;
  const cx = S / 2, r = RING_R * px;
  g.strokeStyle = "rgba(58,49,40,0.55)";
  g.lineWidth = 0.14 * px;
  g.beginPath();
  g.arc(cx, cx, r, 0, Math.PI * 2);
  g.stroke();
  for (let d = 0; d < 360; d += 15) {
    const a = (d * Math.PI) / 180;
    const len = d % 90 === 0 ? 0.9 : 0.45;
    g.lineWidth = (d % 90 === 0 ? 0.14 : 0.08) * px;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r, cx - Math.cos(a) * r);
    g.lineTo(cx + Math.sin(a) * (r - len * px), cx - Math.cos(a) * (r - len * px));
    g.stroke();
  }
  // The south line: where the arrow should lie.
  g.setLineDash([0.5 * px, 0.35 * px]);
  g.strokeStyle = "rgba(200,54,31,0.6)";
  g.lineWidth = 0.12 * px;
  g.beginPath();
  g.moveTo(cx, cx + 1.2 * px);
  g.lineTo(cx, cx + r);
  g.stroke();
  g.setLineDash([]);
  const font = '"Kaiti SC", "STKaiti", "KaiTi", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "rgba(58,49,40,0.75)";
  g.font = `${1.3 * px}px ${font}`;
  const out = r + 1.15 * px;
  g.fillText("北", cx, cx - out);
  g.fillText("东", cx + out, cx);
  g.fillText("西", cx - out, cx);
  // 南 as a vermilion seal.
  const sy = cx + out + 0.2 * px, half = 1.05 * px;
  g.fillStyle = "#c8361f";
  g.fillRect(cx - half, sy - half, half * 2, half * 2);
  g.fillStyle = "#fbf6ec";
  g.font = `bold ${1.6 * px}px ${font}`;
  g.fillText("南", cx, sy + 0.05 * px);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A flat arrow along +X from r0 to r1, on the ground. @param {number} r0 @param {number} r1 @param {number} w */
function arrowGeometry(r0, r1, w) {
  const s = new THREE.Shape();
  const head = 1.4;
  s.moveTo(r0, -w / 2);
  s.lineTo(r1 - head, -w / 2);
  s.lineTo(r1 - head, -w * 1.6);
  s.lineTo(r1, 0);
  s.lineTo(r1 - head, w * 1.6);
  s.lineTo(r1 - head, w / 2);
  s.lineTo(r0, w / 2);
  s.closePath();
  const geo = new THREE.ShapeGeometry(s);
  // Shape is in XY; lay it on the ground (XY → XZ, keeping +X).
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** The ring under the chariot, and the figure's arrow. */
export class CompassRing {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "compassRing";
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(RING_SIZE, RING_SIZE),
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.renderOrder = 2;
    this.group.add(ring);
    this.arrowMat = new THREE.MeshBasicMaterial({ color: COLORS.ok, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    this.arrow = new THREE.Mesh(arrowGeometry(1.2, RING_R - 0.2, 0.42), this.arrowMat);
    this.arrow.position.y = 0.04;
    this.arrow.renderOrder = 3;
    this.group.add(this.arrow);
  }

  /**
   * @param {number} x three.js world x
   * @param {number} z
   * @param {number} figureWorld the figure's bearing (sim angle, rad)
   * @param {number} errorDeg
   */
  update(x, z, figureWorld, errorDeg) {
    this.group.position.set(x, 0, z);
    this.arrow.rotation.y = figureWorld;
    this.arrowMat.color.setHex(Math.abs(errorDeg) < OK_DEG ? COLORS.ok : COLORS.off);
  }
}

/** A thin beam from the figure's hand, child of the figure node so it turns with it. */
export class ArmBeam {
  /** @param {THREE.Vector3} tip figure-local hand position */
  constructor(tip) {
    const len = 5.5;
    this.mat = new THREE.MeshBasicMaterial({ color: COLORS.ok, transparent: true, opacity: 0.75, depthWrite: false });
    const geo = new THREE.CylinderGeometry(0.05, 0.05, len, 8);
    geo.rotateZ(-Math.PI / 2);
    geo.translate(len / 2, 0, 0);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.copy(tip);
    this.mesh.renderOrder = 4;
  }

  /** @param {number} errorDeg */
  update(errorDeg) {
    this.mat.color.setHex(Math.abs(errorDeg) < OK_DEG ? COLORS.ok : COLORS.off);
  }
}

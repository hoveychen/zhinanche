// The ground the chariot drives on: a paved courtyard, and the compass ring
// that rides along under the chariot with 南 marked on it and an arrow showing
// where the figure points. Green when the arrow sits on 南, vermilion when not.

import * as THREE from "three";
import { S as strings, canvasFont, onLang } from "../i18n.js";

/** @import { Strings } from "../teach/strings.js" */

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

/** Paving albedo before the texture arrives, and its average after. */
const PAVING = 0xa29d93;

/**
 * The courtyard floor: stone slabs (procedural texture, 12 chi per tile, see
 * texgen.js), plain until the textures arrive (dressGround). The plane moves
 * with the chariot (Look.follow) but the slabs are laid in world space, so
 * they slide past as it drives. Size in chi: it only has to reach under the
 * courtyard walls (courtyard.js), which hide its edge.
 */
export function makeGround(size = 1400) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: PAVING, roughness: 0.9, metalness: 0 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.name = "ground";
  mesh.userData.size = size;
  return mesh;
}

/**
 * Lay the stone texture on the ground in world space, with a slow tone
 * variation so the 12-chi tile doesn't read as a repeat. The slabs fade to
 * their average colour away from the chariot: the buildings round the court
 * ride with the chariot, and slabs sliding past their feet would give that away.
 * @param {THREE.Mesh} mesh from makeGround
 * @param {Record<string, THREE.Texture>} tex
 */
export function dressGround(mesh, tex) {
  const mat = /** @type {THREE.MeshStandardMaterial} */ (mesh.material);
  for (const k of ["stone", "stoneRough", "stoneNormal"]) tex[k].repeat.set(1, 1);
  // a touch cooler than the texture: warm sun on warm stone read as mauve
  mat.color.setRGB(0.93, 0.96, 0.97);
  mat.map = tex.stone;
  mat.roughnessMap = tex.stoneRough;
  mat.normalMap = tex.stoneNormal;
  mat.normalScale.setScalar(1);
  const macro = tex.clouds;
  const prev = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, r) => {
    shader.uniforms.macroMap = { value: macro };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGroundXZ;\nvarying vec2 vGroundRel;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 groundW = modelMatrix * vec4(transformed, 1.0);
        vGroundXZ = groundW.xz;
        vGroundRel = groundW.xz - modelMatrix[3].xz;
        vec2 slabUv = vec2(groundW.x, -groundW.z) / 12.0;
        vMapUv = slabUv;
        #ifdef USE_NORMALMAP
        vNormalMapUv = slabUv;
        #endif
        #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = slabUv;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D macroMap;\nvarying vec2 vGroundXZ;\nvarying vec2 vGroundRel;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float groundFar = smoothstep(40.0, 95.0, length(vGroundRel));
        float macroA = texture2D(macroMap, vGroundXZ / 279.0).g;
        float macroB = texture2D(macroMap, vGroundXZ / 1090.0 + 0.37).g;
        vec3 slabs = diffuseColor.rgb * mix(0.9, 1.07, macroA) * mix(0.94, 1.05, macroB);
        diffuseColor.rgb = mix(slabs, texture2D(map, vMapUv, 12.0).rgb * diffuse * 0.98, groundFar);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        normal = normalize(mix(normal, nonPerturbedNormal, groundFar));`,
      );
    prev(shader, r);
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|ground`;
  mat.needsUpdate = true;
}

const RING_R = 8.2;
const RING_SIZE = 22;


/** Canvas for the ring: north up (canvas top = world −z = north). Marks only; the letters are separate (see Label). */
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
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * One direction letter on the ground, or 南 as a vermilion seal; redrawn when
 * the language changes.
 * @param {(s: Strings) => string} pick @param {boolean} seal
 */
function letterTexture(pick, seal) {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const draw = () => {
    const ch = pick(strings());
    const FONT = canvasFont();
    g.clearRect(0, 0, S, S);
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (seal) {
      g.fillStyle = "#c8361f";
      g.beginPath();
      g.roundRect(6, 6, S - 12, S - 12, 10);
      g.fill();
      g.fillStyle = "#fbf6ec";
      g.font = `bold ${S * 0.7}px ${FONT}`;
    } else {
      g.fillStyle = "rgba(58,49,40,0.8)";
      g.font = `${S * 0.78}px ${FONT}`;
    }
    g.fillText(ch, S / 2, S / 2 + S * 0.03);
    t.needsUpdate = true;
  };
  draw();
  onLang(draw);
  return t;
}

const toCam = new THREE.Vector3();

/**
 * Keep a ground label upright for whoever is looking: its top turns to the
 * camera's "up" laid on the ground (the far side for a tilted view, north
 * on the screen for the top view).
 * @param {THREE.Mesh} mesh @param {THREE.Camera} cam
 */
function faceCamera(mesh, cam) {
  const e = cam.matrixWorld.elements;
  let dx = e[4], dz = e[6];
  if (Math.hypot(dx, dz) < 1e-3) {
    toCam.setFromMatrixPosition(cam.matrixWorld).sub(mesh.getWorldPosition(new THREE.Vector3()));
    dx = -toCam.x;
    dz = -toCam.z;
  }
  mesh.rotation.y = Math.atan2(-dx, -dz);
  mesh.updateMatrixWorld();
}

/**
 * @param {(s: Strings) => string} ch @param {boolean} seal @param {number} size chi
 * @param {number} x @param {number} z ring-local
 */
function label(ch, seal, size, x, z) {
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: letterTexture(ch, seal), transparent: true, depthWrite: false }));
  mesh.position.set(x, 0.03, z);
  mesh.renderOrder = 2;
  mesh.onBeforeRender = (_r, _s, cam) => faceCamera(mesh, cam);
  return mesh;
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
    // Letters stay upright for the camera (the follow view looks south, so
    // letters painted north-up would read upside down).
    const out = RING_R + 1.15;
    this.group.add(label((s) => s.scene.north, false, 2.3, 0, -out - 0.3), label((s) => s.scene.east, false, 2.3, out + 0.3, 0), label((s) => s.scene.west, false, 2.3, -out - 0.3, 0));
    // 南: a seal, and its ghost, drawn faintly where the chariot hides it
    // (from the follow view, the south side of the ring is behind the chariot).
    const seal = label((s) => s.scene.south, true, 2.4, 0, out + 0.4);
    const ghost = label((s) => s.scene.south, true, 2.4, 0, out + 0.4);
    const gm = /** @type {THREE.MeshBasicMaterial} */ (ghost.material);
    gm.depthFunc = THREE.GreaterDepth;
    gm.opacity = 0.55;
    ghost.renderOrder = 5;
    ghost.userData.noAO = true;
    this.group.add(seal, ghost);
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

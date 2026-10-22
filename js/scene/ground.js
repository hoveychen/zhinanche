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
 * The photographed paving (one 9.7-chi square: three courses of three slabs)
 * relaid course by course. Laid as it comes it is a grid: the same nine
 * slabs every 9.7 chi, the dark one in the middle course a dot in a lattice.
 * Each course (a row of the tile, counted across the whole court) slides
 * along by its own random amount, so the joints stagger as a mason's do, and
 * each slab takes its own tone: the scan's slab means (sRGB grey) are evened
 * out by half, then varied. All of it from the one tile, no extra taps:
 * sampled with the unshifted uv's derivatives, so the course edges don't
 * drop the mip level (a seam of blur along every joint).
 * Courses in v, bottom up from the joint at 0.322: the scan's middle course
 * (B, 0.322–0.653), the top (A) and the bottom (C, wrapping round); joints
 * across each in u and the slabs' means between them.
 */
const COURSES = /* glsl */ `
uniform float slabRows;
float gHash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
vec2 gUv;
vec3 gTone;
void groundCourses( vec2 uv ) {
  gUv = uv;
  gTone = vec3( 1.0 );
  if ( slabRows < 0.5 ) return;
  float t = uv.y - 0.322;
  float K = floor( t ), f = t - K;
  float course = f < 0.331 ? 0.0 : ( f < 0.666 ? 1.0 : 2.0 );
  float row = K * 3.0 + course;
  float u = uv.x + gHash( vec2( row, 7.31 ) );
  gUv = vec2( u, uv.y );
  vec3 joints = course < 0.5 ? vec3( 0.086, 0.398, 0.727 ) : course < 1.5 ? vec3( 0.069, 0.442, 0.700 ) : vec3( 0.005, 0.338, 0.628 );
  vec3 means = course < 0.5 ? vec3( 129.2, 116.2, 115.3 ) : course < 1.5 ? vec3( 148.1, 139.7, 144.2 ) : vec3( 132.3, 133.4, 116.1 );
  float Ku = floor( u ), fu = u - Ku;
  float slab = fu < joints.x ? 2.0 : fu < joints.y ? 0.0 : fu < joints.z ? 1.0 : 2.0;
  if ( fu < joints.x ) Ku -= 1.0;
  float mean = slab < 0.5 ? means.x : slab < 1.5 ? means.y : means.z;
  vec2 id = vec2( row, Ku * 3.0 + slab );
  float h = gHash( id ), w = gHash( id + 17.7 );
  gTone = vec3( pow( 132.0 / mean, 1.1 ) * mix( 0.84, 1.12, h ) ) * mix( vec3( 1.03, 1.0, 0.96 ), vec3( 0.97, 1.0, 1.04 ), w );
}
`;

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
 * their average colour away from the chariot (the mesh is kept under it,
 * Look.follow): made when the buildings rode along with the chariot, to keep
 * slabs from sliding past their feet, and kept for the look the court was
 * tuned with (design/decisions/0018).
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
  // a slot for the photographed paving's occlusion (photo.js): the stand-in's
  // red channel is white, so nothing is occluded until the photo comes
  mat.aoMap = tex.stoneRough;
  const macro = tex.clouds;
  const slab = { value: 12 };
  mat.userData.slabSize = slab;
  const rows = { value: 0 };
  mat.userData.slabRows = rows;
  const prev = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, r) => {
    shader.uniforms.macroMap = { value: macro };
    shader.uniforms.slabSize = slab;
    shader.uniforms.slabRows = rows;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float slabSize;\nvarying vec2 vGroundXZ;\nvarying vec2 vGroundRel;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 groundW = modelMatrix * vec4(transformed, 1.0);
        vGroundXZ = groundW.xz;
        vGroundRel = groundW.xz - modelMatrix[3].xz;
        vec2 slabUv = vec2(groundW.x, -groundW.z) / slabSize;
        vMapUv = slabUv;
        #ifdef USE_AOMAP
        vAoMapUv = slabUv;
        #endif
        #ifdef USE_NORMALMAP
        vNormalMapUv = slabUv;
        #endif
        #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = slabUv;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform sampler2D macroMap;\nvarying vec2 vGroundXZ;\nvarying vec2 vGroundRel;\n${COURSES}`)
      .replace("void main() {", "void main() {\n  groundCourses( vMapUv );\n  vec2 gUvDx = dFdx( vMapUv ), gUvDy = dFdy( vMapUv );")
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
    // The maps' taps go on the relaid courses: each chunk's texture2D is
    // swapped for a textureGrad at gUv round its include (the includes stay,
    // for the patches chained after this one: bakedao.js adds to the AO's).
    const on = "#undef texture2D\n#define texture2D( s, uv ) textureGrad( s, gUv, gUvDx, gUvDy )\n";
    const off = "\n#undef texture2D\n#define texture2D texture";
    for (const chunk of ["map_fragment", "normal_fragment_maps", "roughnessmap_fragment", "aomap_fragment"]) {
      const inc = `#include <${chunk}>`;
      shader.fragmentShader = shader.fragmentShader.replace(inc, on + inc + off + (chunk === "map_fragment" ? "\n#ifdef USE_MAP\n  diffuseColor.rgb *= gTone;\n#endif" : ""));
    }
    prev(shader, r);
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|ground`;
  mat.needsUpdate = true;
}

/**
 * Put the photographed paving down (photo.js), keeping the old average colour.
 * Only textures and uniforms change, so nothing recompiles.
 * @param {THREE.Mesh} mesh dressed by dressGround
 * @param {import("./photo.js").PhotoSet} set
 * @param {THREE.Color} was the procedural paving's average (linear)
 */
export function photoGround(mesh, set, was) {
  const mat = /** @type {THREE.MeshStandardMaterial} */ (mesh.material);
  // a touch cooler than the old paving: the scan is warm grey (from the
  // colour before any photo: the small set goes down first, then the full one)
  const before = /** @type {THREE.Color} */ (mat.userData.pavingColor ??= mat.color.clone());
  const target = before.clone().multiply(was).multiply(new THREE.Color(0.98, 1, 1.04));
  mat.color.copy(target).multiply(new THREE.Color(1 / set.mean.r, 1 / set.mean.g, 1 / set.mean.b));
  mat.map = set.albedo;
  mat.normalMap = set.normal;
  mat.roughnessMap = set.arm;
  mat.aoMap = set.arm;
  // the scan's roughness is absolute, the procedural one a multiplier
  mat.roughness = 1;
  // the scan is 3 m (9.7 chi) square
  mat.userData.slabSize.value = 9.7;
  // ...laid as three courses of three slabs, relaid course by course (COURSES)
  mat.userData.slabRows.value = 1;
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
const ghostAt = new THREE.Vector3();

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
    // Only for low views: looking down, what hides the seal is the chariot's top, and the
    // ghost sat on its roof. Gone between 30° and 45° above the ground.
    ghost.onBeforeRender = (_r, _s, cam) => {
      faceCamera(ghost, cam);
      toCam.setFromMatrixPosition(cam.matrixWorld).sub(ghost.getWorldPosition(ghostAt));
      const up = Math.asin(Math.min(1, toCam.y / Math.max(1e-6, toCam.length()))) * 180 / Math.PI;
      gm.opacity = 0.55 * this.labelsOn * Math.min(1, Math.max(0, (45 - up) / 15));
    };
    this.group.add(seal, ghost);
    /** the letters round the ring, faded out close in on the works (they'd float big in the picture) */
    this.labels = this.group.children.filter((o) => o !== ring).map((o) => {
      const m = /** @type {THREE.MeshBasicMaterial} */ (/** @type {THREE.Mesh} */ (o).material);
      return { mesh: o, mat: m, base: m.opacity };
    });
    this.labelsOn = 1;
    this.arrowMat = new THREE.MeshBasicMaterial({ color: COLORS.ok, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    this.arrow = new THREE.Mesh(arrowGeometry(1.2, RING_R - 0.2, 0.42), this.arrowMat);
    this.arrow.position.y = 0.04;
    this.arrow.renderOrder = 3;
    this.group.add(this.arrow);
  }

  /**
   * Fade the letters round the ring in or out: close in on the works they
   * would float big in the picture (the arrow stays).
   * @param {boolean} on @param {number} dt seconds since the last call (0: at once)
   */
  fadeLabels(on, dt) {
    const want = on ? 1 : 0;
    this.labelsOn += (want - this.labelsOn) * (dt <= 0 ? 1 : Math.min(1, dt / 0.35));
    if (Math.abs(this.labelsOn - want) < 0.01) this.labelsOn = want;
    for (const l of this.labels) {
      l.mat.opacity = l.base * this.labelsOn;
      l.mesh.visible = this.labelsOn > 0;
    }
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

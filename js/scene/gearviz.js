// What makes the gear train readable when you look inside (x-ray or taken
// apart): ink outlines round every gear (a back-face hull pushed out a few
// screen pixels, so it works on every quality tier without post-processing),
// a glass ghost of the hidden body, and a spin arc beside each turning
// gear: dashes that move with the gear's rim and an arrowhead for the way it
// turns, fading in only while that gear is turning.

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

/** Left train blue, right train orange, the middle (carrier, shaft, big flat wheel) brass. sRGB. */
export const TRAIN = {
  left: new THREE.Color(0x3b7bff),
  right: new THREE.Color(0xff8a1f),
  middle: new THREE.Color(0xffc93a),
};

const OUTLINE_VERT = /* glsl */ `
uniform vec2 res;
uniform float width;
void main() {
  // a little further from the eye than the part: pushing a fan of thin
  // triangles out in screen space can turn some of them round, and at the
  // part's own depth they inked a disc's face in sectors
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.xyz += normalize(mv.xyz) * (0.01 + 0.001 * length(mv.xyz));
  vec4 clip = projectionMatrix * mv;
  vec3 n = normalize(normalMatrix * normal);
  vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy;
  float len = length(dir);
  if (len > 1e-5) clip.xy += dir / len * width * 2.0 / res * clip.w;
  gl_Position = clip;
}`;

const OUTLINE_FRAG = /* glsl */ `
uniform vec3 color;
uniform float opacity;
void main() {
  gl_FragColor = vec4(color, opacity);
}`;

/** The shared drawing-buffer size the outline widths are measured in. */
const RES = { value: new THREE.Vector2(1, 1) };

/**
 * @param {number} color sRGB
 * @param {number} width CSS px (scaled by the pixel ratio in setOutlineScale)
 * @param {number} opacity
 */
function outlineMaterial(color, width, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      res: RES,
      width: { value: width },
      color: { value: new THREE.Color(color) },
      opacity: { value: opacity },
    },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: THREE.BackSide,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
  });
}

/** Ink round every gear; a lighter one for parts faded back. (The highlighted ones glow: HighlightGlow.) */
export const OUTLINES = {
  ink: outlineMaterial(0x1d140c, 1.6, 1),
  faded: outlineMaterial(0x4a3d30, 1.2, 0.55),
};
const BASE_WIDTH = new Map(Object.values(OUTLINES).map((m) => [m, m.uniforms.width.value]));

/**
 * Size the outlines for the canvas: call every frame (cheap).
 * @param {THREE.WebGLRenderer} renderer
 */
export function updateOutlines(renderer) {
  renderer.getDrawingBufferSize(RES.value);
  const pr = renderer.getPixelRatio();
  for (const [m, w] of BASE_WIDTH) m.uniforms.width.value = w * pr;
}

// The highlight: a soft glow round the outside of the parts a step names.
// A bright shell round each piece (as the ink outlines are drawn) traced
// every spoke and every tooth, and a wheel became a net of yellow lines.
// Here a part is drawn as one shape, what it sweeps out as it turns (a wheel
// a disc with its hub, a gear a disc to its tooth tips), white into a mask;
// the mask is blurred (at half size), and the blur is added to the picture
// only outside the shapes: a halo round the part's outline, nothing on its face.
const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec2 step;
varying vec2 vUv;
void main() {
  // a Gaussian of 9 taps, sigma 2 steps
  float w[5];
  w[0] = 0.2042; w[1] = 0.1802; w[2] = 0.1238; w[3] = 0.0663; w[4] = 0.0276;
  float s = texture2D(map, vUv).r * w[0];
  for (int i = 1; i < 5; i++) {
    s += texture2D(map, vUv + step * float(i)).r * w[i];
    s += texture2D(map, vUv - step * float(i)).r * w[i];
  }
  gl_FragColor = vec4(s, s, s, 1.0);
}`;

const GLOW_FRAG = /* glsl */ `
uniform sampler2D mask;
uniform sampler2D blur;
uniform vec3 color;
uniform float strength;
varying vec2 vUv;
void main() {
  float m = texture2D(mask, vUv).r;
  float g = min(1.0, texture2D(blur, vUv).r * 1.9) * (1.0 - m);
  gl_FragColor = vec4(color, g * strength);
}`;

/** Halo colour (display sRGB, added over the finished picture). */
const GLOW_COLOR = new THREE.Color().setRGB(1, 0.9, 0.55, THREE.LinearSRGBColorSpace);
/** How far the halo reaches, in CSS px per blur step (two passes of 9 taps). */
const GLOW_STEP = 2.6;

/** Slices along the axis for a swept shape. */
const SWEEP_SLICES = 8;

/**
 * What a disc-like mesh sweeps out turning about its axis (its thinnest
 * size, through the middle of its box): a stack of short cylinders, each as
 * wide as the furthest of the triangles that cross its slice of the axis.
 * A wheel comes out a disc with its hub standing out of it, a gear a disc to
 * its tooth tips (a single convex hull ran from the rim to the hub's end).
 * @param {THREE.BufferGeometry} geo
 */
export function sweptShape(geo) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = /** @type {THREE.Box3} */ (geo.boundingBox);
  const size = box.getSize(new THREE.Vector3()).toArray();
  const c = box.getCenter(new THREE.Vector3()).toArray();
  const ax = size.indexOf(Math.min(...size));
  const [u, v] = [0, 1, 2].filter((i) => i !== ax);
  const lo = box.min.getComponent(ax), span = Math.max(1e-4, size[ax]);
  const r = new Float32Array(SWEEP_SLICES);
  const pos = geo.getAttribute("position");
  const idx = geo.index;
  const tris = (idx ? idx.count : pos.count) / 3;
  for (let t = 0; t < tris; t++) {
    let a0 = Infinity, a1 = -Infinity, rr = 0;
    for (let k = 0; k < 3; k++) {
      const i = idx ? idx.getX(t * 3 + k) : t * 3 + k;
      const a = pos.getComponent(i, ax), du = pos.getComponent(i, u) - c[u], dv = pos.getComponent(i, v) - c[v];
      a0 = Math.min(a0, a); a1 = Math.max(a1, a);
      rr = Math.max(rr, Math.hypot(du, dv));
    }
    const s0 = Math.max(0, Math.floor(((a0 - lo) / span) * SWEEP_SLICES));
    const s1 = Math.min(SWEEP_SLICES - 1, Math.floor(((a1 - lo) / span) * SWEEP_SLICES));
    for (let sl = s0; sl <= s1; sl++) r[sl] = Math.max(r[sl], rr);
  }
  /** @type {THREE.BufferGeometry[]} */
  const parts = [];
  const h = span / SWEEP_SLICES;
  const turn = new THREE.Matrix4();
  if (ax === 0) turn.makeRotationZ(-Math.PI / 2);
  else if (ax === 2) turn.makeRotationX(Math.PI / 2);
  for (let sl = 0; sl < SWEEP_SLICES; sl++) {
    if (r[sl] <= 0) continue;
    const g = new THREE.CylinderGeometry(r[sl], r[sl], h, 48, 1);
    g.translate(0, lo + (sl + 0.5) * h - c[ax], 0);
    g.applyMatrix4(turn);
    g.translate(c[0], c[1], c[2]);
    parts.push(g);
  }
  return parts.length ? mergeGeometries(parts) : geo;
}

export class HighlightGlow {
  constructor() {
    this.scene = new THREE.Scene();
    // the stand-ins take their placing from the parts (copied each frame)
    this.scene.matrixWorldAutoUpdate = false;
    this.white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    /** @type {Map<THREE.Mesh, THREE.Mesh>} part mesh → its stand-in */
    this.proxies = new Map();
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, type: THREE.UnsignedByteType });
    this.mask = rt();
    this.ping = rt();
    this.pong = rt();
    this.blur = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, step: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.glow = new THREE.ShaderMaterial({
      uniforms: {
        mask: { value: this.mask.texture }, blur: { value: this.pong.texture },
        color: { value: GLOW_COLOR }, strength: { value: 1 },
      },
      vertexShader: QUAD_VERT, fragmentShader: GLOW_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.blur);
    this.size = new THREE.Vector2();
    // a stand-in with no area, for warming up
    const none = new THREE.BufferGeometry();
    none.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    this.dummy = new THREE.Mesh(none, this.white);
    this.dummy.matrixAutoUpdate = false;
    this.dummy.frustumCulled = false;
  }

  /**
   * The stand-in for one part mesh, made on first use: the solid it sweeps
   * out turning (`turned`), or the mesh itself (the figure, the clutch's cord).
   * @param {THREE.Mesh} mesh @param {boolean} turned
   */
  proxy(mesh, turned) {
    let p = this.proxies.get(mesh);
    if (p) return p;
    p = new THREE.Mesh(turned ? sweptShape(mesh.geometry) : mesh.geometry, this.white);
    p.matrixAutoUpdate = false;
    p.frustumCulled = false;
    this.proxies.set(mesh, p);
    return p;
  }

  /**
   * Draw the halo over what is on the canvas already.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Camera} camera
   * @param {{mesh: THREE.Mesh, turned: boolean}[]} parts the highlighted part meshes that show
   * @param {number} t seconds, for the pulse
   * @param {boolean} [warm] draw it all with nothing in it (compiles the programs)
   */
  render(renderer, camera, parts, t, warm = false) {
    if (!parts.length && !warm) return;
    const buf = renderer.getDrawingBufferSize(this.size);
    // the mask at full size (its edge is the halo's inner edge), the blur at half
    if (this.mask.width !== buf.x || this.mask.height !== buf.y) this.mask.setSize(buf.x, buf.y);
    const w = Math.max(1, Math.round(buf.x / 2)), h = Math.max(1, Math.round(buf.y / 2));
    for (const r of [this.ping, this.pong]) if (r.width !== w || r.height !== h) r.setSize(w, h);
    this.scene.children.length = 0;
    for (const { mesh, turned } of parts) {
      const p = this.proxy(mesh, turned);
      p.matrixWorld.copy(mesh.matrixWorld);
      this.scene.children.push(p);
    }
    if (warm) this.scene.children.push(this.dummy);
    const was = { target: renderer.getRenderTarget(), auto: renderer.autoClear, alpha: renderer.getClearAlpha(), color: renderer.getClearColor(new THREE.Color()) };
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.mask);
    renderer.clear(true, false, false);
    renderer.render(this.scene, camera);
    // blur across, then down: steps in the half-size target's own texels
    const pr = renderer.getPixelRatio() / 2;
    const u = this.blur.uniforms;
    this.quad.material = this.blur;
    u.map.value = this.mask.texture;
    u.step.value.set((GLOW_STEP * pr) / w, 0);
    renderer.setRenderTarget(this.ping);
    this.quad.render(renderer);
    u.map.value = this.ping.texture;
    u.step.value.set(0, (GLOW_STEP * pr) / h);
    renderer.setRenderTarget(this.pong);
    this.quad.render(renderer);
    this.glow.uniforms.strength.value = warm ? 0 : 0.8 + 0.2 * Math.sin(t * 4);
    this.quad.material = this.glow;
    renderer.setRenderTarget(was.target);
    this.quad.render(renderer);
    renderer.setClearColor(was.color, was.alpha);
    renderer.autoClear = was.auto;
  }

  /** Compile the programs and make the targets: a frame of it that adds nothing. @param {THREE.WebGLRenderer} renderer @param {THREE.Camera} camera */
  warm(renderer, camera) {
    this.render(renderer, camera, [], 0, true);
  }
}

/**
 * An outline hull for a mesh: positions welded so the normals are smooth and
 * the pushed-out shell has no cracks at hard edges.
 * @param {THREE.Mesh} mesh
 */
export function makeHull(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", mesh.geometry.getAttribute("position"));
  if (mesh.geometry.index) g.setIndex(mesh.geometry.index);
  const welded = mergeVertices(g, 1e-4);
  welded.computeVertexNormals();
  const hull = new THREE.Mesh(welded, OUTLINES.ink);
  hull.name = `${mesh.name}.outline`;
  hull.castShadow = hull.receiveShadow = false;
  hull.userData.noAO = true;
  hull.renderOrder = -1;
  hull.visible = false;
  hull.raycast = () => {};
  return hull;
}

// The body in x-ray: a ghost of glass, not a wireframe (a cage of fine lines
// read as a debug view, and close on the gears as scratches over them). Faces
// turned to the camera are almost clear, faces seen edge on glow faintly in
// the lacquer's colour (a Fresnel rim), so the box keeps its shape; whatever
// is near the camera fades right out, so a close view of the gears is clean.
const GHOST_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const GHOST_FRAG = /* glsl */ `
uniform vec3 rim;
uniform vec3 fill;
uniform float opacity;
uniform vec2 fade;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float d = length(vView);
  float facing = abs(dot(normalize(vNormal), vView / d));
  float fres = pow(1.0 - facing, 3.0);
  float a = (0.012 + 0.5 * fres) * opacity * smoothstep(fade.x, fade.y, d);
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(fill, rim, fres), a);
}`;

/** How strong the ghost is at full (x-ray on, not taken apart). */
export const WIRE_OPACITY = 1;
/** The ghost fades out nearer the camera than this (chi): gone at x, full at y (the gears views look from 10-14 chi: the boards in front of them, layer on layer, made a red haze). */
const GHOST_FADE = new THREE.Vector2(10, 22);

const GHOST = new THREE.ShaderMaterial({
  uniforms: {
    rim: { value: new THREE.Color(0xffc9a8) },
    fill: { value: new THREE.Color(0xa8352a) },
    opacity: { value: WIRE_OPACITY },
    fade: { value: GHOST_FADE },
  },
  vertexShader: GHOST_VERT,
  fragmentShader: GHOST_FRAG,
  transparent: true,
  depthWrite: false,
});

/** The body as a see-through ghost, for x-ray. Its own material (its opacity fades with the body). @param {THREE.Mesh} mesh */
export function makeWire(mesh) {
  const ghost = new THREE.Mesh(mesh.geometry, GHOST.clone());
  ghost.name = `${mesh.name}.ghost`;
  ghost.castShadow = ghost.receiveShadow = false;
  ghost.userData.noAO = true;
  ghost.visible = false;
  ghost.renderOrder = 1;
  ghost.raycast = () => {};
  return ghost;
}

/** @param {THREE.Mesh} ghost @param {number} v 0..1 */
export function setGhostOpacity(ghost, v) {
  /** @type {THREE.ShaderMaterial} */ (ghost.material).uniforms.opacity.value = v;
}

/** How much of the circle the arc covers. */
const ARC = Math.PI * 1.55;
/** dash length along the arc (chi) */
const DASH = 0.7;

let dashTex = /** @type {THREE.CanvasTexture | null} */ (null);
/** Comet dashes: faint tail, bright head, gap. */
function dashTexture() {
  if (dashTex) return dashTex;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 4;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const g = ctx.createLinearGradient(0, 0, 44, 0);
  g.addColorStop(0, "rgba(255,255,255,0.15)");
  g.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 44, 4);
  dashTex = new THREE.CanvasTexture(c);
  dashTex.wrapS = THREE.RepeatWrapping;
  dashTex.colorSpace = THREE.SRGBColorSpace;
  return dashTex;
}

/**
 * A spin arc for one gear, set beside it in its parent's frame.
 */
export class SpinArc {
  /** local angle at the middle of the arc's gap */
  static GAP = ARC + (2 * Math.PI - ARC) / 2;

  /**
   * @param {number} radius chi
   * @param {THREE.Color} color
   * @param {number} [tube] chi
   */
  constructor(radius, color, tube = 0.085) {
    this.group = new THREE.Group();
    this.group.name = "spinArc";
    this.spin = new THREE.Group(); // mirrored for the other way round
    this.group.add(this.spin);
    const n = Math.max(3, Math.round((radius * ARC) / DASH));
    this.dashes = n / ARC; // dashes per radian
    const tex = dashTexture().clone();
    tex.repeat.set(n, 1);
    tex.needsUpdate = true;
    this.tex = tex;
    // tone-mapped like the rest of the scene: crisp dashes, not a glow the bloom smears into flames
    this.mat = new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0, depthWrite: false });
    this.headMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, Math.max(24, Math.round(radius * 40)), ARC), this.mat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(tube * 3.6, tube * 8, 16), this.headMat);
    // the cone's middle sits on the arc's end, pointing along it
    const a = ARC + (tube * 4) / radius;
    head.position.set(radius * Math.cos(a), radius * Math.sin(a), 0);
    head.rotation.z = a;
    for (const m of [ring, head]) {
      m.castShadow = m.receiveShadow = false;
      m.userData.noAO = true;
      m.raycast = () => {};
      m.renderOrder = 2;
      this.spin.add(m);
    }
    this.group.visible = false;
    this.sign = 1;
  }

  /**
   * @param {number} angle the gear's angle about its axis (rad, physical sense)
   * @param {number} omega rad/s
   * @param {number} act 0..1 how visible
   */
  update(angle, omega, act) {
    this.group.visible = act > 0.01;
    if (!this.group.visible) return;
    if (Math.abs(omega) > 0.05 && Math.sign(omega) !== this.sign) {
      this.sign = Math.sign(omega);
      this.spin.scale.y = this.sign;
    }
    // dashes ride with the rim: the head of each dash leads
    this.tex.offset.x = -angle * this.sign * this.dashes;
    this.mat.opacity = act;
    this.headMat.opacity = act;
  }
}

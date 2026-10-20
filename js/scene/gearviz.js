// What makes the gear train readable when you look inside (x-ray or taken
// apart): ink outlines round every gear (a back-face hull pushed out a few
// screen pixels, so it works on every quality tier without post-processing),
// a fine wireframe for the hidden body, and a spin arc beside each turning
// gear: dashes that move with the gear's rim and an arrowhead for the way it
// turns, fading in only while that gear is turning.

import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

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
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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

/** Ink round every gear; a lighter one for parts faded back; bright for the highlighted. */
export const OUTLINES = {
  ink: outlineMaterial(0x1d140c, 1.6, 1),
  faded: outlineMaterial(0x4a3d30, 1.2, 0.55),
  lit: outlineMaterial(0xfff6c8, 2, 1),
};
const BASE_WIDTH = new Map(Object.values(OUTLINES).map((m) => [m, m.uniforms.width.value]));

/**
 * Size the outlines for the canvas: call every frame (cheap).
 * @param {THREE.WebGLRenderer} renderer
 * @param {number} t seconds, for the highlight pulse
 */
export function updateOutlines(renderer, t) {
  renderer.getDrawingBufferSize(RES.value);
  const pr = renderer.getPixelRatio();
  for (const [m, w] of BASE_WIDTH) m.uniforms.width.value = w * pr;
  OUTLINES.lit.uniforms.width.value = (1.6 + 1.2 * (0.5 + 0.5 * Math.sin(t * 4))) * pr;
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

const SHELL_LINES = new THREE.LineBasicMaterial({ color: 0x2a1d12, transparent: true, opacity: 0.2, depthWrite: false });

/** The body as a fine wireframe, for x-ray. @param {THREE.Mesh} mesh */
export function makeWire(mesh) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 35), SHELL_LINES);
  lines.name = `${mesh.name}.wire`;
  lines.castShadow = lines.receiveShadow = false;
  lines.userData.noAO = true;
  lines.visible = false;
  lines.raycast = () => {};
  return lines;
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
  constructor(radius, color, tube = 0.13) {
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
    this.mat = new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.headMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, Math.max(24, Math.round(radius * 40)), ARC), this.mat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(tube * 3.2, tube * 7, 16), this.headMat);
    // the cone's middle sits on the arc's end, pointing along it
    const a = ARC + (tube * 3.5) / radius;
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

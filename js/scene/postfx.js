// Post-processing for the "high" tier: the scene renders into a multisampled
// half-float target, then ground-truth ambient occlusion (transparent things
// such as the x-ray shell and ground overlays are left out of it), a faint
// bloom on sunlit brass and lacquer, depth of field only when the camera is
// close in on the gears, and tone mapping + sRGB output last.
// Loaded lazily (dynamic import) so the first frame doesn't wait for it.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";

/**
 * What a lens and a sensor add: the corners fall off, a fine grain moves over
 * the picture and the edges fringe faintly. Grain and fringe go in close-ups
 * (depth of field on), where they would sit on the gears' outlines.
 */
const LensShader = {
  uniforms: { tDiffuse: { value: null }, seed: { value: 0 }, grain: { value: 1 }, aspect: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float seed;
    uniform float grain;
    uniform float aspect;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      d.x *= aspect;
      float r2 = dot(d, d);
      vec4 c = texture2D(tDiffuse, vUv);
      // lateral fringe, only towards the edges
      vec2 off = (vUv - 0.5) * r2 * 0.006 * grain;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.b = texture2D(tDiffuse, vUv - off).b;
      // natural fall-off of the lens
      c.rgb *= 1.0 - 0.32 * smoothstep(0.08, 0.75, r2);
      float n = fract(sin(dot(vUv * 1000.0 + seed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      c.rgb *= 1.0 + n * 0.045 * grain;
      gl_FragColor = c;
    }`,
};

/** Frames averaged while nothing moves (then a running mean over as many). */
const ACC_MAX = 16;

/** Halton (2, 3) point k, centred: −0.5..0.5. @param {number} k @param {number} b */
function halton(k, b) {
  let f = 1, r = 0;
  for (let i = k; i > 0; i = Math.floor(i / b)) {
    f /= b;
    r += f * (i % b);
  }
  return r - 0.5;
}

/**
 * While nothing moves, average the frames as they come (each drawn a fraction
 * of a pixel off, with the sun a fraction of a degree off): the edges settle
 * like a photo's and the chariot's shadow gets a real penumbra. Off (no cost)
 * while anything moves. Straight after the scene pass, before occlusion and
 * bloom.
 */
class AccumPass extends Pass {
  /** @param {number} w @param {number} h */
  constructor(w, h) {
    super();
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.hist = [new THREE.WebGLRenderTarget(w, h, opts), new THREE.WebGLRenderTarget(w, h, opts)];
    this.blend = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { cur: { value: null }, prev: { value: null }, w: { value: 1 } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform sampler2D cur; uniform sampler2D prev; uniform float w; varying vec2 vUv;
        void main() { gl_FragColor = mix(texture2D(prev, vUv), texture2D(cur, vUv), w); }`,
      depthTest: false,
      depthWrite: false,
    }));
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { src: { value: null } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform sampler2D src; varying vec2 vUv; void main() { gl_FragColor = texture2D(src, vUv); }",
      depthTest: false,
      depthWrite: false,
    }));
    /** frames the picture has been still for */
    this.n = 1;
    this.enabled = false;
  }

  /** @param {number} w @param {number} h */
  setSize(w, h) {
    for (const t of this.hist) t.setSize(w, h);
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.WebGLRenderTarget} writeBuffer
   * @param {THREE.WebGLRenderTarget} readBuffer
   */
  render(renderer, writeBuffer, readBuffer) {
    const [prev, next] = this.hist;
    const bm = /** @type {THREE.ShaderMaterial} */ (this.blend.material);
    bm.uniforms.cur.value = readBuffer.texture;
    bm.uniforms.prev.value = prev.texture;
    // frame 2 of a still starts the history (frame 1 is only the check that nothing moved)
    bm.uniforms.w.value = 1 / Math.min(this.n - 1, ACC_MAX);
    renderer.setRenderTarget(next);
    this.blend.render(renderer);
    /** @type {THREE.ShaderMaterial} */ (this.copy.material).uniforms.src.value = next.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(renderer);
    this.hist = [next, prev];
  }

  dispose() {
    for (const t of this.hist) t.dispose();
    this.blend.dispose();
    this.copy.dispose();
  }
}

/** Camera-to-target distance (chi) below which depth of field fades in. */
const DOF_NEAR = 24;

/**
 * GTAO that skips transparent meshes and sprites and the sky in its depth/normal pass,
 * and works at half resolution (occlusion is soft; full res cost ~14 ms a
 * frame at DPR 2 on a laptop GPU).
 */
class OpaqueGTAOPass extends GTAOPass {
  /** @param {number} w @param {number} h */
  setSize(w, h) {
    super.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.WebGLRenderTarget} writeBuffer
   * @param {THREE.WebGLRenderTarget} readBuffer
   * @param {number} deltaTime
   * @param {boolean} maskActive
   */
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    /** @type {THREE.Object3D[]} */
    const hidden = [];
    this.scene.traverseVisible((o) => {
      // sprites too (the name tags in the hold-hands demo): drawn with the
      // normal/depth override they come out as black blocks
      if (!(o instanceof THREE.Mesh || o instanceof THREE.Sprite)) return;
      const m = /** @type {THREE.Material} */ (o.material);
      if (m.transparent || o.name === "sky" || o.userData.noAO) hidden.push(o);
    });
    for (const o of hidden) o.visible = false;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    for (const o of hidden) o.visible = true;
  }
}

export class PostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {() => THREE.Vector3} target what the camera looks at (for focus)
   * @param {{signature?: () => number, jitter?: (k: number) => void, ready?: () => boolean}} [still] what tells a still
   *   picture (a number that changes whenever anything in view does), how
   *   to move the light for frame k of an average (0: back as it was), and
   *   whether the picture is final (every photographed texture asked for is in)
   */
  constructor(renderer, scene, camera, target, still = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.target = target;
    this.still = still;
    /** @type {number | null} */
    this.lastSig = null;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    const accum = new AccumPass(size.x * pr, size.y * pr);
    composer.addPass(accum);

    const ao = new OpaqueGTAOPass(scene, camera, size.x, size.y);
    ao.updateGtaoMaterial({ radius: 3, distanceExponent: 1.6, thickness: 3, scale: 2.4, samples: 8 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
    ao.blendIntensity = 1;
    // ?debug=ao shows the occlusion buffer alone (for tuning)
    const debug = new URLSearchParams(location.search).get("debug");
    if (debug === "ao") ao.output = GTAOPass.OUTPUT.Denoise;
    if (debug === "aoraw") ao.output = GTAOPass.OUTPUT.AO;
    if (debug === "depth") ao.output = GTAOPass.OUTPUT.Depth;
    if (debug === "normal") ao.output = GTAOPass.OUTPUT.Normal;
    if (debug === "noao") ao.enabled = false;
    /** average still pictures (?debug=noaccum: don't) */
    this.accumOn = debug !== "noaccum" && !!still.signature;
    composer.addPass(ao);

    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.55, 0.88);
    if (debug === "nobloom") bloom.enabled = false;
    composer.addPass(bloom);

    const dof = new BokehPass(scene, camera, { focus: 12, aperture: 0.0016, maxblur: 0.006 });
    dof.enabled = false;
    composer.addPass(dof);

    const lens = new ShaderPass(LensShader);
    if (debug === "nolens") lens.enabled = false;
    composer.addPass(lens);

    composer.addPass(new OutputPass());
    this.composer = composer;
    this.ao = ao;
    this.bloom = bloom;
    this.dof = dof;
    this.lens = lens;
    this.accum = accum;
    this.dofOn = true;
    this.setSize(size.x, size.y);
  }

  /** @param {number} w CSS px @param {number} h */
  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.lastSig = null;
    this.lens.uniforms.aspect.value = w / Math.max(1, h);
  }

  render() {
    const dist = this.camera.position.distanceTo(this.target());
    const u = /** @type {Record<string, THREE.IUniform>} */ (/** @type {any} */ (this.dof).uniforms);
    const close = this.dofOn && dist < DOF_NEAR;
    if (close !== this.dof.enabled) document.body.dataset.dof = close ? "on" : "off";
    this.dof.enabled = close;
    if (close) {
      u.focus.value = dist;
      u.aperture.value = 0.0022 * (1 - dist / DOF_NEAR) + 0.0004;
    }
    const lu = this.lens.uniforms;
    lu.grain.value = close ? 0 : 1;
    lu.seed.value = (lu.seed.value + 0.6180339) % 1;
    const acc = this.accum;
    let k = 0;
    if (this.accumOn && this.still.signature) {
      this.scene.updateMatrixWorld();
      this.camera.updateMatrixWorld();
      const sig = this.still.signature();
      if (sig !== this.lastSig) {
        this.lastSig = sig;
        delete document.body.dataset.still;
        acc.n = 0;
      }
      acc.n++;
      // body[data-still]: the average is full and the photographed textures
      // are all in (for tests and screenshots: the picture won't change again)
      if (acc.n > ACC_MAX && !document.body.dataset.still && (this.still.ready?.() ?? true)) document.body.dataset.still = "settled";
      // the first still frame only starts the history: the one before may have moved
      acc.enabled = acc.n > 1;
      if (acc.enabled) {
        k = acc.n;
        const rt = this.composer.readBuffer;
        this.camera.setViewOffset(rt.width, rt.height, halton(k, 2), halton(k, 3), rt.width, rt.height);
        this.still.jitter?.(k);
      } else acc.n = 1;
    }
    this.composer.render();
    if (k) {
      this.camera.clearViewOffset();
      this.still.jitter?.(0);
    }
  }

  /** Draw a frame through every pass (depth of field too), compiling them all. */
  warm() {
    const on = this.dof.enabled;
    this.dof.enabled = true;
    // the still-picture average too (its two programs), as frame 2 of one
    const acc = this.accum;
    acc.enabled = this.accumOn;
    acc.n = 2;
    this.composer.render();
    acc.enabled = false;
    acc.n = 1;
    this.lastSig = null;
    this.dof.enabled = on;
  }

  dispose() {
    this.composer.dispose();
    this.ao.dispose();
    this.bloom.dispose();
    this.dof.dispose();
    this.lens.dispose();
    this.accum.dispose();
  }
}

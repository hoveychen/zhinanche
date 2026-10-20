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

/** Camera-to-target distance (chi) below which depth of field fades in. */
const DOF_NEAR = 24;

/**
 * GTAO that skips transparent meshes and the sky in its depth/normal pass,
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
      if (!(o instanceof THREE.Mesh)) return;
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
   */
  constructor(renderer, scene, camera, target) {
    this.renderer = renderer;
    this.camera = camera;
    this.target = target;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));

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
    composer.addPass(ao);

    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.55, 0.88);
    if (debug === "nobloom") bloom.enabled = false;
    composer.addPass(bloom);

    const dof = new BokehPass(scene, camera, { focus: 12, aperture: 0.0016, maxblur: 0.006 });
    dof.enabled = false;
    composer.addPass(dof);

    composer.addPass(new OutputPass());
    this.composer = composer;
    this.ao = ao;
    this.bloom = bloom;
    this.dof = dof;
    this.dofOn = true;
    this.setSize(size.x, size.y);
  }

  /** @param {number} w CSS px @param {number} h */
  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
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
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
    this.ao.dispose();
    this.bloom.dispose();
    this.dof.dispose();
  }
}

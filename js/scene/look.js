// Everything that makes the view look real, behind one object so world.js
// only needs a few calls: sky, light and shadows (environment.js), courtyard
// (courtyard.js, ground.js), chariot materials (materials.js), post-processing
// (postfx.js, high tier only) and the quality tiers (quality.js).

import * as THREE from "three";
import { Environment, contactShadow } from "./environment.js";
import { Courtyard } from "./courtyard.js";
import { dressGround, makeGround } from "./ground.js";
import { dressChariot, loadTextures } from "./materials.js";
import { FrameGovernor, SETTINGS, pickQuality } from "./quality.js";

/** @import { Quality } from "./quality.js" */
/** @import { Textures } from "./materials.js" */
/** @import { PostFX } from "./postfx.js" */

/**
 * @typedef {object} LookHost the parts of World the look works on
 * @property {THREE.WebGLRenderer} renderer
 * @property {THREE.Scene} scene
 * @property {THREE.PerspectiveCamera} camera
 * @property {{target: THREE.Vector3}} controls
 * @property {() => void} resize
 */

function device() {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const nav = /** @type {Navigator & {connection?: {saveData?: boolean}}} */ (navigator);
  return { coarse, shortSide: Math.min(screen.width, screen.height), saveData: !!nav.connection?.saveData };
}

export class Look {
  /** @param {LookHost} host */
  constructor(host) {
    this.host = host;
    const { renderer, scene, camera } = host;
    const pick = pickQuality(location.search, device());
    /** @type {Quality} */
    this.quality = pick.quality;
    const s = SETTINGS[this.quality];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, s.maxPixelRatio));
    this.env = new Environment(renderer, scene, { shadowSize: s.shadowSize, clouds: true });
    this.ground = makeGround();
    scene.add(this.ground);
    this.yard = new Courtyard();
    scene.add(this.yard.group);
    camera.far = 2600;
    camera.updateProjectionMatrix();
    /** @type {PostFX | null} */
    this.postfx = null;
    this.postfxLoading = false;
    this.governor = pick.forced ? null : new FrameGovernor(this.quality, (q) => this.setQuality(q));
    document.body.dataset.quality = this.quality;
    /** @type {Promise<Textures>} */
    this.texReady = loadTextures(renderer, s.textures).then((tex) => {
      dressGround(this.ground, tex);
      this.yard.dress(tex);
      this.env.bake(tex);
      return tex;
    });
  }

  /** The sun light (its shadow follows the chariot). */
  get sun() {
    return this.env.sun;
  }

  /** Swap a loaded chariot's flat colours for real materials. @param {THREE.Object3D} root */
  async dress(root) {
    dressChariot(root, await this.texReady);
  }

  /** Contact shadow under the chariot. @param {THREE.Object3D} holder */
  attach(holder) {
    holder.add(contactShadow());
  }

  /** @param {number} x @param {number} z chariot position (world) */
  follow(x, z) {
    this.env.follow(x, z);
  }

  /** @param {number} dt */
  update(dt) {
    this.env.update(dt);
  }

  render() {
    const { renderer, scene, camera } = this.host;
    this.governor?.tick(performance.now());
    if (SETTINGS[this.quality].postfx && !this.postfx && !this.postfxLoading) this.#loadPostfx();
    if (this.postfx) this.postfx.render();
    else renderer.render(scene, camera);
  }

  /** @param {number} w CSS px @param {number} h */
  resize(w, h) {
    this.postfx?.setSize(w, h);
  }

  async #loadPostfx() {
    this.postfxLoading = true;
    try {
      const { PostFX } = await import("./postfx.js");
      if (!SETTINGS[this.quality].postfx) return;
      const { renderer, scene, camera, controls } = this.host;
      this.postfx = new PostFX(renderer, scene, camera, () => controls.target);
    } catch (err) {
      console.warn("post-processing unavailable", err);
      this.quality = "medium";
      document.body.dataset.quality = this.quality;
    } finally {
      this.postfxLoading = false;
    }
  }

  /** Step to a tier (the governor calls this when frames are slow). @param {Quality} q */
  setQuality(q) {
    this.quality = q;
    document.body.dataset.quality = q;
    const s = SETTINGS[q];
    if (!s.postfx && this.postfx) {
      this.postfx.dispose();
      this.postfx = null;
    }
    this.env.setShadowSize(s.shadowSize);
    this.host.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, s.maxPixelRatio));
    this.host.resize();
  }
}

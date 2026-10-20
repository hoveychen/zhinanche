// Everything that makes the view look real, behind one object so world.js
// only needs a few calls: sky, light and shadows (environment.js), courtyard
// (courtyard.js, ground.js), chariot materials (materials.js), post-processing
// (postfx.js, high tier only) and the quality tiers (quality.js).

import * as THREE from "three";
import { Environment, SetShadow, contactShadow } from "./environment.js";
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
    // Sun shadows of the courtyard, baked once it exists (see render).
    this.setShadow = new SetShadow(this.quality === "lite" ? 1024 : 2048, 240);
    this.ground = makeGround();
    this.setShadow.patch(/** @type {THREE.Material} */ (this.ground.material));
    scene.add(this.ground);
    /** where the chariot is: the courtyard, gate and ground ride along */
    this.rider = new THREE.Vector2();
    // The courtyard is built after the chariot's first frames (see render), in
    // idle slices: ~50 ms of main thread (~170 ms at 4x CPU throttle) in all.
    /** @type {Courtyard | null} */
    this.yard = null;
    this.frames = 0;
    /** @type {Textures | null} */
    this.sceneTex = null;
    camera.far = 2600;
    camera.updateProjectionMatrix();
    /** @type {THREE.Mesh[]} */
    this.chariotMeshes = [];
    /** @type {PostFX | null} */
    this.postfx = null;
    this.postfxLoading = false;
    this.governor = pick.forced ? null : new FrameGovernor(this.quality, (q) => this.setQuality(q));
    document.body.dataset.quality = this.quality;
    const tex = loadTextures(renderer, s.textures);
    /** @type {Promise<Textures>} */
    this.chariotTex = tex.chariot;
    /** @type {Promise<Textures>} */
    this.texReady = tex.scene.then((tex) => {
      dressGround(this.ground, tex);
      this.sceneTex = tex;
      this.yard?.dress(tex);
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
    dressChariot(root, await this.chariotTex);
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) this.chariotMeshes.push(o);
    });
  }

  /** Contact shadow under the chariot. @param {THREE.Object3D} holder */
  attach(holder) {
    holder.add(contactShadow());
  }

  /** @param {number} x @param {number} z chariot position (world) */
  follow(x, z) {
    this.rider.set(x, z);
    this.env.follow(x, z);
    this.ground.position.set(x, 0, z);
    this.yard?.group.position.set(x, 0, z);
    this.setShadow.move(x, z);
  }

  /**
   * Build the courtyard in idle slices, compile its shaders off the frame,
   * then put it round the chariot and bake its shadows.
   */
  async #buildYard() {
    const { scene, renderer, camera } = this.host;
    const idle = () =>
      new Promise((done) => {
        if (typeof requestIdleCallback === "function") requestIdleCallback(() => done(undefined), { timeout: 120 });
        else setTimeout(done, 16);
      });
    const yard = await Courtyard.build({ lite: this.quality === "lite" }, idle);
    if (this.sceneTex) yard.dress(this.sceneTex);
    const gate = scene.getObjectByName("landmark");
    for (const m of Object.values(yard.materials)) this.setShadow.patch(m);
    gate?.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) this.setShadow.patch(o.material);
    });
    yard.group.position.set(this.rider.x, 0, this.rider.y);
    // Compile the new programs (and the patched ground's and gate's) a mesh at
    // a time, instead of stalling the first frame that draws them: three
    // creates every program of a compile call at once (~300 ms at 4x throttle).
    for (const o of [...yard.group.children, this.ground, ...(gate ? [gate] : [])]) {
      await renderer.compileAsync(o, camera, scene).catch(() => {});
      await idle();
    }
    this.yard = yard;
    yard.group.position.set(this.rider.x, 0, this.rider.y);
    scene.add(yard.group);
    const hills = yard.group.getObjectByName("courtyard.hills");
    if (hills) hills.visible = false;
    this.setShadow.move(this.rider.x, this.rider.y);
    this.setShadow.bake(renderer, gate ? [yard.group, gate] : [yard.group]);
    if (hills) hills.visible = true;
  }

  /** @param {number} dt */
  update(dt) {
    this.env.update(dt);
  }

  render() {
    const { renderer, scene, camera } = this.host;
    if (++this.frames === 3) void this.#buildYard();
    this.governor?.tick(performance.now());
    // Parts faded out for the x-ray view stop casting shadows, so the gears
    // inside aren't left in the shade of a body you can't see.
    for (const o of this.chariotMeshes) {
      const m = /** @type {THREE.Material} */ (o.material);
      o.castShadow = !(m.transparent && m.opacity < 0.5);
    }
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

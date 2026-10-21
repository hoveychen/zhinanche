// Everything that makes the view look real, behind one object so world.js
// only needs a few calls: sky, light and shadows (environment.js), courtyard
// (courtyard.js, ground.js), chariot materials (materials.js), post-processing
// (postfx.js, high tier only) and the quality tiers (quality.js).

import * as THREE from "three";
import { Environment, SetShadow, contactShadow } from "./environment.js";
import { Courtyard } from "./courtyard.js";
import { dressGround, makeGround, photoGround } from "./ground.js";
import { dressChariot, loadTextures, photoWood } from "./materials.js";
import { meanOf } from "./photo.js";
import { AGE_ORIGIN, age } from "./aging.js";
import { FrameGovernor, SETTINGS, pickQuality } from "./quality.js";
import { Photos } from "./photo.js";

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
    // The courtyard is built while the loading note is up (World.load calls
    // buildYard), so the first picture is the whole scene, not a bare floor
    // the court pops into a second later.
    /** @type {Courtyard | null} */
    this.yard = null;
    /** @type {Promise<void> | undefined} */
    this.yardBuilt = undefined;
    /** @type {() => void} */
    this.yardIsReady = () => {};
    /** resolves once the courtyard is up (not started by waiting on it) */
    this.yardReady = new Promise((r) => (this.yardIsReady = () => r(undefined)));
    this.frames = 0;
    /** @type {Textures | null} */
    this.sceneTex = null;
    camera.far = 2600;
    camera.updateProjectionMatrix();
    /** @type {THREE.Mesh[]} */
    this.chariotMeshes = [];
    /** @type {import("./photo.js").PhotoSet | null} the photographed wood, once it is up */
    this.woodPhoto = null;
    /** @type {PostFX | null} */
    this.postfx = null;
    /** stepping down off post-processing, once its programs are compiled */
    /** @type {Promise<void> | null} */
    this.dropping = null;
    /** after that step: what was compiled for the passes only is compiled again (set by the world) */
    this.onDrop = () => {};
    /** @type {Promise<void> | null} */
    this.postfxLoading = null;
    this.governor = pick.forced ? null : new FrameGovernor(this.quality, (q) => this.setQuality(q));
    document.body.dataset.quality = this.quality;
    const tex = loadTextures(renderer, s.textures);
    /** the photographed sky and surfaces, coming in after the first picture */
    this.photos = new Photos(renderer, s.textures);
    /** @type {Promise<Textures>} */
    this.chariotTex = tex.chariot;
    /** @type {Promise<Textures>} */
    // fetched alongside the model, ready for warm()
    if (s.postfx) void this.#loadPostfx();
    this.texReady = tex.scene.then((tex) => {
      dressGround(this.ground, tex);
      this.sceneTex = tex;
      this.env.bake(tex);
      return tex;
    });
    void this.#loadPhotos();
  }

  /** Swap each photographed set in as it is uploaded (sky first: it is the smallest). */
  async #loadPhotos() {
    const done = (/** @type {string} */ part) => {
      const now = (document.body.dataset.photo ?? "").split(" ").filter(Boolean);
      now.push(part);
      document.body.dataset.photo = now.join(" ");
    };
    /** @template T @param {string} name @param {Promise<T>} p */
    const safe = (name, p) => p.catch((err) => {
      console.warn(`photographed ${name} unavailable`, err);
      return null;
    });
    const sky = safe("sky", this.photos.sky());
    // sizes [albedo, normal, arm] for the full and lite tiers (tools/assets/build_photo.py makes these)
    const sets = {
      ground: safe("ground", this.photos.surface("ground", { full: [1024, 1024, 1024], lite: [1024, 1024, 512] })),
      plaster: safe("plaster", this.photos.surface("plaster", { full: [1024, 1024, 512], lite: [512, 512, 256] })),
      roof: safe("roof", this.photos.surface("roof", { full: [1024, 512, 512], lite: [512, 512, 256] })),
      wood: safe("wood", this.photos.surface("wood", { full: [1024, 1024, 0], lite: [512, 512, 0] })),
    };
    // A sky decoded before the textures are made (the usual case) goes up at
    // once and is in the environment map's first bake; one that comes later
    // costs a second bake (~20 ms on a throttled CPU), on a frame of its own.
    const early = sky.then((s) => {
      if (s && !this.sceneTex) {
        this.env.setPhoto(s, true);
        done("sky");
        return true;
      }
      return false;
    });
    const tex = await this.texReady;
    /** @param {string} name @param {Promise<any>} p @param {(s: any) => unknown} on */
    const put = async (name, p, on) => {
      const got = await p;
      if (!got) return;
      // the swap on a frame of its own, after the uploads
      await (await this.photos.later(() => on(got)));
      done(name);
    };
    await Promise.all([
      early.then((was) => (was ? undefined : put("sky", sky, (s) => this.env.setPhoto(s)))),
      put("ground", sets.ground, (s) => photoGround(this.ground, s, meanOf(tex.stone))),
      put("wood", sets.wood, async (s) => {
        this.woodPhoto = s;
        photoWood(this.chariotMeshes, s, await this.chariotTex);
      }),
      this.yardReady.then(() => Promise.all([
        put("plaster", sets.plaster, (s) => this.yard?.photo("plaster", s)),
        put("roof", sets.roof, (s) => this.yard?.photo("roof", s)),
      ])),
    ]);
  }

  /** The sun light (its shadow follows the chariot). */
  get sun() {
    return this.env.sun;
  }

  /** Swap a loaded chariot's flat colours for real materials. @param {THREE.Object3D} root */
  async dress(root) {
    dressChariot(root, await this.chariotTex);
    /** @type {THREE.Mesh[]} */
    const meshes = [];
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    this.chariotMeshes.push(...meshes);
    if (this.woodPhoto) photoWood(meshes, this.woodPhoto, await this.chariotTex);
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
    AGE_ORIGIN.value.set(x, 0, z);
  }

  /**
   * Build the courtyard in short slices, compile its shaders, then put it
   * round the chariot and bake its shadows. It runs while the loading note is
   * up (World.load), so nothing is drawing yet: slices only give the model's
   * download and parse a turn, and the programs are all compiled in one go.
   */
  async #buildYard() {
    const { scene, renderer } = this.host;
    let t0 = performance.now();
    const slice = () => {
      if (performance.now() - t0 < 12) return Promise.resolve();
      return new Promise((done) => setTimeout(() => {
        t0 = performance.now();
        done(undefined);
      }));
    };
    const yard = await Courtyard.build({ lite: this.quality === "lite" }, slice);
    // dressed before it is compiled: the textures change its programs
    const tex = this.sceneTex ?? (await this.texReady);
    yard.dress(tex);
    yard.age(tex.clouds);
    const gate = scene.getObjectByName("landmark");
    for (const m of Object.values(yard.materials)) this.setShadow.patch(m);
    gate?.traverse((o) => {
      if (!(o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial)) return;
      const kind = o.material.userData.ageKind;
      if (kind) age(o.material, kind, tex.clouds);
      this.setShadow.patch(o.material);
    });
    yard.group.position.set(this.rider.x, 0, this.rider.y);
    await Promise.all([yard.group, this.ground, ...(gate ? [gate] : [])].map((o) => this.compile(o)));
    this.yard = yard;
    yard.group.position.set(this.rider.x, 0, this.rider.y);
    scene.add(yard.group);
    const hills = yard.group.getObjectByName("courtyard.hills");
    if (hills) hills.visible = false;
    this.setShadow.move(this.rider.x, this.rider.y);
    this.setShadow.bake(renderer, gate ? [yard.group, gate] : [yard.group]);
    if (hills) hills.visible = true;
    document.body.dataset.scene = "ready";
    this.yardIsReady();
  }

  /** @param {number} dt */
  update(dt) {
    this.env.update(dt);
  }

  /**
   * The courtyard, built once: World.load starts it while the chariot model
   * is still coming, so the first picture already has it.
   * @returns {Promise<void>}
   */
  buildYard() {
    this.yardBuilt ??= this.#buildYard().catch((err) => console.warn("courtyard unavailable", err));
    return this.yardBuilt;
  }

  render() {
    const { renderer, scene, camera } = this.host;
    if (++this.frames === 3) void this.buildYard();
    this.governor?.tick(performance.now());
    this.photos.tick();
    // Parts faded out for the x-ray view stop casting shadows, so the gears
    // inside aren't left in the shade of a body you can't see.
    for (const o of this.chariotMeshes) {
      const m = /** @type {THREE.Material} */ (o.material);
      o.castShadow = !(m.transparent && m.opacity < 0.5);
    }
    if (SETTINGS[this.quality].postfx && !this.postfx && !this.postfxLoading) void this.#loadPostfx();
    if (this.postfx) this.postfx.render();
    else renderer.render(scene, camera);
  }

  /**
   * Before the first picture (the loading note is still up), so the first
   * frames after it goes, and the first close-up, don't stall on compiles
   * (~150–250 ms on a laptop). Two halves: the post-processing passes (depth
   * of field too) need nothing else and are drawn once while the textures
   * are still being made; the scene's own programs are compiled once its
   * textures are on (they change the programs).
   */
  async warmPasses() {
    if (SETTINGS[this.quality].postfx && !this.postfx) await (this.postfxLoading || this.#loadPostfx());
    this.postfx?.warm();
  }

  /**
   * The second half of warming up: every program in the scene, then one
   * frame drawn (it uploads the textures and fills the shadow maps).
   */
  async warm() {
    const { renderer, scene, camera } = this.host;
    await this.compile(scene);
    if (this.postfx) this.postfx.render();
    else renderer.render(scene, camera);
  }

  /** Compile a model that is not on show yet (the other chariot). @param {THREE.Object3D} o */
  precompile(o) {
    return this.compile(o);
  }

  /**
   * Compile the programs `o` is drawn with, as it is really drawn: with
   * post-processing that is into the passes' buffer, not the screen (tone
   * mapping and colour space are part of a program, so compiling for the
   * screen made programs the frames never used). The programs are made at
   * once; the promise waits for them to finish.
   * @param {THREE.Object3D} o
   * @param {boolean} [screen] for the screen even with post-processing (about to drop it)
   */
  compile(o, screen = false) {
    const { renderer, scene, camera } = this.host;
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(this.postfx && !screen ? this.postfx.composer.readBuffer : null);
    const done = renderer.compileAsync(o, camera, scene).catch(() => {});
    renderer.setRenderTarget(was);
    return done;
  }

  /** @param {number} w CSS px @param {number} h */
  resize(w, h) {
    this.postfx?.setSize(w, h);
  }

  /** @returns {Promise<void>} */
  #loadPostfx() {
    this.postfxLoading = (async () => {
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
        this.postfxLoading = null;
      }
    })();
    return this.postfxLoading;
  }

  /** Step to a tier (the governor calls this when frames are slow). @param {Quality} q */
  setQuality(q) {
    if (!SETTINGS[q].postfx && this.postfx) {
      // Without the passes every program is drawn to the screen, not into
      // their buffer: a new program each (tone mapping and colour space are
      // part of it). Made all at once on the next frame, they froze the view
      // for 1–1.7 s a few seconds in, just as a child set off driving. They
      // are compiled in the background first; the passes draw on meanwhile.
      this.dropping ??= this.compile(this.host.scene, true).then(() => {
        this.dropping = null;
        this.#setQuality(q);
        this.onDrop();
      });
      return;
    }
    this.#setQuality(q);
  }

  /** @param {Quality} q */
  #setQuality(q) {
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

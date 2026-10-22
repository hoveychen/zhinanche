// Everything that makes the view look real, behind one object so world.js
// only needs a few calls: sky, light and shadows (environment.js), courtyard
// (courtyard.js, ground.js), chariot materials (materials.js), post-processing
// (postfx.js, high tier only) and the quality tiers (quality.js).

import * as THREE from "three";
import { Environment, SetShadow, contactShadow } from "./environment.js";
import { Courtyard } from "./courtyard.js";
import { dressGround, makeGround, photoGround } from "./ground.js";
import { chariotAO, dressChariot, loadTextures, photoIron, photoLacquer, photoMurals, photoWood } from "./materials.js";
import { meanOf } from "./photo.js";
import { AGE_ORIGIN, age } from "./aging.js";
import { FrameGovernor, SETTINGS, pickQuality } from "./quality.js";
import { Photos } from "./photo.js";
import { BakedAO } from "./bakedao.js";

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

/** @returns {import("./quality.js").Device} */
function device() {
  const mq = (/** @type {string} */ q) => typeof matchMedia === "function" && matchMedia(q).matches;
  // touch-first: the main pointer is a finger, or a finger is the only way in
  // and nothing hovers (an iPad with a trackpad still says coarse somewhere)
  const coarse = mq("(pointer: coarse)") || (mq("(any-pointer: coarse)") && !mq("(hover: hover)"));
  const nav = /** @type {Navigator & {connection?: {saveData?: boolean}, deviceMemory?: number}} */ (navigator);
  return {
    coarse,
    shortSide: Math.min(screen.width, screen.height),
    saveData: !!nav.connection?.saveData,
    cores: nav.hardwareConcurrency || undefined,
    memory: nav.deviceMemory,
  };
}

/**
 * three.js's opaque order (painterSortStable), except that the chariot's
 * parts go first, as one block, those with the same colour texture next to
 * each other. The rig gives every part its own material, in model order, so
 * parts with the photographed wood and parts with the painted grain came in
 * turns, and each turn re-sent two texture matrices and rebound textures
 * (~40 more GL calls a frame). Everything else keeps three's order: grouping
 * the courtyard's by texture too put coplanar faces in another order, and
 * the gate's doorways striped.
 * @param {any} a @param {any} b render items
 */
function chariotFirst(a, b) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  const ca = a.material.userData.chariot === true, cb = b.material.userData.chariot === true;
  if (ca !== cb) return ca ? -1 : 1;
  if (ca) {
    const ta = a.material.map?.id ?? -1, tb = b.material.map?.id ?? -1;
    if (ta !== tb) return ta - tb;
  }
  if (a.material.id !== b.material.id) return a.material.id - b.material.id;
  if (a.z !== b.z) return a.z - b.z;
  return a.id - b.id;
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
    renderer.setOpaqueSort(chariotFirst);
    this.env = new Environment(renderer, scene, { shadowSize: s.shadowSize, clouds: true });
    // Sun shadows of the courtyard, baked once it exists (see render).
    this.setShadow = new SetShadow(this.quality === "lite" ? 1024 : 2048, 240);
    this.setShadow.init(renderer);
    // Sky occlusion of the courtyard, baked with the shadows (?debug=nobao: not baked)
    this.bakedAO = new BakedAO(this.quality === "lite" ? 512 : 1024, 240);
    this.ground = makeGround();
    this.setShadow.patch(/** @type {THREE.Material} */ (this.ground.material));
    this.bakedAO.patch(/** @type {THREE.Material} */ (this.ground.material));
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
    /** @type {number | undefined} when the first frame was drawn (performance.now) */
    this.shownAt = undefined;
    /** @type {Textures | null} */
    this.sceneTex = null;
    camera.far = 2600;
    camera.updateProjectionMatrix();
    /** @type {THREE.Mesh[]} */
    this.chariotMeshes = [];
    /** @type {import("./photo.js").PhotoSet | null} the photographed wood, once it is up */
    this.woodPhoto = null;
    /** @type {import("./photo.js").PhotoSet | null} the photographed lacquer, once it is up */
    this.lacquerPhoto = null;
    /** @type {import("./photo.js").PhotoSet | null} the photographed rusty iron, once it is up */
    this.ironPhoto = null;
    /** @type {Record<string, THREE.Texture> | null} the box's paintings, once they are up */
    this.muralTex = null;
    /** @type {Map<string, Promise<THREE.Texture | null>>} each chariot's baked occlusion atlas, by mechanism */
    this.atlases = new Map();
    /** @type {THREE.Object3D | null} what carries the chariot (attach) */
    this.holder = null;
    /** frames the chariot has stood still for (render) */
    this.stillFrames = 0;
    this.holderWas = new Float32Array(16);
    /** @type {PostFX | null} */
    this.postfx = null;
    /** @type {THREE.Vector3 | null} the sun's place while it is moved for a still picture */
    this.sunHome = null;
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
    /** every photographed set asked for is in (or failed) */
    this.photosIn = false;
    document.body.dataset.photoState = "loading";
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

  /**
   * Swap the photographed sets in, then mark the picture final: body
   * [data-photo-state=in], and the still-picture average may say settled
   * (postfx.js). A set that fails counts as in (it stays procedural).
   */
  async #loadPhotos() {
    try {
      await this.#swapPhotos();
    } finally {
      this.photosIn = true;
      document.body.dataset.photoState = "in";
    }
  }

  /** Swap each photographed set in as it is uploaded (sky first: it is the smallest). */
  async #swapPhotos() {
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
    const since = performance.now();
    // sizes [albedo, normal, arm] for the full and lite tiers (tools/assets/build_photo.py makes these)
    const sets = {
      ground: safe("ground", this.photos.surface("ground", { full: [1024, 1024, 1024], lite: [1024, 1024, 512] })),
      plaster: safe("plaster", this.photos.surface("plaster", { full: [1024, 1024, 512], lite: [512, 512, 256] })),
      roof: safe("roof", this.photos.surface("roof", { full: [1024, 512, 512], lite: [512, 512, 256] })),
      dougong: safe("dougong", this.photos.surface("dougong", { full: [320, 320, 320], lite: [160, 160, 160] })),
      wood: safe("wood", this.photos.surface("wood", { full: [1024, 1024, 0], lite: [512, 512, 0] })),
      // the lacquer's gloss: swapped in with the wood (one entry in body[data-photo])
      lacquer: safe("lacquer", this.photos.surface("lacquer", { full: [1024, 1024, 1024], lite: [512, 512, 512] })),
      iron: safe("iron", this.photos.surface("iron", { full: [512, 512, 512], lite: [512, 512, 512] })),
      trees: safe("trees", this.photos.trees()),
      // the paintings (2048 × 682 each) going up with their mipmaps came a
      // second in, while driving: like the occlusion atlas (#atlas), they
      // wait till the chariot has stood still a moment, or 8 s
      murals: safe("murals", this.photos.murals(() => this.stillFrames > 20 || performance.now() - since > 8000)),
    };
    // A sky decoded before the textures are made (the usual case) goes up at
    // once and is in the environment map's first bake; one that comes later
    // costs a second bake (~12 ms on a 4×-throttled CPU), on a frame of its own.
    const early = sky.then((s) => {
      if (s && !this.sceneTex) {
        this.env.setPhoto(s, true);
        done("sky");
        return true;
      }
      return false;
    });
    const first = safe("ground (small)", this.photos.firstGround());
    const tex = await this.texReady;
    const stone = meanOf(tex.stone);
    // The small paving goes down at once, normally before the first picture
    // (World.load waits for the courtyard too), so the floor never jumps from
    // the procedural slabs to the photo: the full set only sharpens it.
    let groundFull = false;
    void first.then((s) => {
      if (s && !groundFull) photoGround(this.ground, s, stone);
    });
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
      put("ground", sets.ground, (s) => {
        groundFull = true;
        photoGround(this.ground, s, stone);
      }),
      put("wood", Promise.all([sets.wood, sets.lacquer]), async ([wood, lacquer]) => {
        const tex = await this.chariotTex;
        if (wood) {
          this.woodPhoto = wood;
          photoWood(this.chariotMeshes, wood, tex);
        }
        if (lacquer) {
          this.lacquerPhoto = lacquer;
          photoLacquer(this.chariotMeshes, lacquer, tex);
        }
      }),
      put("iron", sets.iron, (s) => {
        this.ironPhoto = s;
        photoIron(this.chariotMeshes, s);
      }),
      put("murals", sets.murals, (s) => {
        this.muralTex = s;
        photoMurals(this.chariotMeshes, s);
      }),
      this.yardReady.then(() => Promise.all([
        put("plaster", sets.plaster, (s) => this.yard?.photo("plaster", s)),
        put("roof", sets.roof, (s) => this.yard?.photo("roof", s)),
        put("dougong", sets.dougong, (s) => this.yard?.photo("dougong", s)),
        put("trees", sets.trees, (s) => this.yard?.trees?.set(s.cards, s.atlases)),
      ])),
    ]);
    this.photos.close();
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
      if (!(o instanceof THREE.Mesh)) return;
      meshes.push(o);
      // drawn as a block (chariotFirst); the rig's clones keep the mark
      for (const m of [o.material].flat()) m.userData.chariot = true;
    });
    this.chariotMeshes.push(...meshes);
    if (this.woodPhoto) photoWood(meshes, this.woodPhoto, await this.chariotTex);
    if (this.lacquerPhoto) photoLacquer(meshes, this.lacquerPhoto, await this.chariotTex);
    if (this.ironPhoto) photoIron(meshes, this.ironPhoto);
    if (this.muralTex) photoMurals(meshes, this.muralTex);
    /** @type {string | undefined} */
    let mechanism;
    root.traverse((o) => (mechanism ??= o.userData.mechanism));
    if (mechanism) {
      for (const o of meshes) o.userData.mechanism = mechanism;
      void this.#atlas(mechanism, meshes);
    }
  }

  /**
   * The chariot's baked occlusion atlas (one file per mechanism, fetched once)
   * onto its meshes, on a frame of its own once it is uploaded.
   * @param {string} mechanism @param {THREE.Mesh[]} meshes
   */
  async #atlas(mechanism, meshes) {
    // A 1024² atlas and its mipmaps going up took a 24–28 ms frame, and it
    // came while driving (the other chariot is fetched then too): upload and
    // swap wait till the chariot has stood still a moment (or, if it never
    // does, as on the home page's drive, 8 s).
    const since = performance.now();
    const calm = () => this.stillFrames > 20 || performance.now() - since > 8000;
    let p = this.atlases.get(mechanism);
    if (!p) {
      p = this.photos.atlas(mechanism, calm).catch((err) => {
        console.warn("baked occlusion unavailable", err);
        return null;
      });
      this.atlases.set(mechanism, p);
    }
    const atlas = await p;
    if (!atlas) return;
    await this.photos.later(() => chariotAO(meshes, atlas, mechanism), calm);
    const now = (document.body.dataset.photo ?? "").split(" ").filter(Boolean);
    if (!now.includes("ao")) document.body.dataset.photo = [...now, "ao"].join(" ");
  }

  /** Contact shadow under the chariot. @param {THREE.Object3D} holder */
  attach(holder) {
    holder.add(contactShadow());
    this.holder = holder;
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
    // The trees' small atlases (they come with the sky): on before the shadows
    // are baked, so the trees cast theirs, and in the first picture.
    yard.trees?.shadeFrom(this.setShadow);
    const trees = await this.photos.firstTrees().catch((err) => console.warn("trees unavailable", err));
    if (trees) yard.trees?.set(trees.cards, trees.atlases);
    const gate = scene.getObjectByName("landmark");
    if (gate) yard.dressGate(gate);
    for (const m of Object.values(yard.materials)) {
      this.setShadow.patch(m);
      if (m !== yard.materials.hills) this.bakedAO.patch(m);
    }
    gate?.traverse((o) => {
      if (!(o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial)) return;
      const kind = o.material.userData.ageKind;
      if (kind) age(o.material, kind, tex.clouds);
      this.setShadow.patch(o.material);
      this.bakedAO.patch(o.material);
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
    if (new URLSearchParams(location.search).get("debug") !== "nobao") {
      this.bakedAO.bake(renderer, gate ? [yard.group, gate] : [yard.group], new THREE.Vector3(this.rider.x, 0, this.rider.y));
    }
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
    const now = performance.now();
    this.governor?.tick(now);
    // The photos' uploads sit out the first second on show: those frames are
    // the heaviest (each program's and texture's first draws), and a 5–8 ms
    // upload on top of one made the longest frame of the drive.
    this.shownAt ??= now;
    if (this.holder) {
      // has the chariot moved or turned since the last frame?
      const e = this.holder.matrixWorld.elements;
      let same = true;
      for (let i = 0; i < 16; i++) if (Math.abs(e[i] - this.holderWas[i]) > 1e-5) same = false;
      this.holderWas.set(e);
      this.stillFrames = same ? this.stillFrames + 1 : 0;
    }
    if (now - this.shownAt > 1000) this.photos.tick();
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

  /**
   * A number that changes whenever anything in view does: the camera, and
   * every visible thing's place, opacity, colour and texture (so a still
   * picture can be averaged over frames, postfx.js).
   */
  #signature() {
    const { scene, camera } = this.host;
    let h = 0, i = 1;
    /** @param {number} v */
    const add = (v) => {
      h += v * (1 + (i++ % 97) * 0.0137);
    };
    for (const e of camera.matrixWorld.elements) add(e);
    for (const e of camera.projectionMatrix.elements) add(e);
    scene.traverseVisible((o) => {
      const e = o.matrixWorld.elements;
      add(e[0] + e[1] + e[2] + e[4] + e[5] + e[6] + e[8] + e[9] + e[10] + e[12] + e[13] + e[14]);
      const m = /** @type {any} */ (o).material;
      if (!m || Array.isArray(m)) return;
      add(m.opacity + (m.visible ? 1 : 0));
      if (m.color) add(m.color.r + 2 * m.color.g + 3 * m.color.b);
      if (m.map) add(m.map.id + m.map.version);
    });
    add(this.env.skyUniforms.photoOn.value + this.env.skyUniforms.cloudAmount.value * this.env.skyUniforms.time.value);
    return h;
  }

  /**
   * Move the sun a fraction of a degree for frame k of a still picture's
   * average (a soft penumbra, as the real sun's disc gives); 0 puts it back.
   * @param {number} k
   */
  #jitterSun(k) {
    const sun = this.env.sun;
    if (k === 0) {
      if (this.sunHome) sun.position.copy(this.sunHome);
      this.sunHome = null;
      return;
    }
    this.sunHome ??= sun.position.clone();
    const to = this.sunHome.clone().sub(sun.target.position);
    const r = to.length() * 0.012 * Math.sqrt(((k * 0.618034) % 1));
    const a = k * 2.399963;
    const u = new THREE.Vector3(0, 1, 0).cross(to).normalize();
    const v = to.clone().cross(u).normalize();
    sun.position.copy(this.sunHome).addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
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
        this.postfx = new PostFX(renderer, scene, camera, () => controls.target, {
          signature: () => this.#signature(),
          jitter: (k) => this.#jitterSun(k),
          ready: () => this.photosIn,
        });
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

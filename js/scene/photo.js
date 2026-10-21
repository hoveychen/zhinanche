// Photographed sky and surface scans (assets/photo, made by
// tools/assets/build_photo.py from Poly Haven's CC0 library). They come after
// the first picture: the procedural textures (texgen.js) stand in until a
// set is ready, then the materials swap texture objects. A material keeps
// the same texture slots throughout, so the swap compiles nothing.
//
// Files are fetched and decoded off the main thread (photo.worker.js), then
// the GPU work is spread out, one job per frame (tick): each texture's upload,
// then the swap itself. No frame pays for a whole set, and a set goes on only
// once all of it is uploaded. (On a 4×-throttled CPU a 1024² upload with
// mipmaps took 5–8 ms, a 2048² one 43 ms: the scans stop at 1024.)

import * as THREE from "three";

const ROOT = new URL("../../assets/photo/", import.meta.url);

/**
 * @typedef {object} PhotoManifest
 * @property {Record<string, {mean: number[], albedo: Record<string, string>, normal: Record<string, string>, arm: Record<string, string>}>} textures
 * @property {{headroom: number, bg: {elev: number[], files: Record<string, string>}, env: {elev: number[], files: Record<string, string>}, fog: number[], zenith: number[]}} sky
 */

/**
 * @typedef {PhotoManifest["sky"] & {bgTex: THREE.Texture, envTex: THREE.Texture}} PhotoSky
 */

/**
 * @typedef {object} PhotoSet a surface: colour, OpenGL normal, AO·roughness·metal
 * @property {THREE.Texture} albedo
 * @property {THREE.Texture} normal
 * @property {THREE.Texture | null} arm (none asked for: the chariot's wood keeps its own roughness)
 * @property {THREE.Color} mean the albedo's average (linear), to keep a tint's colour
 */

/** A 4×4 texture of one colour, standing in for a photo in a material's slot. @param {number[]} rgb 0..255 */
export function placeholder(rgb) {
  const data = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  const t = new THREE.DataTexture(data, 4, 4, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/**
 * The average (linear) colour of a procedural texture, from a sample of its
 * texels: a photo swapped in for it is tinted to the same average.
 * @param {THREE.Texture} tex a DataTexture (texgen.js) in sRGB
 */
export function meanOf(tex) {
  const d = /** @type {Uint8Array} */ (tex.image.data);
  const sum = [0, 0, 0];
  let n = 0;
  // ~4000 texels, prime stride so it doesn't walk one column
  const step = 4 * Math.max(1, Math.floor(d.length / 4 / 4001));
  for (let o = 0; o < d.length; o += step) {
    for (let c = 0; c < 3; c++) {
      const v = d[o + c] / 255;
      sum[c] += v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }
    n++;
  }
  return new THREE.Color(sum[0] / n, sum[1] / n, sum[2] / n);
}

/** @typedef {{image: ImageBitmap | HTMLImageElement, flipY: boolean}} Decoded */
/** @import { TreeCard } from "./trees.js" */
/** @typedef {{cards: Record<string, TreeCard>, atlases: Map<string, THREE.Texture>}} TreeSet */

/** Settings for a tree atlas: colour, clamped, mipmapped. */
const ATLAS = { colour: true, repeat: false, mips: true };

/**
 * Fetch and decode an image here, on the main thread, flipped as three.js
 * flips an <img> (so normal maps keep their sense): where there's no worker.
 * @param {URL} url
 * @param {boolean} flip false: a glTF atlas, read top row first (no flip)
 * @returns {Promise<Decoded>}
 */
async function decodeHere(url, flip) {
  if (typeof createImageBitmap === "function") {
    try {
      const blob = await (await fetch(url)).blob();
      const image = await createImageBitmap(blob, { imageOrientation: flip ? "flipY" : "none", premultiplyAlpha: "none", colorSpaceConversion: "none" });
      return { image, flipY: false };
    } catch {
      // older Safari: no options; fall through to <img>
    }
  }
  const img = new Image();
  img.src = url.href;
  await img.decode();
  return { image: img, flipY: flip };
}

/** Decodes in photo.worker.js; an image it can't do is done here instead. */
class Decoder {
  constructor() {
    /** @type {Map<number, (image: ImageBitmap | undefined) => void>} */
    this.waiting = new Map();
    this.next = 0;
    /** @type {Worker | null} */
    this.worker = null;
    try {
      this.worker = new Worker(new URL("./photo.worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = (e) => {
        this.waiting.get(e.data.id)?.(e.data.image);
        this.waiting.delete(e.data.id);
      };
      this.worker.onerror = () => this.close();
    } catch {
      this.worker = null;
    }
  }

  /**
   * @param {URL} url
   * @param {"high" | "auto"} [priority]
   * @param {boolean} [flip] false: a glTF atlas (top row first); default as three.js flips an <img>
   * @returns {Promise<Decoded>}
   */
  async decode(url, priority = "auto", flip = true) {
    const w = this.worker;
    if (w) {
      const id = this.next++;
      /** @type {ImageBitmap | undefined} */
      const image = await new Promise((done) => {
        this.waiting.set(id, done);
        w.postMessage({ id, url: url.href, priority, flip });
      });
      if (image) return { image, flipY: false };
    }
    return decodeHere(url, flip);
  }

  /** No more images: the worker goes (any still waiting are done here). */
  close() {
    this.worker?.terminate();
    this.worker = null;
    for (const done of this.waiting.values()) done(undefined);
    this.waiting.clear();
  }
}

export class Photos {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {"full" | "lite"} level
   */
  constructor(renderer, level) {
    this.renderer = renderer;
    this.level = level;
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    /** @type {{run: () => void, when?: () => boolean}[]} GPU work waiting for a frame of its own (and maybe for a calm one) */
    this.jobs = [];
    /** @type {Promise<PhotoManifest | null>} */
    this.manifest = fetch(new URL("manifest.json", ROOT))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    // The sky is asked for at once, not after the manifest, and the surfaces
    // wait for it: on a 4×-throttled CPU it then beat the procedural textures
    // into the reflection map's first bake (6 runs in 6; it used to lose by
    // 0.1–0.2 s and cost a second bake, ~12 ms, among the first frames shown).
    // Names as build_photo.py writes them.
    this.decoder = new Decoder();
    /** @type {Promise<Decoded[]>} */
    this.skyFiles = Promise.all([`sky-bg-${level === "lite" ? 2048 : 4096}.webp`, "sky-env-1024.webp"].map((f) => this.decoder.decode(new URL(f, ROOT), "high")));
    /** @type {Promise<unknown>} */
    this.skyDone = this.skyFiles.catch(() => null);
    // The paving at 256 (~30 KB) comes with the sky, so the first picture is
    // already the photographed floor; the full-size set sharpens it later.
    /** @type {Promise<Decoded[]>} */
    this.groundFiles = Promise.all(["albedo", "normal", "arm"].map((k) => this.decoder.decode(new URL(`ground-${k}-256.webp`, ROOT), "high")));
    // The tree impostors (build_trees.py): the small atlases come with the sky too.
    /** @type {Promise<Record<string, TreeCard> | null>} */
    this.treeCards = fetch(new URL("trees.json", ROOT))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    /** @type {Promise<[string, Decoded][]>} */
    this.treeFiles = this.treeCards.then((m) => Promise.all(Object.entries(m ?? {}).map(async ([name, t]) => /** @type {[string, Decoded]} */ ([name, await this.decoder.decode(new URL(t.files["256"], ROOT), "high")]))));
  }

  /**
   * Run `fn` on a later frame, alone (tick); with `when`, on the first frame
   * it says yes (other jobs go ahead meanwhile).
   * @template T @param {() => T} fn @param {() => boolean} [when] @returns {Promise<T>}
   */
  later(fn, when) {
    return new Promise((done, fail) => this.jobs.push({
      run: () => {
        try {
          done(fn());
        } catch (err) {
          fail(err);
        }
      },
      when,
    }));
  }

  /** All photos are in: the decoding worker can go. */
  close() {
    this.decoder.close();
  }

  /** Run at most one waiting job. Call once a frame, before drawing. */
  tick() {
    const i = this.jobs.findIndex((j) => !j.when || j.when());
    if (i >= 0) this.jobs.splice(i, 1)[0].run();
  }

  /**
   * A decoded image as a texture, its upload queued (tick).
   * @param {Decoded} d
   * @param {{colour: boolean, repeat: boolean, mips: boolean, gltf?: boolean}} o
   * @param {boolean} [queue] queue the upload (else the first draw does it)
   * @param {() => boolean} [when] upload only on a frame this says yes to
   * @returns {{tex: THREE.Texture, up: Promise<void>}}
   */
  #texture({ image, flipY }, o, queue = true, when = undefined) {
    const tex = new THREE.Texture(/** @type {any} */ (image));
    tex.flipY = flipY;
    tex.colorSpace = o.colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = o.mips;
    tex.minFilter = o.mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    tex.anisotropy = o.mips ? this.aniso : 1;
    tex.needsUpdate = true;
    // (a texture already drawn with is not uploaded again)
    return { tex, up: queue ? this.later(() => this.renderer.initTexture(tex), when) : Promise.resolve() };
  }

  /**
   * One texture, fetched, decoded and uploaded.
   * @param {string} file
   * @param {{colour: boolean, repeat: boolean, mips: boolean, gltf?: boolean}} o
   * @param {() => boolean} [when] upload only on a frame this says yes to
   */
  async #load(file, o, when = undefined) {
    const { tex, up } = this.#texture(await this.decoder.decode(new URL(file, ROOT), "auto", !o.gltf), o, true, when);
    await up;
    return tex;
  }

  /**
   * The photographed sky: the background strip and the small whole-dome map
   * for reflections, decoded (their uploads queued: if the sky goes up before
   * the first frame, drawing it uploads them).
   * @returns {Promise<PhotoSky | null>}
   */
  async sky() {
    const m = await this.manifest;
    if (!m) return null;
    const opts = { colour: true, repeat: true, mips: false };
    const [bgTex, envTex] = (await this.skyFiles).map((d) => this.#texture(d, opts).tex);
    return { ...m.sky, bgTex, envTex };
  }

  /**
   * The paving's small set, decoded early (no upload queued: it goes up with
   * the first frame that draws it, ~1 ms for the three).
   * @returns {Promise<PhotoSet | null>}
   */
  async firstGround() {
    const t = (await this.manifest)?.textures.ground;
    if (!t) return null;
    const [albedo, normal, arm] = (await this.groundFiles).map(({ image, flipY }, i) => {
      const tex = new THREE.Texture(/** @type {any} */ (image));
      tex.flipY = flipY;
      tex.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = this.aniso;
      tex.needsUpdate = true;
      return tex;
    });
    return { albedo, normal, arm, mean: new THREE.Color(t.mean[0], t.mean[1], t.mean[2]) };
  }

  /**
   * The trees' small atlases, decoded early (no upload queued: they go up
   * with the first frame that draws them, the three ~1 ms).
   * @returns {Promise<TreeSet | null>}
   */
  async firstTrees() {
    const cards = await this.treeCards;
    if (!cards) return null;
    const atlases = new Map((await this.treeFiles).map(([name, d]) => [name, this.#texture(d, ATLAS, false).tex]));
    return { cards, atlases };
  }

  /**
   * The trees' atlases at this level's size (768 × 1536, lite 512 × 1024), uploaded.
   * @returns {Promise<TreeSet | null>}
   */
  async trees() {
    const cards = await this.treeCards;
    await this.skyDone;
    if (!cards) return null;
    const w = this.level === "lite" ? "512" : "768";
    const got = await Promise.all(Object.entries(cards).map(async ([name, t]) => /** @type {[string, THREE.Texture]} */ ([name, await this.#load(t.files[w], ATLAS)])));
    return { cards, atlases: new Map(got) };
  }

  /**
   * A surface scan at the sizes for this level, uploaded.
   * @param {string} name ground, plaster, roof, wood
   * @param {{full: number[], lite: number[]}} sizes [albedo, normal, arm] texel widths (arm 0: none)
   * @returns {Promise<PhotoSet | null>}
   */
  async surface(name, sizes) {
    const m = await this.manifest;
    await this.skyDone;
    const t = m?.textures[name];
    if (!t) return null;
    const [a, n, r] = sizes[this.level];
    const [albedo, normal, arm] = await Promise.all([
      this.#load(t.albedo[a], { colour: true, repeat: true, mips: true }),
      this.#load(t.normal[n], { colour: false, repeat: true, mips: true }),
      r ? this.#load(t.arm[r], { colour: false, repeat: true, mips: true }) : null,
    ]);
    return { albedo, normal, arm, mean: new THREE.Color(t.mean[0], t.mean[1], t.mean[2]) };
  }

  /**
   * A baked occlusion atlas for one chariot (blender/scripts/build_chariot.py
   * writes chariot-<mechanism>-ao.webp next to the scans): read on the GLB's
   * own UVs, so no repeat. Fetched after the sky like the surfaces.
   * @param {string} mechanism
   * @param {() => boolean} [when] upload only on a frame this says yes to
   * @returns {Promise<THREE.Texture>}
   */
  async atlas(mechanism, when) {
    await this.skyDone;
    return this.#load(`chariot-${mechanism}-ao-${this.level === "lite" ? 512 : 1024}.webp`, { colour: false, repeat: false, mips: true, gltf: true }, when);
  }
}

// Photographed sky and surface scans (assets/photo, made by
// tools/assets/build_photo.py from Poly Haven's CC0 library). They come after
// the first picture: the procedural textures (texgen.js) stand in until a
// set is ready, then the materials swap texture objects. A material keeps
// the same texture slots throughout, so the swap compiles nothing.
//
// Files are fetched and decoded off the main thread (createImageBitmap), and
// uploaded to the GPU one texture per frame (tick), so no frame pays for a
// whole set; a set goes on only once all of it is uploaded.

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
 * @property {THREE.Texture} arm
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
 * Fetch and decode an image, flipped as three.js flips an <img> (so normal
 * maps keep their sense).
 * @param {URL} url
 * @returns {Promise<{image: ImageBitmap | HTMLImageElement, flipY: boolean}>}
 */
async function decode(url) {
  if (typeof createImageBitmap === "function") {
    try {
      const blob = await (await fetch(url)).blob();
      const image = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
      return { image, flipY: false };
    } catch {
      // older Safari: no options; fall through to <img>
    }
  }
  const img = new Image();
  img.src = url.href;
  await img.decode();
  return { image: img, flipY: true };
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
    /** @type {{tex: THREE.Texture, done: () => void}[]} decoded, waiting for the GPU */
    this.queue = [];
    /** @type {Promise<PhotoManifest | null>} */
    this.manifest = fetch(new URL("manifest.json", ROOT))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }

  /**
   * One texture, decoded and then uploaded on a later tick.
   * @param {string} file
   * @param {{colour: boolean, repeat: boolean, mips: boolean}} o
   * @returns {Promise<THREE.Texture>}
   */
  async #load(file, o) {
    const { image, flipY } = await decode(new URL(file, ROOT));
    const tex = new THREE.Texture(/** @type {any} */ (image));
    tex.flipY = flipY;
    tex.colorSpace = o.colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = o.mips;
    tex.minFilter = o.mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    tex.anisotropy = o.mips ? this.aniso : 1;
    tex.needsUpdate = true;
    await new Promise((done) => this.queue.push({ tex, done: () => done(undefined) }));
    return tex;
  }

  /** Upload at most one waiting texture. Call once a frame, before drawing. */
  tick() {
    const next = this.queue.shift();
    if (!next) return;
    this.renderer.initTexture(next.tex);
    next.done();
  }

  /**
   * The photographed sky: the background strip and the small whole-dome map
   * for reflections, uploaded.
   * @returns {Promise<PhotoSky | null>}
   */
  async sky() {
    const m = await this.manifest;
    if (!m) return null;
    const s = m.sky;
    const bg = this.level === "lite" ? "2048" : "4096";
    const opts = { colour: true, repeat: true, mips: false };
    const [bgTex, envTex] = await Promise.all([this.#load(s.bg.files[bg], opts), this.#load(s.env.files["1024"], opts)]);
    return { ...s, bgTex, envTex };
  }

  /**
   * A surface scan at the sizes for this level.
   * @param {string} name ground, plaster, roof, wood
   * @param {{full: number[], lite: number[]}} sizes [albedo, normal, arm] texel widths
   * @returns {Promise<PhotoSet | null>}
   */
  async surface(name, sizes) {
    const m = await this.manifest;
    const t = m?.textures[name];
    if (!t) return null;
    const [a, n, r] = sizes[this.level];
    const [albedo, normal, arm] = await Promise.all([
      this.#load(t.albedo[a], { colour: true, repeat: true, mips: true }),
      this.#load(t.normal[n], { colour: false, repeat: true, mips: true }),
      this.#load(t.arm[r], { colour: false, repeat: true, mips: true }),
    ]);
    return { albedo, normal, arm, mean: new THREE.Color(t.mean[0], t.mean[1], t.mean[2]) };
  }
}

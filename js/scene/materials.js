// Realistic materials for the chariot: the GLB carries flat colours named by
// role (docs/model-contract.md, blender/scripts/lib/mesh.py COLORS); here each
// role becomes a PBR material with procedural wood, brass or iron textures.
// The GLB has no UVs, so every flat face gets a planar projection: long faces
// (boards, beams, spokes, rim felloes) run the grain along their length,
// squarish faces (gear discs, hubs) are box-projected as if cut from a plank.
// Left/right gear trains keep the site's blue/orange as painted lacquer, in
// three shades per train so a wheel and the gears it drives read as apart.

import * as THREE from "three";

/** @import { TexSet } from "./texgen.js" */

/** @typedef {Record<string, THREE.DataTexture>} Textures */

/**
 * Make the procedural textures, in a worker when possible. The chariot's
 * (wood, metal) come first so the chariot isn't held up by the paving.
 * @param {THREE.WebGLRenderer} renderer
 * @param {"lite" | "full"} level
 * @returns {{chariot: Promise<Textures>, scene: Promise<Textures>}}
 */
export function loadTextures(renderer, level) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  /** @param {TexSet} set */
  const upload = (set) => {
    /** @type {Textures} */
    const out = {};
    for (const [name, t] of Object.entries(set)) {
      const tex = new THREE.DataTexture(t.data, t.size, t.size, THREE.RGBAFormat, THREE.UnsignedByteType);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = aniso;
      const colour = !/Rough|Normal/.test(name) && name !== "clouds";
      tex.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.needsUpdate = true;
      out[name] = tex;
    }
    return out;
  };
  /** @type {Record<"chariot" | "scene", (s: TexSet) => void>} */
  const got = { chariot: () => {}, scene: () => {} };
  /** @type {Promise<TexSet>} */
  const chariot = new Promise((r) => (got.chariot = r));
  /** @type {Promise<TexSet>} */
  const scene = new Promise((r) => (got.scene = r));
  const fallback = async () => {
    const t = await import("./texgen.js");
    got.chariot(t.generateChariot(level));
    await new Promise((r) => setTimeout(r));
    got.scene(t.generateScene(level));
  };
  // one worker per part, so the courtyard's textures are made alongside the
  // chariot's instead of after them
  try {
    /** @type {Worker[]} */
    const workers = [];
    let failed = false;
    for (const part of /** @type {const} */ (["chariot", "scene"])) {
      const w = new Worker(new URL("./texgen.worker.js", import.meta.url), { type: "module" });
      workers.push(w);
      w.onmessage = (e) => {
        got[part](e.data.set);
        w.terminate();
      };
      w.onerror = () => {
        for (const x of workers) x.terminate();
        if (!failed) fallback();
        failed = true;
      };
      w.postMessage({ level, parts: [part] });
    }
  } catch {
    fallback();
  }
  return { chariot: chariot.then(upload), scene: scene.then(upload) };
}

/**
 * @typedef {object} Recipe
 * @property {number} color sRGB
 * @property {"wood" | "woodSoft" | "metal" | "tiles" | null} map
 * @property {number} roughness
 * @property {number} [metalness]
 * @property {number} [clearcoat]
 * @property {number} [clearcoatRoughness]
 * @property {number} [normal] normal map strength
 * @property {number} [sheen]
 * @property {number} scale texture tiles per chi
 * @property {"grain" | "roof"} [project]
 * @property {string} [mural] which of the box's paintings (photo.js murals()) is laid once over the whole sheet (muralUVs)
 * @property {false} [ao] false: never takes the baked occlusion atlas (a colour that must stay clean)
 */

/** Role (GLB material name) → recipe. Colours are sRGB. */
export const RECIPES = /** @type {Record<string, Recipe>} */ ({
  // Body boards and frame: oiled, lightly varnished elm.
  wood: { color: 0xa66c3f, map: "wood", roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.4, normal: 0.5, scale: 0.8 },
  // Hubs, spokes, axles: darker walnut.
  wood_dark: { color: 0x5e3a24, map: "wood", roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.45, normal: 0.5, scale: 1 },
  // Pegs (the gear teeth): pale boxwood, smooth from wear.
  peg: { color: 0xe6c690, map: "wood", roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.3, normal: 0.35, scale: 1.4 },
  // The red box, railings, pillars: cinnabar lacquer (赤質).
  lacquer: { color: 0xa82a1d, map: "woodSoft", roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.12, normal: 0.25, scale: 0.6 },
  // The box's paintings (宋史: 兩箱畫青龍、白虎，四面畫花鳥): plain lacquer red (a
  // one-texel map, dressChariot) till the painting atlas is in (photoMurals),
  // under a thinner coat than the box's.
  mural_dragon: { color: 0xffffff, map: "woodSoft", roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25, normal: 0.08, scale: 0.6, mural: "dragon" },
  mural_tiger: { color: 0xffffff, map: "woodSoft", roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25, normal: 0.08, scale: 0.6, mural: "tiger" },
  mural_flowers: { color: 0xffffff, map: "woodSoft", roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25, normal: 0.08, scale: 0.6, mural: "flowers" },
  eave: { color: 0x6c2117, map: "woodSoft", roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.15, normal: 0.25, scale: 0.5 },
  // The wheels: red lacquer worn thinner than the box's, the grain showing more.
  wheel: { color: 0x962c1e, map: "woodSoft", roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.25, normal: 0.4, scale: 0.8 },
  // The wheels' marker spoke: yellow lacquer.
  mark: { color: 0xe9c43a, map: "woodSoft", roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.18, normal: 0.3, scale: 0.8 },
  // Left train blue, right train orange: painted, lacquered wood with the grain showing through.
  blue: { color: 0x2c64c8, map: "woodSoft", roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.18, normal: 0.3, scale: 0.6, ao: false },
  orange: { color: 0xea7d1c, map: "woodSoft", roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.18, normal: 0.3, scale: 0.6, ao: false },
  // The differential's carrier and pinions (the middle train): yellow paint, kept clean like the trains' colours.
  yellow: { color: 0xf2c230, map: "woodSoft", roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.18, normal: 0.3, scale: 0.6, ao: false },
  // The differential's inner teeth, painted like the gear they belong to (the roles say "tooth" for the clearance check).
  peg_blue: { color: 0x2c64c8, map: "woodSoft", roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.18, normal: 0.3, scale: 1.4, ao: false },
  peg_orange: { color: 0xea7d1c, map: "woodSoft", roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.18, normal: 0.3, scale: 1.4, ao: false },
  peg_yellow: { color: 0xf2c230, map: "woodSoft", roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.18, normal: 0.3, scale: 1.4, ao: false },
  // Gilt fittings: the figure's lotus seat, crown and sash ends, the phoenix's beak, the pouches' tassels.
  gold: { color: 0xe6c98c, map: "metal", roughness: 0.2, metalness: 1, normal: 0.2, scale: 0.8 },
  marker: { color: 0xe41b2c, map: "woodSoft", roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2, normal: 0.2, scale: 1, ao: false },
  // Hub bands, caps, linchpins, straps, the shaft's point: forged iron; the photographed rust goes over it (photoIron)
  iron: { color: 0x6b6762, map: "metal", roughness: 0.62, metalness: 0.65, normal: 0.5, scale: 1.2 },
  // Bamboo cord (竹索) and lashings: matt, the grain read as twisted fibres.
  rope: { color: 0x9c7f50, map: "wood", roughness: 0.95, normal: 1, scale: 6, sheen: 0.5 },
  robe: { color: 0xb3241c, map: "woodSoft", roughness: 0.6, sheen: 0.7, normal: 0.2, scale: 2 },
  // The figure's collar, cuffs, sash and stole: mineral green (石绿), as on Song painted figures.
  trim: { color: 0x2f6b55, map: "woodSoft", roughness: 0.55, sheen: 0.5, normal: 0.2, scale: 2 },
  skin: { color: 0xf0cda4, map: "woodSoft", roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3, normal: 0.15, scale: 1.5 },
  hat: { color: 0x1c1b1e, map: "woodSoft", roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, normal: 0.2, scale: 1.5 },
});

/**
 * Each train's parts in three shades of its colour, so parts that touch or
 * mesh never share one: the wheel a deep lacquer, the upright gear on its
 * axle the train's own colour, the flat gear that gear drives a light tint.
 * Node → sRGB, for the "blue", "orange" and "yellow" roles.
 * @type {Record<string, number>}
 */
export const TRAIN_SHADES = {
  "wheel.L": 0x173a85, "diff.crown.L": 0x2c64c8, "song.foot.L": 0x2c64c8, "diff.sideA": 0x7db8ff, "song.small.L": 0x7db8ff,
  "wheel.R": 0xb95e12, "diff.crown.R": 0xea7d1c, "song.foot.R": 0xea7d1c, "diff.sideB": 0xffa860, "song.small.R": 0xffa860,
  // the middle: the carrier a deep yellow, the pinions it carries a light one
  "diff.carrier": 0xd49a14, "diff.pinion.0": 0xffd95a, "diff.pinion.1": 0xffd95a,
};

/** Roles painted in their part's shade of its train's colour. */
const SHADED = new Set(["blue", "orange", "yellow", "peg_blue", "peg_orange", "peg_yellow"]);

/** The TRAIN_SHADES node a mesh belongs to, if any. @param {THREE.Object3D} o */
function shadeOf(o) {
  for (let n = /** @type {THREE.Object3D | null} */ (o); n; n = n.parent) {
    const c = TRAIN_SHADES[n.userData.name ?? n.name];
    if (c !== undefined) return c;
  }
  return null;
}

/**
 * @param {Recipe} r
 * @param {Textures} tex
 */
export function makeMaterial(r, tex) {
  const m = new THREE.MeshPhysicalMaterial({
    color: r.color,
    roughness: r.roughness,
    metalness: r.metalness ?? 0,
    clearcoat: r.clearcoat ?? 0,
    clearcoatRoughness: r.clearcoatRoughness ?? 0,
    sheen: r.sheen ?? 0,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(r.color).lerp(new THREE.Color(0xffffff), 0.4),
  });
  if (r.map) {
    const base = r.map === "woodSoft" ? "wood" : r.map;
    m.map = tex[r.map] ?? null;
    m.roughnessMap = tex[`${base}Rough`] ?? null;
    m.normalMap = tex[`${base}Normal`] ?? null;
    m.normalScale.setScalar(r.normal ?? 0.5);
    if (r.metalness) m.metalnessMap = null;
  }
  return m;
}

/** Small string hash → [0, 1). @param {string} s */
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/**
 * Planar UVs per flat face (connected vertices sharing a normal).
 * @param {THREE.BufferGeometry} geo
 * @param {number} scale tiles per unit
 * @param {"grain" | "roof"} mode
 * @param {number} seed offsets the pattern so parts don't repeat each other
 */
export function faceUVs(geo, scale, mode, seed) {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  if (!pos || !nor) return;
  const n = pos.count;
  const index = geo.getIndex();
  const parent = new Int32Array(n).map((_, i) => i);
  /** @param {number} i */
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const tri = index ? index.count : n;
  for (let t = 0; t < tri; t += 3) {
    const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
    const ra = find(a);
    parent[find(b)] = ra;
    parent[find(c)] = ra;
  }
  // A disc or a rim is built as wedges that only touch (each a solid of its
  // own): weld vertices at the same place with the same normal, so the top of
  // a disc is one face and takes one planar grain, not a grain along each
  // wedge (which reads as a radial brushing).
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)},${Math.round(nor.getX(i) * 100)},${Math.round(nor.getY(i) * 100)},${Math.round(nor.getZ(i) * 100)}`;
    const j = seen.get(key);
    if (j === undefined) seen.set(key, i);
    else parent[find(i)] = find(j);
  }
  /** @type {Map<number, number[]>} */
  const faces = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const f = faces.get(r);
    if (f) f.push(i);
    else faces.set(r, [i]);
  }
  const uv = new Float32Array(n * 2);
  const N = new THREE.Vector3(), P = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
  const U = new THREE.Vector3(), V = new THREE.Vector3(), C = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const ou = seed * 7.31, ov = seed * 3.17;
  for (const verts of faces.values()) {
    N.fromBufferAttribute(nor, verts[0]).normalize();
    const ax = Math.abs(N.x), ay = Math.abs(N.y), az = Math.abs(N.z);
    if (mode === "roof" && ay < 0.98) {
      U.crossVectors(Y, N).normalize();
      V.crossVectors(N, U).normalize();
    } else {
      // In-plane principal axis: long faces run the grain along their length.
      A.set(1, 0, 0);
      if (ax > 0.9) A.set(0, 1, 0);
      A.addScaledVector(N, -A.dot(N)).normalize();
      B.crossVectors(N, A);
      C.set(0, 0, 0);
      for (const i of verts) C.add(P.fromBufferAttribute(pos, i));
      C.divideScalar(verts.length);
      let saa = 0, sbb = 0, sab = 0;
      for (const i of verts) {
        P.fromBufferAttribute(pos, i).sub(C);
        const a = P.dot(A), b = P.dot(B);
        saa += a * a;
        sbb += b * b;
        sab += a * b;
      }
      const tr = saa + sbb, det = saa * sbb - sab * sab;
      const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = Math.max(1e-9, tr - l1);
      if (verts.length >= 3 && l1 / l2 > 4) {
        const th = 0.5 * Math.atan2(2 * sab, saa - sbb);
        U.copy(A).multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th));
        V.crossVectors(N, U);
      } else if (ay >= ax && ay >= az) {
        U.set(1, 0, 0);
        V.set(0, 0, 1);
      } else if (ax >= az) {
        U.set(0, 0, 1);
        V.set(0, 1, 0);
      } else {
        U.set(1, 0, 0);
        V.set(0, 1, 0);
      }
    }
    for (const i of verts) {
      P.fromBufferAttribute(pos, i);
      uv[i * 2] = P.dot(U) * scale + ou;
      uv[i * 2 + 1] = P.dot(V) * scale + ov;
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * UVs laying a painting (tools/assets/build_murals.py) over a thin sheet on
 * the outside of the box: u to the right as seen from outside, v up, the
 * sheet's extent to the picture's.
 * @param {THREE.BufferGeometry} geo
 */
export function muralUVs(geo) {
  const pos = geo.getAttribute("position");
  if (!pos) return;
  geo.computeBoundingBox();
  const box = /** @type {THREE.Box3} */ (geo.boundingBox);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  // the sheet is thinnest across; it faces away from the chariot's middle
  const N = size.x < size.z ? new THREE.Vector3(Math.sign(mid.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(mid.z));
  const U = new THREE.Vector3(0, 1, 0).cross(N);
  const lo = Math.min(box.min.dot(U), box.max.dot(U)), span = Math.abs(size.dot(U));
  const uv = new Float32Array(pos.count * 2);
  const P = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    P.fromBufferAttribute(pos, i);
    uv[i * 2] = (P.dot(U) - lo) / span;
    uv[i * 2 + 1] = (P.y - box.min.y) / size.y;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * Put the box's paintings (photo.js murals()) on its painted sheets: the
 * painting under the lacquer's coat, its colour as painted.
 * @param {Iterable<THREE.Mesh>} meshes @param {Record<string, THREE.Texture>} pictures
 */
export function photoMurals(meshes, pictures) {
  for (const o of meshes) {
    const m = /** @type {THREE.MeshPhysicalMaterial} */ (o.material);
    const name = RECIPES[m.name]?.mural;
    if (name && pictures[name]) m.map = pictures[name];
  }
}

/**
 * Put the photographed wood (photo.js) on whatever wears the procedural
 * bare wood: the boards, hubs, spokes and pegs. It is a near-white
 * multiplier like the procedural one, so the role colours (and the rig's
 * highlight colours) stay; painted parts keep their soft grain.
 * @param {Iterable<THREE.Mesh>} meshes @param {import("./photo.js").PhotoSet} set @param {Textures} tex the procedural ones
 */
export function photoWood(meshes, set, tex) {
  // the scan is 2 m (6.5 chi) of plank, the procedural tile ~2 chi
  set.albedo.repeat.setScalar(0.5);
  set.normal.repeat.setScalar(0.5);
  for (const o of meshes) {
    const m = /** @type {THREE.MeshPhysicalMaterial} */ (o.material);
    if (m.map !== tex.wood) continue;
    m.map = set.albedo;
    if (m.normalMap === tex.woodNormal) m.normalMap = set.normal;
  }
}

/**
 * Put the photographed rusty iron (photo.js, Poly Haven rusty_metal_04) on
 * the ironwork: its colour is a near-white tint, so the role's grey stays
 * under it, and its arm map says where the rust (dull, not metal) is.
 * The roughness and metalness slots are new to the material, so it compiles
 * once more; one material, on a frame of its own (look.js).
 * @param {Iterable<THREE.Mesh>} meshes @param {import("./photo.js").PhotoSet} set
 */
export function photoIron(meshes, set) {
  for (const t of [set.albedo, set.normal, set.arm]) t?.repeat.setScalar(1);
  for (const o of meshes) {
    const m = /** @type {THREE.MeshPhysicalMaterial} */ (o.material);
    if (m.name !== "iron") continue;
    m.map = set.albedo;
    m.normalMap = set.normal;
    if (set.arm) {
      m.roughnessMap = set.arm;
      m.metalnessMap = set.arm;
      m.roughness = 1;
      // forged iron dark with scale, not bright metal: at full metalness it
      // only mirrored the shade under the box and the hubs' bands went black
      m.metalness = 0.65;
    }
  }
}

/** @type {THREE.Texture | null} a white aoMap standing in until the atlas is up (so nothing recompiles then) */
let aoBlank = null;
/** @type {THREE.Texture | null} the box's lacquer red standing in for its paintings until they are up */
let muralBlank = null;

/**
 * The baked occlusion atlas (blender/scripts/build_chariot.py bake()) on one
 * chariot's meshes, read through the GLB's own UVs (uv1 here; see dressChariot).
 * @param {Iterable<THREE.Mesh>} meshes @param {THREE.Texture} atlas @param {string} mechanism only that chariot's meshes
 */
export function chariotAO(meshes, atlas, mechanism) {
  atlas.channel = 1;
  for (const o of meshes) {
    if (o.userData.mechanism !== mechanism) continue;
    const m = /** @type {THREE.MeshPhysicalMaterial} */ (o.material);
    if (m.aoMap) m.aoMap = atlas;
  }
}

/**
 * Swap the GLB's flat colours for the realistic materials. Call before the
 * Rig is made (it clones each mesh's material for its own looks).
 * @param {THREE.Object3D} root the GLB scene
 * @param {Textures} tex
 */
export function dressChariot(root, tex) {
  /** @type {Map<string, THREE.Material>} */
  const made = new Map();
  if (!aoBlank) {
    aoBlank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    aoBlank.channel = 1;
    aoBlank.needsUpdate = true;
  }
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const src = /** @type {THREE.Material} */ (o.material);
    const r = RECIPES[src.name];
    if (!r) return;
    o.geometry = o.geometry.clone();
    // the GLB's UVs are the baked atlas's: kept as uv1 (the aoMap channel),
    // the planar grain goes over uv
    const atlasUV = o.geometry.getAttribute("uv");
    if (atlasUV) o.geometry.setAttribute("uv1", atlasUV);
    if (r.mural !== undefined) muralUVs(o.geometry);
    else faceUVs(o.geometry, r.scale, r.project ?? "grain", hash01(o.name));
    const shade = SHADED.has(src.name) ? shadeOf(o) : null;
    const key = shade === null ? src.name : `${src.name}.${shade}`;
    let m = made.get(key);
    if (!m) {
      const pm = makeMaterial(shade === null ? r : { ...r, color: shade }, tex);
      pm.name = src.name;
      if (r.ao !== false && atlasUV) pm.aoMap = aoBlank;
      if (r.mural !== undefined) {
        if (!muralBlank) {
          muralBlank = new THREE.DataTexture(new Uint8Array([0xa8, 0x2a, 0x1d, 255]), 1, 1);
          muralBlank.colorSpace = THREE.SRGBColorSpace;
          muralBlank.needsUpdate = true;
        }
        pm.map = muralBlank;
      }
      m = pm;
      made.set(key, m);
    }
    o.material = m;
  });
}

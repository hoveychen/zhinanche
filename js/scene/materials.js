// Realistic materials for the chariot: the GLB carries flat colours named by
// role (docs/model-contract.md, blender/scripts/lib/mesh.py COLORS); here each
// role becomes a PBR material with procedural wood, brass or iron textures.
// The GLB has no UVs, so every flat face gets a planar projection: long faces
// (boards, beams, spokes, rim felloes) run the grain along their length,
// squarish faces (gear discs, hubs) are box-projected as if cut from a plank.
// Left/right gear trains keep the site's blue/orange as painted lacquer.

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
  try {
    const w = new Worker(new URL("./texgen.worker.js", import.meta.url), { type: "module" });
    let n = 0;
    w.onmessage = (e) => {
      got[/** @type {"chariot" | "scene"} */ (e.data.part)](e.data.set);
      if (++n === 2) w.terminate();
    };
    w.onerror = () => {
      w.terminate();
      fallback();
    };
    w.postMessage({ level });
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
 */

/** Role (GLB material name) → recipe. Colours are sRGB. */
export const RECIPES = /** @type {Record<string, Recipe>} */ ({
  // Body boards and frame: oiled, lightly varnished elm.
  wood: { color: 0xa66c3f, map: "wood", roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.4, normal: 0.5, scale: 0.8 },
  // Hubs, spokes, axles: darker walnut.
  wood_dark: { color: 0x5e3a24, map: "wood", roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.45, normal: 0.5, scale: 1 },
  // Pegs (the gear teeth): pale boxwood, smooth from wear.
  peg: { color: 0xe6c690, map: "wood", roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.3, normal: 0.35, scale: 1.4 },
  // Railings, pillars: cinnabar lacquer.
  lacquer: { color: 0xa82a1d, map: "woodSoft", roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.12, normal: 0.25, scale: 0.6 },
  eave: { color: 0x6c2117, map: "woodSoft", roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.15, normal: 0.25, scale: 0.5 },
  // Roof: dark glazed tiles.
  roof: { color: 0x354044, map: "tiles", roughness: 0.68, normal: 0.9, scale: 0.55, project: "roof" },
  // Left train blue, right train orange: painted, lacquered wood with the grain showing through.
  blue: { color: 0x2c64c8, map: "woodSoft", roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.18, normal: 0.3, scale: 0.6 },
  orange: { color: 0xea7d1c, map: "woodSoft", roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.18, normal: 0.3, scale: 0.6 },
  // Centre train, shaft and the figure's base: cast brass.
  gold: { color: 0xe6c98c, map: "metal", roughness: 0.2, metalness: 1, normal: 0.2, scale: 0.8 },
  marker: { color: 0xe41b2c, map: "woodSoft", roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2, normal: 0.2, scale: 1 },
  iron: { color: 0x55565a, map: "metal", roughness: 0.62, metalness: 0.9, normal: 0.5, scale: 1.2 },
  rope: { color: 0xb59a68, map: "wood", roughness: 0.95, normal: 1, scale: 3, sheen: 0.4 },
  robe: { color: 0xb3241c, map: "woodSoft", roughness: 0.6, sheen: 0.7, normal: 0.2, scale: 2 },
  skin: { color: 0xf0cda4, map: "woodSoft", roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3, normal: 0.15, scale: 1.5 },
  hat: { color: 0x1c1b1e, map: "woodSoft", roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, normal: 0.2, scale: 1.5 },
});

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
 * Swap the GLB's flat colours for the realistic materials. Call before the
 * Rig is made (it clones each mesh's material for its own looks).
 * @param {THREE.Object3D} root the GLB scene
 * @param {Textures} tex
 */
export function dressChariot(root, tex) {
  /** @type {Map<string, THREE.Material>} */
  const made = new Map();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const src = /** @type {THREE.Material} */ (o.material);
    const r = RECIPES[src.name];
    if (!r) return;
    o.geometry = o.geometry.clone();
    faceUVs(o.geometry, r.scale, r.project ?? "grain", hash01(o.name));
    let m = made.get(src.name);
    if (!m) {
      m = makeMaterial(r, tex);
      m.name = src.name;
      made.set(src.name, m);
    }
    o.material = m;
  });
}

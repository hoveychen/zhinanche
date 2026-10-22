// The court's pines and firs: Poly Haven's CC0 tree models, rendered in
// Blender into impostors (tools/assets/build_trees.py). Space for time: the
// sun and the sky never move and the trees never turn (the courtyard stands
// still), so each tree was path-traced once from 16
// directions round it under the court's own sun and photographed sky, light,
// self-shadow and all, and the page only draws a card per tree.
//
// A card stands upright on the tree's foot and turns about its trunk to face
// the camera; it shows the two frames nearest the camera's direction, blended.
// The cards of one kind of tree are one instanced draw. Their geometry is four
// vertices at the origin, spread by the vertex shader, so the passes that draw
// the scene with a material of their own (ambient occlusion's normals, depth
// of field's depth) don't draw a stray square; the baked sun shadows and sky
// occlusion draw the cards with bakeMaterial instead (from the sun the card
// shows the frame facing it; from straight above, a disc where the crown is).
// Lit by nothing at run time: the light is in the frames. Only the courtyard's
// baked shadow (environment.js SetShadow) is looked up, so a tree in a wall's
// shadow is darker.

import * as THREE from "three";
import { placeholder } from "./photo.js";
import { SUN_DIR } from "./environment.js";

/** @typedef {"pine" | "fir" | "firb"} TreeKind */

/**
 * @typedef {object} TreeCard one kind's frames (assets/photo/trees.json)
 * @property {number} frames
 * @property {number} cols
 * @property {number[]} card width, height and centre height of the card (m)
 * @property {number} tree the tree's height (m)
 * @property {number} reach its crown's radius (m)
 * @property {number} gain the atlas holds radiance / gain
 * @property {Record<string, string>} files atlas files by width
 */

/** @typedef {{kind: TreeKind, x: number, z: number, h: number, tint: number}} TreePlace */

export const KINDS = /** @type {const} */ (["pine", "fir", "firb"]);

/** Brightness over the baked frames' (see set). */
const LIFT = 1.3;

const VERT_PARS = /* glsl */ `
uniform vec4 treeCard; // card width, height, centre height, crown radius: × the tree's height
uniform vec2 treeFrames; // frames, columns
uniform vec3 treeSun;
varying vec2 vTreeA;
varying vec2 vTreeB;
varying float vTreeW;
varying float vTreeTop;
varying vec3 vTreeWorld;
vec2 treeCell(float k, vec2 uv) {
  float rows = treeFrames.x / treeFrames.y;
  float c = mod(k, treeFrames.y), r = floor(k / treeFrames.y);
  return vec2((c + uv.x) / treeFrames.y, 1.0 - (r + 1.0 - uv.y) / rows);
}`;

const VERT_MAIN = /* glsl */ `
  mat4 inst = modelMatrix * instanceMatrix;
  vec3 foot = inst[3].xyz;
  float s = length(inst[1].xyz);
  vec3 centre = foot + vec3(0.0, treeCard.z * s, 0.0);
  bool ortho = projectionMatrix[3][3] == 1.0;
  // towards the viewer: a baking camera's own direction, else the camera
  vec3 toCam = ortho ? vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : cameraPosition - centre;
  vec3 d = normalize(toCam);
  vec3 p;
  vTreeTop = 0.0;
  if (ortho && d.y > 0.9) {
    // from straight above (the sky-occlusion bake): a disc at the crown
    vTreeTop = 1.0;
    p = foot + vec3((uv.x - 0.5) * 2.0 * treeCard.w * s, 0.6 * s, (uv.y - 0.5) * 2.0 * treeCard.w * s);
    vTreeA = vTreeB = uv;
    vTreeW = 0.0;
  } else {
    vec2 h = normalize(d.xz + vec2(1e-5, 0.0));
    vec3 right = vec3(h.y, 0.0, -h.x);
    p = centre + right * (uv.x - 0.5) * treeCard.x * s + vec3(0.0, (uv.y - 0.5) * treeCard.y * s, 0.0);
    // frame k was rendered from azimuth k / frames of a turn (0: from the south, +z)
    float f = atan(h.x, h.y) / 6.28318531 * treeFrames.x;
    f = mod(f + treeFrames.x, treeFrames.x);
    float k0 = floor(f);
    vTreeW = f - k0;
    vTreeA = treeCell(k0, uv);
    vTreeB = treeCell(mod(k0 + 1.0, treeFrames.x), uv);
  }
  // where the baked shadow is looked up: out of the crown towards the sun, so a
  // tree is not shaded by its own outline in the map (its frames have their own)
  vTreeWorld = p + treeSun * treeCard.w * s * 1.6;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;`;

const FRAG_PARS = /* glsl */ `
uniform float treeGain;
uniform sampler2DShadow setShadowMap;
uniform mat4 setShadowMatrix;
uniform float setShadowTexel;
uniform float setShadowOn;
varying vec2 vTreeA;
varying vec2 vTreeB;
varying float vTreeW;
varying float vTreeTop;
varying vec3 vTreeWorld;
float treeShade() {
  if (setShadowOn < 0.5) return 1.0;
  vec4 p = setShadowMatrix * vec4(vTreeWorld, 1.0);
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float z = p.z - 0.002;
  float lit = 0.0;
  for (int i = -1; i <= 1; i += 2) for (int j = -1; j <= 1; j += 2) {
    lit += texture(setShadowMap, vec3(p.xy + vec2(float(i), float(j)) * 1.5 * setShadowTexel, z));
  }
  // the frames hold sun and sky together: in a wall's shadow, roughly the sky's share
  return mix(0.45, 1.0, lit / 4.0);
}`;

const FRAG_MAP = /* glsl */ `
  if (vTreeTop > 0.5) {
    diffuseColor.a = step(length(vTreeA - 0.5), 0.5);
  } else {
    vec4 a = texture2D(map, vTreeA);
    vec4 b = texture2D(map, vTreeB);
    float wa = a.a * (1.0 - vTreeW), wb = b.a * vTreeW;
    diffuseColor.rgb = (a.rgb * wa + b.rgb * wb) / max(wa + wb, 1e-4) * treeGain;
    // the thin edges carry colour bled in from the foliage's mean (lighter
    // than the needles at the rim): darkened by how little they cover, they
    // stop drawing a pale outline round the crown
    diffuseColor.rgb *= mix(0.75, 1.0, smoothstep(0.15, 0.75, wa + wb));
    #ifndef TREE_BAKE
    diffuseColor.rgb *= treeShade();
    #endif
    diffuseColor.a = wa + wb;
    #ifndef TREE_BAKE
    // mipmaps average the needles' cut-outs away: a far tree went see-through
    // and grey. Give back the coverage the lower levels lose.
    vec2 texels = fwidth(vTreeA) * vec2(textureSize(map, 0));
    float lod = max(0.0, log2(max(texels.x, texels.y)));
    diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + 0.45 * lod));
    // alpha to coverage over the cut-outs' wide soft rims dithered a broken
    // pale line round every clump: the edge sharpened to one pixel at the cut
    diffuseColor.a = clamp((diffuseColor.a - 0.5) / max(fwidth(diffuseColor.a), 1e-4) + 0.5, 0.0, 1.0);
    #endif
  }`;

/**
 * The card material (or the baking one). Shares `shared` uniforms between
 * the two, so a texture or manifest set once reaches both.
 * @param {Record<string, THREE.IUniform>} shared
 * @param {boolean} bake
 */
function cardMaterial(shared, bake) {
  const mat = new THREE.MeshBasicMaterial({
    map: shared.map.value,
    alphaTest: bake ? 0.5 : 0.35,
    alphaToCoverage: !bake,
    side: THREE.DoubleSide,
    colorWrite: !bake,
  });
  // (baking: no shadow lookup, it may be the shadow being drawn)
  // Half the haze of the walls and halls at the same distance: a dark crown
  // takes the air's light far more than a lit wall does (the woods behind the
  // gate, 150-425 chi off, came out L 34 C 4 under it against L 15 C 13 clear,
  // a grey card), and a wood 30 m off still reads green in a photograph.
  mat.defines = bake ? { TREE_BAKE: "" } : { FOG_SCALE: "0.5" };
  mat.onBeforeCompile = (shader) => {
    // the material's map uniform is the atlas; the rest are ours
    const { map: _, ...rest } = shared;
    Object.assign(shader.uniforms, rest);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
      .replace("#include <project_vertex>", VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
      .replace("#include <map_fragment>", FRAG_MAP);
  };
  mat.customProgramCacheKey = () => (bake ? "treeCardBake" : "treeCard");
  return mat;
}

/** Stands in for an atlas until one comes (the sampler must have a texture). */
const NO_TREE = placeholder([0, 0, 0]);

export class Trees {
  /** @param {TreePlace[]} places */
  constructor(places) {
    this.group = new THREE.Group();
    this.group.name = "trees";
    /** @type {Map<TreeKind, {mesh: THREE.InstancedMesh, uniforms: Record<string, THREE.IUniform>, n: number, ready: boolean}>} */
    this.kinds = new Map();
    /** stand-ins for the courtyard's baked shadow (environment.js SetShadow; shadeFrom) */
    this.shadow = {
      setShadowMap: { value: /** @type {THREE.Texture | null} */ (null) },
      setShadowMatrix: { value: new THREE.Matrix4() },
      setShadowTexel: { value: 1 },
      setShadowOn: { value: 0 },
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Matrix4();
    for (const kind of KINDS) {
      const mine = places.filter((p) => p.kind === kind);
      if (!mine.length) continue;
      /** @type {Record<string, THREE.IUniform>} */
      const uniforms = {
        map: { value: NO_TREE },
        treeCard: { value: new THREE.Vector4(0.5, 1, 0.5, 0.2) },
        treeFrames: { value: new THREE.Vector2(16, 4) },
        treeGain: { value: 1 },
        treeSun: { value: SUN_DIR },
        ...this.shadow,
      };
      const mesh = new THREE.InstancedMesh(geo, cardMaterial(uniforms, false), mine.length);
      mesh.name = `trees.${kind}`;
      // the cards are spread in the shader: the geometry's bounds say nothing
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.userData.noAO = true;
      mesh.userData.bakeMaterial = cardMaterial(uniforms, true);
      mine.forEach((p, i) => {
        // scale: the tree's height in chi (the card is in tree heights)
        m.makeScale(p.h, p.h, p.h).setPosition(p.x, 0, p.z);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, new THREE.Color(p.tint, p.tint, p.tint * 0.97));
      });
      // drawn once the first atlas is in (compiled before)
      mesh.count = 0;
      this.kinds.set(kind, { mesh, uniforms, n: mine.length, ready: false });
      this.group.add(mesh);
    }
  }

  /**
   * Read the courtyard's baked shadow (its uniforms, shared).
   * @param {{uniforms: Record<string, THREE.IUniform>}} setShadow
   */
  shadeFrom(setShadow) {
    // before the cards are compiled: the programs take the uniform objects they find
    for (const { uniforms } of this.kinds.values()) {
      for (const k of Object.keys(this.shadow)) uniforms[k] = setShadow.uniforms[k];
    }
  }

  /**
   * Put a set of atlases up (the small ones first, the full ones later): only
   * a texture and uniforms change, nothing recompiles.
   * @param {Record<string, TreeCard>} manifest @param {Map<string, THREE.Texture>} atlases
   */
  set(manifest, atlases) {
    for (const [kind, k] of this.kinds) {
      const t = manifest[kind], tex = atlases.get(kind);
      if (!t || !tex) continue;
      const u = k.uniforms;
      u.treeCard.value.set(t.card[0] / t.tree, t.card[1] / t.tree, t.card[2] / t.tree, t.reach / t.tree);
      u.treeFrames.value.set(t.frames, t.cols);
      // the scanned needles are darker than a palace's old pines photograph:
      // lifted a third, so a tree is not the darkest thing in a sunny view
      u.treeGain.value = t.gain * LIFT;
      u.map.value = tex;
      for (const mat of [/** @type {THREE.MeshBasicMaterial} */ (k.mesh.material), k.mesh.userData.bakeMaterial]) mat.map = tex;
      k.mesh.count = k.n;
      k.ready = true;
    }
  }

  /** Every kind has an atlas up. */
  get ready() {
    return [...this.kinds.values()].every((k) => k.ready);
  }
}

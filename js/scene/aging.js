// Weathering for the courtyard: rain streaks down the red walls, grime
// splashed up their feet, faded and blotchy lacquer, dirt runs on the roofs,
// lichen and grime on the stone, verdigris on the bronze. Real courtyards are
// never this clean, and the clean, even colour was much of what read as CG.
//
// Driven by position in the courtyard's frame (AGE_ORIGIN: the courtyard and
// the gate stand at the origin, design/decisions/0018), with one or two taps of the procedural
// noise texture (texgen.js clouds: R fine fbm, G slow variation) per effect
// instead of per-pixel noise maths: cheap enough for the tablet tiers. Only
// the albedo, roughness and metalness change, so it chains with any other
// patch (environment.js SetShadow) and stays out of the light model.

import * as THREE from "three";

/** The courtyard's origin (it stands still at the world's: design/decisions/0018). */
export const AGE_ORIGIN = { value: new THREE.Vector3() };

/** sRGB hex → linear vec3 literal. @param {number} hex */
const lin = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

/**
 * Each kind: GLSL with P (position in the courtyard's frame, chi), N (normal), c
 * (linear albedo, writable), rough, metal (writable), and agN(vec2) → 0..1.
 * Walls run along x or z, so (P.x + P.z) is the distance along any wall.
 */
const KINDS = {
  plaster: `
    float along = P.x + P.z;
    // runs hanging from the coping: long and thin, stretched down the wall
    float s = agN(vec2(along * 0.09, P.y * 0.0035 + 0.37));
    c *= 1.0 - 0.36 * smoothstep(0.53, 0.72, s);
    // big blotches where the wash has worn and been patched
    c *= mix(0.86, 1.08, agG(vec2(along, P.y * 1.6) * 0.012));
    // grime splashed up from the paving, a ragged edge 3–6 chi up
    float foot = 1.0 - smoothstep(2.2, 5.5 + 4.0 * agN(vec2(along * 0.05, 0.71)), P.y);
    c = mix(c, c * ${lin(0x6e5c48)}, foot * 0.9);
    rough = min(1.0, rough + 0.1 * foot);
  `,
  lacquer: `
    float along = P.x + P.z;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // sun-faded towards a chalky orange in patches
    float fade = smoothstep(0.4, 0.7, agG(vec2(along * 0.05, P.y * 0.08) + 0.2));
    c = mix(c, mix(vec3(l), c, 0.7) * ${lin(0xf0b8a0)}, fade * 0.6);
    c *= 1.0 - 0.22 * smoothstep(0.5, 0.75, agN(vec2(along * 0.4, P.y * 0.01)));
    float foot = 1.0 - smoothstep(1.0, 3.5, P.y);
    c = mix(c, c * ${lin(0x8a7660)}, foot * 0.7);
    rough = min(1.0, rough + 0.25 * fade + 0.15 * foot);
  `,
  roof: `
    float along = P.x + P.z;
    // dirt washed down the slope in lanes, and the tiles' own odd tones
    float lane = agN(vec2(along * 0.12, P.y * 0.02 + 0.53));
    c *= 1.0 - 0.38 * smoothstep(0.48, 0.7, lane);
    c *= mix(0.82, 1.1, agG(vec2(P.x, P.z) * 0.02 + 0.6));
    // lichen and dust where it faces up
    float up = smoothstep(0.3, 0.9, N.y);
    c = mix(c, ${lin(0x8c8a78)}, up * 0.22 * smoothstep(0.45, 0.75, agN(vec2(P.x, P.z) * 0.08)));
    rough = min(1.0, rough + 0.2 * up);
    // seen from below (the upturned corners): red roof boards and the green
    // rafters on them, one rafter every half row of tiles (a texture spans
    // eight rows), not the tiles' glaze
    if (!gl_FrontFacing) {
      #ifdef USE_MAP
        float raft = smoothstep(0.08, 0.16, abs(fract(vMapUv.x * 16.0) - 0.5));
      #else
        float raft = 1.0;
      #endif
      c = mix(${lin(0x2f4a3c)}, ${lin(0x6a2a1c)}, raft) * mix(0.7, 1.0, agG(vec2(P.x, P.z) * 0.05));
      rough = 0.85;
    }
  `,
  stone: `
    float along = P.x + P.z;
    float lich = smoothstep(0.58, 0.72, agN(vec2(along * 0.07, P.y * 0.2 + 0.11)));
    c = mix(c, c * ${lin(0xb0ad90)}, lich * 0.5);
    c *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 1.4, P.y));
    c *= mix(0.88, 1.04, agG(vec2(along, P.y) * 0.03));
    rough = min(1.0, rough + 0.1 * lich);
  `,
  bronze: `
    float along = P.x + P.z;
    float pat = smoothstep(0.42, 0.66, agN(vec2(along * 0.25, P.y * 0.25)) + 0.2 * N.y);
    c = mix(c, ${lin(0x5d8070)} * (0.75 + 0.5 * agG(vec2(along, P.y) * 0.3)), pat * 0.45);
    metal = mix(metal, 0.15, pat);
    rough = mix(rough, 0.85, pat);
  `,
  gold: `
    float t = agN(vec2(P.x + P.z, P.y) * 0.3);
    c *= mix(0.72, 1.0, t);
    rough = min(1.0, rough + 0.2 * (1.0 - t));
  `,
};

/** @typedef {keyof typeof KINDS} AgingKind */

/**
 * Weather a material. Chains any onBeforeCompile already set; call before
 * the material is compiled.
 * @param {THREE.MeshStandardMaterial} mat
 * @param {AgingKind} kind
 * @param {THREE.Texture} noise texgen.js clouds (repeat-wrapped)
 */
export function age(mat, kind, noise) {
  if (mat.userData.aging) return;
  mat.userData.aging = kind;
  const prev = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.uniforms.ageNoise = { value: noise };
    shader.uniforms.ageOrigin = AGE_ORIGIN;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec3 ageOrigin;\nvarying vec3 vAgP;\nvarying vec3 vAgN;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvAgP = (modelMatrix * vec4(transformed, 1.0)).xyz - ageOrigin;\nvAgN = mat3(modelMatrix) * objectNormal;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D ageNoise;
        varying vec3 vAgP;
        varying vec3 vAgN;
        float agN(vec2 p) { return texture2D(ageNoise, p).r; }
        float agG(vec2 p) { return texture2D(ageNoise, p).g; }`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        {
          vec3 P = vAgP, N = normalize(vAgN), c = diffuseColor.rgb;
          float rough = roughnessFactor, metal = metalnessFactor;
          ${KINDS[kind]}
          diffuseColor.rgb = max(c, vec3(0.0));
          roughnessFactor = rough;
          metalnessFactor = metal;
        }`,
      );
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|age:${kind}`;
  mat.needsUpdate = true;
}

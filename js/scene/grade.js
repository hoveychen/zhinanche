// A photographic grade folded into tone mapping, so it costs no pass and every
// tier has it: three's Neutral curve (faithful to the albedo, and flat for it),
// then an S on the display values, the shade a little cooler and the light a
// little warmer, as a camera's picture profile does under a low afternoon sun.
// The tints multiply (black stays black: added, they greyed the darks) and are
// mild, so the gears' blue / orange / gold read as before.
//
// Fog moves in front of tone mapping, for every tier. three mixes it in after
// tone mapping and the sRGB encode: drawn straight to the screen (medium,
// lite) the haze went onto display values, drawn into the high tier's linear
// buffer it went onto radiance, so the same dark tree was much bluer in high
// (measured: 57 against 30 in blue). Now it always goes onto radiance, as
// haze does, and leaves the court itself clear: it starts FOG_CLEAR chi out.
//
// Installed into three's chunks at import, before any program is compiled
// (environment.js sets CustomToneMapping).

import * as THREE from "three";

/** No haze nearer than this (chi): the court is clear air; the far halls and hills are not. */
export const FOG_CLEAR = 110;

const GRADE = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  vec3 c = NeutralToneMapping( color );
  // roughly display values, where a print curve lives
  vec3 g = sqrt( max( c, vec3( 0.0 ) ) );
  // an S: deeper shade, more snap in the midtones
  g = mix( g, g * g * ( 3.0 - 2.0 * g ), 0.3 );
  float l = dot( g, vec3( 0.2126, 0.7152, 0.0722 ) );
  float shade = 1.0 - smoothstep( 0.08, 0.5, l );
  float light = smoothstep( 0.45, 0.95, l );
  g *= 1.0 + vec3( -0.05, -0.005, 0.07 ) * shade + vec3( 0.035, 0.008, -0.05 ) * light;
  g = clamp( g, 0.0, 1.0 );
  return g * g;
}`;

const FOG = /* glsl */ `
#ifdef USE_FOG
  float fogD = max( vFogDepth - ${FOG_CLEAR.toFixed(1)}, 0.0 );
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogD * fogD );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
const stock = "vec3 CustomToneMapping( vec3 color ) { return color; }";
if (chunk.includes(stock)) THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(stock, GRADE);
// every built-in material includes tonemapping_fragment just before fog_fragment
if (!THREE.ShaderChunk.tonemapping_fragment.includes("fogFactor")) {
  THREE.ShaderChunk.tonemapping_fragment = FOG + THREE.ShaderChunk.tonemapping_fragment;
  THREE.ShaderChunk.fog_fragment = "";
}

/** The grade is in: use CustomToneMapping (falls back to Neutral if three's chunk changed). */
export const GRADED = chunk.includes(stock);

// A photographic grade folded into tone mapping, so it costs no pass and every
// tier has it: three's Neutral curve (faithful to the albedo, and flat for it),
// then a gentle S on the display values, a touch cooler in the shade and warmer
// in the light, as a camera's picture profile does. Hue-preserving and mild,
// so the gears' blue / orange / gold read as before.
//
// Installed into three's tone-mapping chunk at import, before any program is
// compiled (environment.js sets CustomToneMapping).

import * as THREE from "three";

const GRADE = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  vec3 c = NeutralToneMapping( color );
  // roughly display values, where a print curve lives
  vec3 g = sqrt( max( c, vec3( 0.0 ) ) );
  // a soft S: deeper shade, a little more snap in the midtones
  g = mix( g, g * g * ( 3.0 - 2.0 * g ), 0.22 );
  float l = dot( g, vec3( 0.2126, 0.7152, 0.0722 ) );
  g += vec3( -0.010, -0.002, 0.012 ) * ( 1.0 - smoothstep( 0.05, 0.45, l ) );
  g += vec3( 0.012, 0.005, -0.010 ) * smoothstep( 0.55, 0.95, l );
  g = clamp( g, 0.0, 1.0 );
  return g * g;
}`;

const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
const stock = "vec3 CustomToneMapping( vec3 color ) { return color; }";
if (chunk.includes(stock)) THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(stock, GRADE);

/** The grade is in: use CustomToneMapping (falls back to Neutral if three's chunk changed). */
export const GRADED = chunk.includes(stock);

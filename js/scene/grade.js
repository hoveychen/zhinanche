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
// haze does. Its colour comes linear too: three hands fogColor over in the
// output's colour space when drawing to the screen (made for its own fog,
// mixed after the encode), so medium and lite took the sRGB-encoded colour
// for radiance and their haze was far paler than high's (pure haze 225 against
// 170 in red, measured; a shaded wall at 100–200 chi L 39 against 26).
//
// And it is aerial perspective, not a curtain at the far edge: it thins
// exponentially from FOG_CLEAR chi out (the chariot and the court round it
// stay clear), so the gate tower behind the court takes about a fifth of the
// air's colour, the far halls a third to a half, the hills two thirds. The
// squared falloff it had left everything up to the tower nearly as clear as
// the chariot (4.5% at 229 chi, measured), and the red behind the chariot
// as bright and saturated as the chariot itself. The air's colour follows
// the sky's low band: warmer and brighter towards the sun, a cool blue-grey
// away from it (the photographed sky's own tint, environment.js), so a hall
// against a warm sky melts into warm air. (Away from the sun it was a rose,
// the anti-solar belt's: but that belt shows only after sunset; with the sun
// 17° up the sky away from it is the bluest there is, and the rose haze over
// every far tree and hall read as a lilac-grey card. Measured on the woods
// behind the gate, 1440 high: L 34 C 3.9 h 319.)
//
// A material may thin its haze (define FOG_SCALE): the trees do (trees.js).
//
// Installed into three's chunks before any program is compiled
// (environment.js calls installFog at import and sets CustomToneMapping).

import * as THREE from "three";

/** No haze nearer than this (chi): the court round the chariot is clear air. */
export const FOG_CLEAR = 40;

/** Aerial perspective's extinction per chi beyond FOG_CLEAR (scene.fog.density). */
export const FOG_DENSITY = 0.0013;

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

/**
 * The low sky's (and the haze's) tint away from the sun, on the sky's own
 * colour: a little cooler (environment.js SKY_FRAG lowTint uses it too).
 */
export const AWAY = ["0.94", "0.99", "1.06"];

/** @param {number[]} v @returns {string} */
const vec3 = (v) => `vec3( ${v.map((x) => x.toFixed(4)).join(", ")} )`;

/**
 * The haze, coloured as the low sky in its direction.
 * @param {{x: number, y: number, z: number}} sun unit, towards the sun
 * @param {{r: number, g: number, b: number}} glow linear: the sky's glow round the sun
 */
const fog = (sun, glow) => {
  const flat = Math.hypot(sun.x, sun.z);
  return /* glsl */ `
#ifdef USE_FOG
  float fogD = max( vFogDepth - ${FOG_CLEAR.toFixed(1)}, 0.0 );
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogD );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  #ifdef FOG_SCALE
    fogFactor *= FOG_SCALE;
  #endif
  // fogColor is in the output's colour space (sRGB on the screen): back to linear
  vec3 fogLin = linearToOutputTexel( vec4( 0.5 ) ).r > 0.6 ? sRGBTransferEOTF( vec4( fogColor, 1.0 ) ).rgb : fogColor;
  vec3 fogDir = normalize( vFogDir );
  float fogAz = dot( normalize( fogDir.xz + 1e-5 ), vec2( ${(sun.x / flat).toFixed(4)}, ${(sun.z / flat).toFixed(4)} ) );
  float fogSun = pow( clamp( 0.5 + 0.5 * fogAz, 0.0, 1.0 ), 2.0 );
  float fogS = max( dot( fogDir, ${vec3([sun.x, sun.y, sun.z])} ), 0.0 );
  vec3 fogCol = fogLin * mix( vec3( ${AWAY.join(", ")} ), vec3( 1.2, 1.0, 0.8 ), fogSun )
    + ${vec3([glow.r, glow.g, glow.b])} * ( pow( fogS, 8.0 ) * 0.1 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif
`;
};

const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
const stock = "vec3 CustomToneMapping( vec3 color ) { return color; }";
if (chunk.includes(stock)) THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(stock, GRADE);

/**
 * Put the haze into three's chunks (once, before any program compiles).
 * @param {{x: number, y: number, z: number}} sun @param {{r: number, g: number, b: number}} glow
 */
export function installFog(sun, glow) {
  // every built-in material includes tonemapping_fragment just before fog_fragment
  if (THREE.ShaderChunk.tonemapping_fragment.includes("fogFactor")) return;
  THREE.ShaderChunk.tonemapping_fragment = fog(sun, glow) + THREE.ShaderChunk.tonemapping_fragment;
  THREE.ShaderChunk.fog_fragment = "";
  // the view ray in the world, for the haze's colour
  THREE.ShaderChunk.fog_pars_vertex += "\n#ifdef USE_FOG\n\tvarying vec3 vFogDir;\n#endif";
  THREE.ShaderChunk.fog_vertex += "\n#ifdef USE_FOG\n\tvFogDir = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;\n#endif";
  THREE.ShaderChunk.fog_pars_fragment += "\n#ifdef USE_FOG\n\tvarying vec3 vFogDir;\n#endif";
}

/** The grade is in: use CustomToneMapping (falls back to Neutral if three's chunk changed). */
export const GRADED = chunk.includes(stock);

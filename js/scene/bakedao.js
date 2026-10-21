// Baked sky occlusion for the courtyard: the paving darkens at the feet of
// the walls, steps, plinths, lions and vats and in the court's corners, the
// corridors are dim under their roofs, the gate tower's foot is in its own
// gloom. Real courtyards have this everywhere and its absence read as CG; the
// high tier's screen-space occlusion only reaches a few chi.
//
// Space for time: once the courtyard is built (Look.buildYard, while the
// loading note is still up) its height is drawn from straight above into a
// depth map, and one full-screen pass turns that into a texture of how much
// sky a point sees (horizon search in 12 directions), at four heights above
// the paving, one per channel. Every frame a fragment reads it once and dims
// its indirect light (sky and hemisphere), not the sun: the baked shadow
// (environment.js SetShadow) does the sun.
//
// The courtyard rides with the chariot (Look.follow), so everything is in the
// rider's frame: the map is baked round the rider and read at world − rider.

import * as THREE from "three";
import { AGE_ORIGIN } from "./aging.js";

/** Heights (chi above the paving) the four channels are baked at. */
const LEVELS = [0.5, 4, 10, 20];
/** The height map's camera: top and depth range. */
const TOP = 120;

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BAKE_FRAG = /* glsl */ `
uniform sampler2D heightMap;
uniform float span;
uniform float top;
uniform float far;
varying vec2 vUv;
// height of the courtyard at rider-local xz (below the paving where there is nothing)
float heightAt(vec2 xz) {
  vec2 uv = vec2(xz.x / (2.0 * span) + 0.5, 0.5 - xz.y / (2.0 * span));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  float d = texture2D(heightMap, uv).r;
  return top - (1.0 + d * (far - 1.0));
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * span;
  const float L0 = ${LEVELS[0].toFixed(1)}, L1 = ${LEVELS[1].toFixed(1)}, L2 = ${LEVELS[2].toFixed(1)}, L3 = ${LEVELS[3].toFixed(1)};
  vec4 vis = vec4(0.0);
  // a turn per texel against banding
  float spin = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) * 0.5236;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236 + spin;
    vec2 dir = vec2(cos(a), sin(a));
    vec4 s = vec4(0.0);
    float r = 0.7;
    for (int k = 0; k < 8; k++) {
      float h = heightAt(p + dir * r);
      s = max(s, (vec4(h) - vec4(L0, L1, L2, L3)) / r);
      r *= 1.62;
    }
    // cosine-weighted sky over the horizon: cos² of its elevation
    vis += 1.0 / (1.0 + s * s);
  }
  gl_FragColor = vis / 12.0;
}`;

export class BakedAO {
  /** @param {number} size texels @param {number} half half width of the covered square (chi) */
  constructor(size, half) {
    this.size = size;
    this.half = half;
    this.rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.uniforms = {
      bakedAOMap: { value: /** @type {THREE.Texture | null} */ (null) },
      bakedAOHalf: { value: half },
      bakedAOOn: { value: 0 },
      bakedAOOrigin: AGE_ORIGIN,
    };
  }

  /**
   * Draw the casters' height from above, then bake the occlusion. The
   * casters sit round the rider (`at`); they are lent to a scratch scene and
   * put back.
   * @param {THREE.WebGLRenderer} renderer @param {THREE.Object3D[]} casters @param {THREE.Vector3} at the rider
   */
  bake(renderer, casters, at) {
    const { size, half } = this;
    const far = TOP + 10;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, far);
    cam.up.set(0, 0, -1);
    cam.position.set(at.x, TOP, at.z);
    cam.lookAt(at.x, 0, at.z);
    cam.updateMatrixWorld();
    const heights = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
    heights.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    heights.depthTexture.minFilter = heights.depthTexture.magFilter = THREE.NearestFilter;

    const scratch = new THREE.Scene();
    scratch.overrideMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    /** @type {[THREE.Object3D, THREE.Object3D | null, THREE.Matrix4][]} */
    const back = [];
    for (const o of casters) {
      o.updateWorldMatrix(true, false);
      back.push([o, o.parent, o.matrixWorld.clone()]);
      scratch.add(o);
      o.matrixWorld.decompose(o.position, o.quaternion, o.scale);
    }
    const prev = renderer.getRenderTarget();
    const shadowOn = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(heights);
    renderer.clear();
    renderer.render(scratch, cam);
    for (const [o, parent, mw] of back) {
      if (!parent) continue;
      parent.add(o);
      parent.matrixWorld.clone().invert().multiply(mw).decompose(o.position, o.quaternion, o.scale);
    }

    const pass = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      uniforms: { heightMap: { value: heights.depthTexture }, span: { value: half }, top: { value: TOP }, far: { value: far } },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), pass);
    quad.frustumCulled = false;
    const screen = new THREE.Scene();
    screen.add(quad);
    renderer.setRenderTarget(this.rt);
    renderer.render(screen, cam);
    renderer.setRenderTarget(prev);
    renderer.shadowMap.autoUpdate = shadowOn;

    scratch.overrideMaterial.dispose();
    pass.dispose();
    quad.geometry.dispose();
    heights.depthTexture.dispose();
    heights.dispose();
    this.uniforms.bakedAOMap.value = this.rt.texture;
    this.uniforms.bakedAOOn.value = 1;
  }

  /**
   * Make a lit material read the baked occlusion (indirect light only).
   * Chains any onBeforeCompile already set; before the material is compiled.
   * The map is a uniform, so baking later recompiles nothing.
   * @param {THREE.Material} mat
   */
  patch(mat) {
    if (mat.userData.bakedAO) return;
    mat.userData.bakedAO = true;
    const prev = mat.onBeforeCompile.bind(mat);
    const u = this.uniforms;
    mat.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vBaoP;\nvarying vec3 vBaoN;")
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          vBaoP = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vBaoN = mat3(modelMatrix) * objectNormal;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D bakedAOMap;
          uniform float bakedAOHalf;
          uniform float bakedAOOn;
          uniform vec3 bakedAOOrigin;
          varying vec3 vBaoP;
          varying vec3 vBaoN;
          float bakedAO() {
            if (bakedAOOn < 0.5) return 1.0;
            vec3 n = normalize(vBaoN);
            vec3 p = vBaoP - bakedAOOrigin;
            // read a little out from the surface, so a wall reads the air in front of it
            vec2 uv = (p.xz + n.xz * 1.5) / (2.0 * bakedAOHalf) + 0.5;
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
            vec4 v = texture2D(bakedAOMap, uv);
            float y = p.y + 0.3;
            float a = y < ${LEVELS[1].toFixed(1)} ? mix(v.r, v.g, clamp((y - ${LEVELS[0].toFixed(1)}) / ${(LEVELS[1] - LEVELS[0]).toFixed(1)}, 0.0, 1.0))
              : y < ${LEVELS[2].toFixed(1)} ? mix(v.g, v.b, (y - ${LEVELS[1].toFixed(1)}) / ${(LEVELS[2] - LEVELS[1]).toFixed(1)})
              : mix(v.b, v.a, clamp((y - ${LEVELS[2].toFixed(1)}) / ${(LEVELS[3] - LEVELS[2]).toFixed(1)}, 0.0, 1.0));
            a = mix(a, 1.0, smoothstep(${LEVELS[3].toFixed(1)}, ${(LEVELS[3] + 15).toFixed(1)}, y));
            // a wall face sees half the sky at best: the wall itself is the other half
            a = mix(a, min(1.0, a * 1.9), 1.0 - abs(n.y));
            return mix(0.22, 1.0, a);
          }`,
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
          float bao = bakedAO();
          reflectedLight.indirectDiffuse *= bao;
          reflectedLight.indirectSpecular *= bao;`,
        );
    };
    const prevKey = mat.customProgramCacheKey.bind(mat);
    mat.customProgramCacheKey = () => `${prevKey()}|bakedAO`;
    mat.needsUpdate = true;
  }

  dispose() {
    this.rt.dispose();
  }
}

// Light and air: a late-afternoon sky (deep blue overhead, a warm haze low
// down, scattered cumulus lit gold on the sun side), the same sky baked into
// a PMREM environment map for reflections on brass and lacquer, a low sun
// from the west-north-west (behind the follow camera's right shoulder, so the
// chariot and the red walls ahead are lit from the side and throw long
// shadows away from the viewer), the sun's soft shadow map that hugs the
// chariot, a contact shadow under it, and a one-off baked shadow map for the
// courtyard (SetShadow), which never moves relative to the sun.

import * as THREE from "three";
import { placeholder } from "./photo.js";

/** @import { Textures } from "./materials.js" */
/** @import { PhotoSky } from "./photo.js" */

/**
 * Direction to the sun: west, a little north (south = +z, west = −x), 28° up.
 * The follow camera looks south from the north, so the sun is behind it on
 * the right: side light on the chariot, shadows falling left and away.
 */
export const SUN_DIR = (() => {
  const elev = THREE.MathUtils.degToRad(28), az = THREE.MathUtils.degToRad(24);
  return new THREE.Vector3(-Math.cos(elev) * Math.cos(az), Math.sin(elev), -Math.cos(elev) * Math.sin(az)).normalize();
})();

/** Sky palette (sRGB hex → linear THREE.Color). */
export const SKY = {
  zenith: new THREE.Color(0x2a5fae),
  mid: new THREE.Color(0x5c90cc),
  horizon: new THREE.Color(0xaec8de),
  /** low haze on the sun's side */
  haze: new THREE.Color(0xf3d6ae),
  /** low haze on the far side: the faint pink of the anti-solar belt */
  antiHaze: new THREE.Color(0xdcccc8),
  glow: new THREE.Color(0xffc98a),
  ground: new THREE.Color(0x857c70),
};

/**
 * The sky's colour (no clouds) in a direction: the same formula as the
 * shader, so fog and anything pre-tinted with the sky match it.
 * @param {THREE.Vector3} dir unit
 * @param {THREE.Color} [out]
 */
export function skyAt(dir, out = new THREE.Color()) {
  const up = Math.max(dir.y, 0);
  out.copy(SKY.horizon).lerp(SKY.mid, Math.min(1, up * 5));
  out.lerp(SKY.zenith, Math.pow(up, 0.6));
  const flat = Math.hypot(dir.x, dir.z) || 1, sflat = Math.hypot(SUN_DIR.x, SUN_DIR.z);
  const az = (dir.x * SUN_DIR.x + dir.z * SUN_DIR.z) / (flat * sflat);
  const band = Math.exp(-up * 14);
  const low = SKY.antiHaze.clone().lerp(SKY.haze, Math.pow(Math.min(1, Math.max(0, 0.5 + 0.5 * az)), 1.5));
  out.lerp(low, band * 0.9);
  const s = Math.max(0, dir.dot(SUN_DIR));
  out.add(SKY.glow.clone().multiplyScalar(Math.pow(s, 5) * 0.22 + Math.pow(s, 40) * 0.5));
  return out;
}

/** Fog colour: the sky just above the horizon looking south (where the view goes). */
export const FOG = skyAt(new THREE.Vector3(0, 0.03, 1).normalize());

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 zenith;
uniform vec3 mid;
uniform vec3 horizon;
uniform vec3 haze;
uniform vec3 antiHaze;
uniform vec3 glow;
uniform vec3 groundCol;
uniform sampler2D clouds;
uniform float time;
uniform float cloudAmount;
uniform float brightness;
uniform sampler2D photo;
uniform float photoOn;
uniform vec2 photoElev;
uniform float photoGain;
uniform vec3 photoZenith;
uniform vec3 photoLow;
varying vec3 vDir;
float cloud(vec2 uv) {
  return texture2D(clouds, uv).r * 0.65 + texture2D(clouds, uv * 2.3 + 0.31).r * 0.35;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float up = max(h, 0.0);
  vec3 col = mix(horizon, mid, min(1.0, up * 5.0));
  col = mix(col, zenith, pow(up, 0.6));
  vec2 sflat = normalize(sunDir.xz);
  float az = dot(normalize(d.xz + 1e-5), sflat);
  vec3 low = mix(antiHaze, haze, pow(clamp(0.5 + 0.5 * az, 0.0, 1.0), 1.5));
  col = mix(col, low, exp(-up * 14.0) * 0.9);
  float s = max(dot(d, sunDir), 0.0);
  col += glow * (pow(s, 5.0) * 0.22 + pow(s, 40.0) * 0.5);
  if (cloudAmount > 0.0 && h > 0.0 && photoOn < 1.0) {
    // A flat cloud deck: uv from where the ray meets it.
    vec2 uv = d.xz / (h + 0.08) * 0.075 + vec2(time * 0.0012, time * 0.0005);
    float c = cloud(uv);
    // Lit edge: denser towards the sun means this side is in the cloud's shade.
    float towards = cloud(uv + sflat * 0.012);
    float cover = smoothstep(0.5, 0.72, c) * smoothstep(0.0, 0.16, h) * cloudAmount;
    float lit = clamp(0.62 + (c - towards) * 9.0, 0.0, 1.0);
    vec3 sunSide = vec3(1.08, 0.97, 0.86) + glow * 0.25 * (0.5 + 0.5 * az);
    vec3 shade = vec3(0.6, 0.64, 0.74);
    vec3 cc = mix(shade, sunSide, lit);
    // thick cores darker, thin edges let the blue through
    cc = mix(cc, cc * 0.84, smoothstep(0.7, 0.9, c));
    // far clouds melt into the haze
    cc = mix(low * 1.02, cc, smoothstep(0.02, 0.3, h));
    col = mix(col, cc, cover * 0.92);
  }
  if (h < 0.0) col = mix(low, groundCol, smoothstep(0.0, 0.2, -h));
  if (photoOn > 0.0) {
    // The photographed sky (equirect strip, column 0 north, clockwise; rows
    // from photoElev.y down to photoElev.x), stored as radiance / photoGain.
    float el = asin(clamp(h, -1.0, 1.0));
    float v = (el - photoElev.x) / (photoElev.y - photoElev.x);
    vec2 puv = vec2(fract(atan(d.x, -d.z) / 6.28318531), clamp(v, 0.002, 0.998));
    vec3 p = texture2D(photo, puv).rgb * photoGain;
    p = mix(p, photoZenith, smoothstep(0.9, 1.0, v));
    p = mix(p, photoLow, smoothstep(0.03, -0.01, v));
    if (h < 0.0) p = mix(p, groundCol, smoothstep(0.03, 0.2, -h));
    // a soft glow round our sun (the photo's own sun is painted out)
    p += glow * (pow(s, 8.0) * 0.1 + pow(s, 60.0) * 0.5);
    col = mix(col, p, photoOn);
  }
  col += vec3(1.0, 0.92, 0.8) * smoothstep(0.9994, 0.9997, s) * 16.0;
  gl_FragColor = vec4(col * brightness, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Stands in for the sky photo until it comes (a sampler must always have a texture). */
const NO_PHOTO = placeholder([0, 0, 0]);

/** @param {THREE.Texture | null} clouds */
function skyMaterial(clouds) {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: SUN_DIR },
      zenith: { value: SKY.zenith },
      mid: { value: SKY.mid },
      horizon: { value: SKY.horizon },
      haze: { value: SKY.haze },
      antiHaze: { value: SKY.antiHaze },
      glow: { value: SKY.glow },
      groundCol: { value: SKY.ground },
      clouds: { value: clouds },
      time: { value: 0 },
      cloudAmount: { value: clouds ? 1 : 0 },
      brightness: { value: 1 },
      photo: { value: NO_PHOTO },
      photoOn: { value: 0 },
      photoElev: { value: new THREE.Vector2(0, 1) },
      photoGain: { value: 1 },
      photoZenith: { value: SKY.zenith.clone() },
      photoLow: { value: FOG.clone() },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

/**
 * Point a sky material at a photo strip.
 * @param {Record<string, THREE.IUniform>} u @param {PhotoSky} photo @param {THREE.Texture} tex @param {number[]} elev degrees
 */
function photoUniforms(u, photo, tex, elev) {
  u.photo.value = tex;
  u.photoElev.value.set(THREE.MathUtils.degToRad(elev[0]), THREE.MathUtils.degToRad(elev[1]));
  u.photoGain.value = photo.headroom;
  u.photoZenith.value.fromArray(photo.zenith);
  u.photoLow.value.fromArray(photo.fog);
}

/** A soft dark pad, for contact shadows. @param {number} soft 0..1 edge width */
function padTexture(soft) {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // rounded-box distance in [-1, 1]²
      const u = Math.abs((x + 0.5) / S * 2 - 1), v = Math.abs((y + 0.5) / S * 2 - 1);
      const k = 1 - soft;
      const dx = Math.max(u - k, 0), dy = Math.max(v - k, 0);
      const d = Math.hypot(dx, dy) / soft;
      const a = Math.max(0, 1 - d);
      const o = (y * S + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 0;
      img.data[o + 3] = Math.round(255 * a * a * (3 - 2 * a));
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * Contact shadow under the chariot: a soft pad under the body and two under
 * the wheels. Child of the chariot holder, so it rides along.
 */
export function contactShadow() {
  const g = new THREE.Group();
  g.name = "contactShadow";
  const body = new THREE.Mesh(
    new THREE.PlaneGeometry(10.5, 6.6),
    new THREE.MeshBasicMaterial({ map: padTexture(0.55), transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false }),
  );
  body.rotation.x = -Math.PI / 2;
  body.position.set(0.4, 0.012, 0);
  g.add(body);
  const wheelMat = new THREE.MeshBasicMaterial({ map: padTexture(0.9), transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });
  for (const z of [-3, 3]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), wheelMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(0, 0.014, z);
    g.add(w);
  }
  for (const m of g.children) m.renderOrder = 1;
  return g;
}

/**
 * Sun shadows for the courtyard. The courtyard moves with the chariot but
 * never turns, and the sun never moves, so its shadows are fixed relative to
 * it: render its depth from the sun once, and let the courtyard's and the
 * ground's materials look it up (patch). Only the sun's direct light is
 * shaded; sky light still fills the shadows.
 */
export class SetShadow {
  /** @param {number} size map size (texels) @param {number} half half width of the covered square (chi) */
  constructor(size, half) {
    this.size = size;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 1600);
    cam.position.copy(SUN_DIR).multiplyScalar(700);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    this.camera = cam;
    this.rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    this.rt.depthTexture.minFilter = this.rt.depthTexture.magFilter = THREE.NearestFilter;
    /** world → shadow map [0, 1]³, for the courtyard at the origin */
    this.base = new THREE.Matrix4()
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix)
      .multiply(cam.matrixWorldInverse);
    this.uniforms = {
      setShadowMap: { value: /** @type {THREE.Texture | null} */ (null) },
      setShadowMatrix: { value: new THREE.Matrix4() },
      setShadowTexel: { value: 1 / size },
      setShadowOn: { value: 0 },
    };
    this.offset = new THREE.Vector3();
  }

  /**
   * Render the casters' depth (they must sit as at the origin). Reparents
   * them into a scratch scene for the render and puts them back.
   * @param {THREE.WebGLRenderer} renderer @param {THREE.Object3D[]} casters
   */
  bake(renderer, casters) {
    const scratch = new THREE.Scene();
    scratch.overrideMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    /** @type {[THREE.Object3D, THREE.Object3D | null, THREE.Matrix4][]} */
    const back = [];
    for (const o of casters) {
      o.updateWorldMatrix(true, false);
      back.push([o, o.parent, o.matrixWorld.clone()]);
      scratch.add(o);
    }
    for (const [o, , mw] of back) {
      // keep the caster's placement relative to its rider (no rider offset)
      const local = mw.clone();
      local.elements[12] -= this.offset.x;
      local.elements[14] -= this.offset.z;
      local.decompose(o.position, o.quaternion, o.scale);
    }
    const prev = renderer.getRenderTarget();
    const shadowOn = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scratch, this.camera);
    renderer.setRenderTarget(prev);
    renderer.shadowMap.autoUpdate = shadowOn;
    for (const [o, parent, mw] of back) {
      if (parent) {
        parent.add(o);
        const local = parent.matrixWorld.clone().invert().multiply(mw);
        local.decompose(o.position, o.quaternion, o.scale);
      }
    }
    scratch.overrideMaterial.dispose();
    this.uniforms.setShadowMap.value = this.rt.depthTexture;
    this.uniforms.setShadowOn.value = 1;
    this.move(this.offset.x, this.offset.z);
  }

  /** The courtyard is now at (x, 0, z). @param {number} x @param {number} z */
  move(x, z) {
    this.offset.set(x, 0, z);
    this.uniforms.setShadowMatrix.value.copy(this.base).multiply(new THREE.Matrix4().makeTranslation(-x, 0, -z));
  }

  /**
   * Make a lit material take the baked shadow. Chains any onBeforeCompile
   * already set (call after the material's own patches).
   * @param {THREE.Material} mat
   */
  patch(mat) {
    if (mat.userData.setShadow) return;
    mat.userData.setShadow = true;
    const prev = mat.onBeforeCompile.bind(mat);
    const u = this.uniforms;
    mat.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vSetWorld;\nvarying vec3 vSetNormal;")
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          vSetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vSetNormal = normalize(mat3(modelMatrix) * objectNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D setShadowMap;
          uniform mat4 setShadowMatrix;
          uniform float setShadowTexel;
          uniform float setShadowOn;
          varying vec3 vSetWorld;
          varying vec3 vSetNormal;
          float setShadow() {
            if (setShadowOn < 0.5) return 1.0;
            vec4 p = setShadowMatrix * vec4(vSetWorld + normalize(vSetNormal) * 0.35, 1.0);
            if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
            float z = p.z - 0.0004;
            float lit = 0.0;
            for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
              lit += step(z, texture2D(setShadowMap, p.xy + vec2(float(i), float(j)) * setShadowTexel).r);
            }
            return lit / 9.0;
          }`,
        )
        .replace(
          "#include <lights_fragment_end>",
          `#include <lights_fragment_end>
          float setLit = setShadow();
          reflectedLight.directDiffuse *= setLit;
          reflectedLight.directSpecular *= setLit;`,
        );
    };
    const prevKey = mat.customProgramCacheKey.bind(mat);
    mat.customProgramCacheKey = () => `${prevKey()}|setShadow`;
    mat.needsUpdate = true;
  }

  dispose() {
    this.rt.dispose();
  }
}

export class Environment {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {{shadowSize: number, clouds: boolean}} opts
   */
  constructor(renderer, scene, opts) {
    this.renderer = renderer;
    this.scene = scene;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    scene.background = FOG.clone();
    scene.fog = new THREE.FogExp2(FOG, 0.0016);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMaterial(null));
    this.sky.name = "sky";
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.sky.onBeforeRender = (_r, _s, cam) => this.sky.position.copy(cam.position);
    scene.add(this.sky);

    // Fill from the sky comes from the environment map; a faint hemisphere
    // light keeps the shade side from going dead before the map is ready.
    this.hemi = new THREE.HemisphereLight(0xbcd3ea, 0x8a7a66, 0.45);
    scene.add(this.hemi);

    const sun = new THREE.DirectionalLight(0xffdcb0, 3.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(opts.shadowSize, opts.shadowSize);
    // Low sun, long shadows: the box reaches out on the side they fall.
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -21;
    sc.right = sc.top = 21;
    sc.near = 5;
    sc.far = 110;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 2.5;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.cloudsWanted = opts.clouds;
    /** @type {Textures | null} */
    this.tex = null;
    /** @type {PhotoSky | null} */
    this.photo = null;
    /** the photo's fade-in, 0..1 */
    this.photoFade = 0;
    this.fogFrom = FOG.clone();
  }

  /** @returns {Record<string, THREE.IUniform>} */
  get skyUniforms() {
    return /** @type {THREE.ShaderMaterial} */ (this.sky.material).uniforms;
  }

  /**
   * Put the photographed sky up (it fades in) and bake it into the
   * environment map. Same program as before: only uniforms change.
   * @param {PhotoSky} photo
   * @param {boolean} [now] no fade (before the first picture)
   */
  setPhoto(photo, now = false) {
    this.photo = photo;
    const u = this.skyUniforms;
    photoUniforms(u, photo, photo.bgTex, photo.bg.elev);
    u.photoOn.value = 0;
    this.photoFade = 0;
    if (now) this.update(0.8);
    if (this.tex) this.bake(this.tex);
  }

  /** Bake the sky into the environment map, once textures exist. @param {Textures | null} tex */
  bake(tex) {
    this.tex = tex;
    const mat = /** @type {THREE.ShaderMaterial} */ (this.sky.material);
    if (tex && this.cloudsWanted && this.photoFade < 1) {
      mat.uniforms.clouds.value = tex.clouds;
      mat.uniforms.cloudAmount.value = 1;
    }
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), skyMaterial(tex?.clouds ?? null));
    const envMat = /** @type {THREE.ShaderMaterial} */ (envSky.material);
    envMat.uniforms.cloudAmount.value = tex ? 0.7 : 0;
    if (this.photo) {
      photoUniforms(envMat.uniforms, this.photo, this.photo.envTex, this.photo.env.elev);
      envMat.uniforms.photoOn.value = 1;
    }
    envScene.add(envSky);
    // The courtyard as the chariot sees it: paving below, a red wall band
    // and dark-gold roofs round the horizon (walls are ~70–180 chi off).
    const floor = new THREE.Mesh(new THREE.CircleGeometry(38, 32), new THREE.MeshBasicMaterial({ color: 0x8a8378 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    envScene.add(floor);
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(36, 36, 2.4, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8a3020, side: THREE.BackSide }),
    );
    wall.position.y = -0.3;
    envScene.add(wall);
    // Roofs over the wall: a hard light/dark line for metal to catch.
    const eaves = new THREE.Mesh(
      new THREE.CylinderGeometry(35.5, 35.5, 1.2, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x6a5228, side: THREE.BackSide }),
    );
    eaves.position.y = 1.4;
    envScene.add(eaves);
    // The sun itself, as a small very bright disc: the glint on brass and lacquer.
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(28, 23, 17) }));
    sunDisc.position.copy(SUN_DIR).multiplyScalar(30);
    sunDisc.lookAt(0, 0, 0);
    envScene.add(sunDisc);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromScene(envScene, 0.02, 0.1, 100);
    pmrem.dispose();
    envMat.dispose();
    envSky.geometry.dispose();
    this.scene.environment?.dispose();
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.9;
    this.hemi.intensity = 0.12;
  }

  /** Keep the shadow camera on the chariot. @param {number} x @param {number} z */
  follow(x, z) {
    // Centre the box a little down-sun, where the long shadows fall.
    const cx = x - SUN_DIR.x * 9, cz = z - SUN_DIR.z * 9;
    this.sun.position.set(cx + SUN_DIR.x * 60, SUN_DIR.y * 60, cz + SUN_DIR.z * 60);
    this.sun.target.position.set(cx, 0, cz);
  }

  /** @param {number} dt */
  update(dt) {
    const u = this.skyUniforms;
    u.time.value += dt;
    if (this.photo && this.photoFade < 1) {
      this.photoFade = Math.min(1, this.photoFade + dt / 0.8);
      const k = this.photoFade * this.photoFade * (3 - 2 * this.photoFade);
      u.photoOn.value = k;
      // clouds drawn by the shader only while the photo is still coming in
      if (k >= 1) u.cloudAmount.value = 0;
      const fog = new THREE.Color().fromArray(this.photo.fog);
      const c = this.fogFrom.clone().lerp(fog, k);
      if (this.scene.fog) this.scene.fog.color.copy(c);
      if (this.scene.background instanceof THREE.Color) this.scene.background.copy(c);
    }
  }

  /** @param {number} size */
  setShadowSize(size) {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }
}

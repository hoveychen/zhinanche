// Light and air: a layered sky (zenith to warm horizon haze, sun glow, a
// drifting cloud deck), the same sky baked into a PMREM environment map for
// reflections on brass and lacquer, a late-afternoon sun from the south-west
// whose soft shadow map hugs the chariot, and a contact shadow under it.

import * as THREE from "three";

/** @import { Textures } from "./materials.js" */

/** Direction to the sun: south-west (south = +z, west = −x), ~45° up. */
export const SUN_DIR = new THREE.Vector3(-0.52, 0.72, 0.46).normalize();

export const SKY = {
  zenith: new THREE.Color(0x3f78c4),
  horizon: new THREE.Color(0xc9d8e2),
  haze: new THREE.Color(0xe8dccb),
  ground: new THREE.Color(0x8d8578),
};

/** Fog colour: the haze where ground meets sky, so far things melt into it. */
export const FOG = new THREE.Color(0xd7d6cf);

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
uniform vec3 horizon;
uniform vec3 haze;
uniform vec3 groundCol;
uniform sampler2D clouds;
uniform float time;
uniform float cloudAmount;
uniform float brightness;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float up = max(h, 0.0);
  vec3 col = mix(horizon, zenith, pow(up, 0.45));
  float toSun = max(dot(d, sunDir), 0.0);
  // warm haze piles up low in the sky, more towards the sun
  col = mix(col, haze, exp(-up * 9.0) * (0.55 + 0.45 * toSun));
  col += vec3(1.0, 0.85, 0.62) * (pow(toSun, 9.0) * 0.35 + pow(toSun, 90.0) * 0.8);
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, toSun) * 18.0;
  if (cloudAmount > 0.0 && h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 0.11 + vec2(time * 0.0015, time * 0.0006);
    float c = texture2D(clouds, uv).r * 0.7 + texture2D(clouds, uv * 2.7 + 0.31).r * 0.3;
    float cover = smoothstep(0.52, 0.78, c) * smoothstep(0.0, 0.22, h) * cloudAmount;
    vec3 lit = mix(vec3(0.82, 0.83, 0.86), vec3(1.08, 1.0, 0.92), pow(toSun, 3.0) + 0.35);
    vec3 cloudCol = mix(lit, lit * 0.72, smoothstep(0.62, 0.9, c));
    col = mix(col, cloudCol, cover * 0.85);
  }
  if (h < 0.0) col = mix(haze, groundCol, smoothstep(0.0, 0.25, -h));
  gl_FragColor = vec4(col * brightness, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** @param {THREE.Texture | null} clouds */
function skyMaterial(clouds) {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: SUN_DIR },
      zenith: { value: SKY.zenith },
      horizon: { value: SKY.horizon },
      haze: { value: SKY.haze },
      groundCol: { value: SKY.ground },
      clouds: { value: clouds },
      time: { value: 0 },
      cloudAmount: { value: clouds ? 1 : 0 },
      brightness: { value: 1 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
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
    scene.fog = new THREE.FogExp2(FOG, 0.0011);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMaterial(null));
    this.sky.name = "sky";
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.sky.onBeforeRender = (_r, _s, cam) => this.sky.position.copy(cam.position);
    scene.add(this.sky);

    // Fill from the sky comes from the environment map; a faint hemisphere
    // light keeps the shade side from going dead before the map is ready.
    this.hemi = new THREE.HemisphereLight(0xcfe0ee, 0x8a7a66, 0.35);
    scene.add(this.hemi);

    const sun = new THREE.DirectionalLight(0xfff0dc, 3.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(opts.shadowSize, opts.shadowSize);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -13;
    sc.right = sc.top = 13;
    sc.near = 5;
    sc.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 2.5;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.cloudsWanted = opts.clouds;
  }

  /** Bake the sky into the environment map, once textures exist. @param {Textures | null} tex */
  bake(tex) {
    const mat = /** @type {THREE.ShaderMaterial} */ (this.sky.material);
    if (tex && this.cloudsWanted) {
      mat.uniforms.clouds.value = tex.clouds;
      mat.uniforms.cloudAmount.value = 1;
    }
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), skyMaterial(tex?.clouds ?? null));
    const envMat = /** @type {THREE.ShaderMaterial} */ (envSky.material);
    envMat.uniforms.cloudAmount.value = tex ? 0.7 : 0;
    envScene.add(envSky);
    // The courtyard as the chariot sees it: paving below, a red wall band
    // and dark roofs round the horizon (walls are ~150 chi off).
    const floor = new THREE.Mesh(new THREE.CircleGeometry(38, 32), new THREE.MeshBasicMaterial({ color: 0x77736b }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    envScene.add(floor);
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(36, 36, 1.6, 48, 1, true, Math.PI * 0.12, Math.PI * 1.76),
      new THREE.MeshBasicMaterial({ color: 0x6e2a20, side: THREE.BackSide }),
    );
    wall.position.y = -0.6;
    envScene.add(wall);
    // Dark tiled roofs over the wall: a hard light/dark line for metal to catch.
    const eaves = new THREE.Mesh(
      new THREE.CylinderGeometry(35.5, 35.5, 1.4, 48, 1, true, Math.PI * 0.12, Math.PI * 1.76),
      new THREE.MeshBasicMaterial({ color: 0x23282c, side: THREE.BackSide }),
    );
    eaves.position.y = 0.9;
    envScene.add(eaves);
    // The sun itself, as a small very bright disc: the glint on brass and lacquer.
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(28, 25, 21) }));
    sunDisc.position.copy(SUN_DIR).multiplyScalar(30);
    sunDisc.lookAt(0, 0, 0);
    envScene.add(sunDisc);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromScene(envScene, 0.02, 0.1, 100);
    pmrem.dispose();
    this.scene.environment?.dispose();
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.85;
    this.hemi.intensity = 0.12;
  }

  /** Keep the shadow camera on the chariot. @param {number} x @param {number} z */
  follow(x, z) {
    this.sun.position.set(x + SUN_DIR.x * 45, SUN_DIR.y * 45, z + SUN_DIR.z * 45);
    this.sun.target.position.set(x, 0, z);
  }

  /** @param {number} dt */
  update(dt) {
    /** @type {THREE.ShaderMaterial} */ (this.sky.material).uniforms.time.value += dt;
  }

  /** @param {number} size */
  setShadowSize(size) {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }
}

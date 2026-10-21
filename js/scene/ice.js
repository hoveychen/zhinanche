// A sheet of ice on the ground while a wheel slips (lesson 6, free driving
// with "right wheel slips"): laid out ahead of the chariot along its way,
// mostly clear and glassy, frosted in patches, so the sky glints off it, the
// stones show through and the ground reads
// as slippery. It stays where it was laid; when the chariot drives off it,
// it fades away and is laid again ahead of it.

import * as THREE from "three";

/** The sheet: how long (along the way the chariot faces when it is laid), how wide, and how far it starts behind the chariot. */
const LEN = 76, WIDTH = 18, BACK = 9;
/** fades in or out in about this many seconds */
const FADE = 0.6;
const OPACITY = 1;

/** Small seeded random numbers, so the sheet looks the same every time. @param {number} seed */
function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * The sheet's textures, long side along the canvas height. A real patch of
 * ice on paving is not a pale blue cut-out: it is mostly clear (the stones
 * show through it, darker and glassier), whitened by frost in patches and
 * along its rim, its edge rounded and soft, the stone round it dark with
 * melt water, and its surface not quite flat, so the sky's reflection
 * wanders over it. (It was a flat translucent blue with a hard zigzag edge,
 * and read as a sticker.)
 *   map        colour: wet stone round it, clear blue-grey ice, white frost
 *   alpha      how much of that covers the ground (wet halo faint, clear ice
 *              half, frost and rim nearly all)
 *   rough      roughness (green): glassy ice, matt frost, satin wet stone
 *   normal     a gentle undulation, the rim raised, cracks as grooves
 */
function iceTextures() {
  const w = 192, h = 768, r = rand(7);
  // the outline: each long side wanders smoothly (a few sines), the ends round off
  const waves = (/** @type {number} */ n) => Array.from({ length: n }, (_, i) => ({ f: (i + 1) * (0.8 + r() * 0.6), p: r() * 6.283, a: (0.55 + r() * 0.45) / (i + 1) }));
  const left = waves(5), right = waves(5), ends = waves(4);
  const wobble = (/** @type {{f: number, p: number, a: number}[]} */ ws, /** @type {number} */ t) => ws.reduce((s, q) => s + Math.sin(t * q.f * 6.283 + q.p) * q.a, 0);
  /** @type {[number, number][]} */
  const edge = [];
  const m = 22, N = 220;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // a rounded rectangle in polar form, its radius wobbled
    const c = Math.cos(a), sn = Math.sin(a);
    const k = Math.pow(Math.pow(Math.abs(c), 6) + Math.pow(Math.abs(sn), 6), -1 / 6);
    const side = c > 0 ? right : left;
    const t = (sn + 1) / 2;
    const wob = Math.abs(sn) > 0.92 ? wobble(ends, a / 6.283) * 0.5 : wobble(side, t) * 0.75;
    const rx = (w / 2 - m) * (1 + 0.16 * wob), ry = (h / 2 - m) * (1 + 0.02 * wob);
    edge.push([w / 2 + c * k * rx, h / 2 + sn * k * ry]);
  }
  const trace = (/** @type {CanvasRenderingContext2D} */ g) => {
    g.beginPath();
    g.moveTo(...edge[0]);
    for (const p of edge.slice(1)) g.lineTo(...p);
    g.closePath();
  };
  const make = () => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return { c, g: /** @type {CanvasRenderingContext2D} */ (c.getContext("2d")) };
  };
  const A = make(), C = make(), R = make(), H = make();
  // frost patches and bubbles, the same in every map
  const frost = Array.from({ length: 34 }, () => ({ x: r() * w, y: r() * h, rx: 6 + r() * 26, ry: 10 + r() * 60, a: 0.25 + r() * 0.5 }));
  const bubbles = Array.from({ length: 160 }, () => ({ x: r() * w, y: r() * h, s: 0.6 + r() * 1.6 }));
  /** @type {[number, number][][]} */
  const cracks = [];
  for (let i = 0; i < 14; i++) {
    let x = m + r() * (w - 2 * m), y = m + r() * (h - 2 * m);
    const dir = r() * Math.PI * 2;
    /** @type {[number, number][]} */
    const line = [[x, y]];
    for (let k = 0; k < 5; k++) {
      const t = dir + (r() - 0.5) * 0.9, l = 8 + r() * 18;
      x += Math.cos(t) * l;
      y += Math.sin(t) * l;
      line.push([x, y]);
    }
    cracks.push(line);
  }
  const fillFrost = (/** @type {CanvasRenderingContext2D} */ g, /** @type {string} */ rgb, /** @type {number} */ k) => {
    // rime: a soft patch, and a crust of grains in it
    for (const f of frost) {
      for (let i = 0; i < f.rx * f.ry * 0.25; i++) {
        const a = r() * 6.283, d = Math.sqrt(r());
        g.fillStyle = `rgba(${rgb},${f.a * k * (1 - d) * 1.4})`;
        g.fillRect(f.x + Math.cos(a) * d * f.rx, f.y + Math.sin(a) * d * f.ry, 1 + r() * 1.5, 1 + r() * 1.5);
      }
    }
    for (const f of frost) {
      const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 1);
      gr.addColorStop(0, `rgba(${rgb},${f.a * k})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.save();
      g.translate(f.x, f.y);
      g.scale(f.rx, f.ry);
      g.translate(-f.x, -f.y);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(f.x, f.y, 1, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  };
  const strokeCracks = (/** @type {CanvasRenderingContext2D} */ g, /** @type {string} */ style, /** @type {number} */ lw) => {
    g.strokeStyle = style;
    g.lineWidth = lw;
    for (const line of cracks) {
      g.beginPath();
      g.moveTo(...line[0]);
      for (const p of line.slice(1)) g.lineTo(...p);
      g.stroke();
    }
  };
  // halo of melt water (drawn as a wide soft stroke round the outline), then the ice
  const halo = (/** @type {CanvasRenderingContext2D} */ g, /** @type {string} */ rgb, /** @type {number} */ a) => {
    trace(g);
    g.lineJoin = "round";
    for (const [lw, k] of [[30, 0.35], [18, 0.6], [8, 1]]) {
      g.strokeStyle = `rgba(${rgb},${a * k})`;
      g.lineWidth = lw;
      g.stroke();
    }
  };
  // alpha
  A.g.fillStyle = "#000";
  A.g.fillRect(0, 0, w, h);
  halo(A.g, "255,255,255", 0.22);
  trace(A.g);
  A.g.fillStyle = "rgb(105,105,105)";
  A.g.fill();
  A.g.save();
  trace(A.g);
  A.g.clip();
  fillFrost(A.g, "255,255,255", 1.2);
  strokeCracks(A.g, "rgba(255,255,255,0.45)", 0.8);
  A.g.restore();
  trace(A.g);
  A.g.strokeStyle = "rgba(255,255,255,0.85)";
  A.g.lineWidth = 5;
  A.g.stroke();
  // colour
  C.g.fillStyle = "#30343a";
  C.g.fillRect(0, 0, w, h);
  trace(C.g);
  C.g.fillStyle = "#6f8c9e";
  C.g.fill();
  C.g.save();
  trace(C.g);
  C.g.clip();
  // the ice's depth: a little bluer where it is thick (towards the middle)
  const deep = C.g.createLinearGradient(0, 0, w, 0);
  deep.addColorStop(0, "rgba(160,190,205,0.5)");
  deep.addColorStop(0.5, "rgba(80,120,145,0.35)");
  deep.addColorStop(1, "rgba(160,190,205,0.5)");
  C.g.fillStyle = deep;
  C.g.fillRect(0, 0, w, h);
  fillFrost(C.g, "236,244,248", 1);
  strokeCracks(C.g, "rgba(240,248,255,0.55)", 0.6);
  for (const b of bubbles) {
    C.g.fillStyle = "rgba(235,245,250,0.7)";
    C.g.fillRect(b.x, b.y, b.s, b.s);
  }
  C.g.restore();
  trace(C.g);
  C.g.strokeStyle = "rgba(230,240,246,0.9)";
  C.g.lineWidth = 4;
  C.g.stroke();
  // roughness (green)
  R.g.fillStyle = "rgb(0,90,0)";
  R.g.fillRect(0, 0, w, h);
  trace(R.g);
  R.g.fillStyle = "rgb(0,12,0)";
  R.g.fill();
  R.g.save();
  trace(R.g);
  R.g.clip();
  fillFrost(R.g, "0,170,0", 1);
  R.g.restore();
  trace(R.g);
  R.g.strokeStyle = "rgb(0,150,0)";
  R.g.lineWidth = 4;
  R.g.stroke();
  // height → normal: soft swells, a raised rim, grooved cracks
  H.g.fillStyle = "rgb(110,110,110)";
  H.g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    const x = r() * w, y = r() * h, rad = 12 + r() * 40;
    const gr = H.g.createRadialGradient(x, y, 0, x, y, rad);
    const v = r() < 0.5 ? 160 : 70;
    gr.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
    gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    H.g.fillStyle = gr;
    H.g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  trace(H.g);
  H.g.strokeStyle = "rgba(200,200,200,0.8)";
  H.g.lineWidth = 6;
  H.g.stroke();
  strokeCracks(H.g, "rgba(30,30,30,0.9)", 1.5);
  const src = H.g.getImageData(0, 0, w, h).data;
  const out = H.g.createImageData(w, h);
  const at = (/** @type {number} */ x, /** @type {number} */ y) => src[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3, dy = (at(x, y + 1) - at(x, y - 1)) * 3;
      const l = Math.hypot(dx, dy, 1), o = (y * w + x) * 4;
      out.data[o] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      out.data[o + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);
      out.data[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      out.data[o + 3] = 255;
    }
  }
  H.g.putImageData(out, 0, 0);
  const tex = (/** @type {HTMLCanvasElement} */ c, /** @type {boolean} */ colour) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { alpha: tex(A.c, false), map: tex(C.c, true), rough: tex(R.c, false), normal: tex(H.c, false) };
}

export class Ice {
  constructor() {
    const { alpha, map, rough, normal } = iceTextures();
    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map, alphaMap: alpha, transparent: true, opacity: 0,
      roughness: 1, roughnessMap: rough, normalMap: normal, normalScale: new THREE.Vector2(1, 1),
      metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.04, specularIntensity: 1, envMapIntensity: 1.5,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      // premultiplied: the diffuse part covers the ground by alpha, the
      // reflection is added whole (with ordinary blending, alpha dimmed the
      // sky's reflection along with the colour and the sheet went flat)
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
        #ifdef USE_CLEARCOAT
          vec3 iceSpec = totalSpecular * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
        #else
          vec3 iceSpec = totalSpecular;
        #endif
        gl_FragColor = vec4( ( outgoingLight - iceSpec ) * diffuseColor.a + iceSpec * opacity * min( 1.0, diffuseColor.a * 3.0 ), diffuseColor.a );`);
    };
    this.mat.customProgramCacheKey = () => "ice";
    const geo = new THREE.PlaneGeometry(WIDTH, LEN);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = 0.01;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.on = false;
    /** laid down at: where the chariot was and the way it faced (world), or null */
    /** @type {{x: number, z: number, dx: number, dz: number} | null} */
    this.at = null;
    /** 0..1 */
    this.shown = 0;
    /** fading away to be laid again ahead */
    this.melting = false;
  }

  /** @param {boolean} on */
  set(on) {
    this.on = on;
  }

  /**
   * @param {number} dt
   * @param {{x: number, z: number, heading: number}} f the chariot (world x, z; sim heading)
   */
  update(dt, f) {
    if (this.on && !this.at) this.#lay(f);
    if (this.on && this.at && !this.melting) {
      // driven off it? (a little short of its ends and sides)
      const px = f.x - this.at.x, pz = f.z - this.at.z;
      const along = px * this.at.dx + pz * this.at.dz, across = px * -this.at.dz + pz * this.at.dx;
      this.melting = along < -BACK + 3 || along > LEN - BACK - 6 || Math.abs(across) > WIDTH / 2 - 3;
    }
    const want = this.on && !this.melting ? 1 : 0;
    this.shown = dt > 0 ? THREE.MathUtils.clamp(this.shown + Math.sign(want - this.shown) * (dt / FADE), 0, 1) : want;
    if (this.shown === 0) {
      // gone: lay it again ahead of the chariot (next frame), or not at all
      this.melting = false;
      this.at = null;
    }
    this.mat.opacity = OPACITY * this.shown * this.shown * (3 - 2 * this.shown);
    this.mesh.visible = this.shown > 0;
  }

  /** Ahead of the chariot, the way it faces. @param {{x: number, z: number, heading: number}} f */
  #lay(f) {
    const dx = Math.cos(f.heading), dz = -Math.sin(f.heading);
    this.at = { x: f.x, z: f.z, dx, dz };
    const mid = LEN / 2 - BACK;
    this.mesh.position.set(f.x + dx * mid, this.mesh.position.y, f.z + dz * mid);
    this.mesh.rotation.y = f.heading - Math.PI / 2;
  }
}

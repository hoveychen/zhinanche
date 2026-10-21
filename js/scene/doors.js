// The courtyard's doors, painted once into small canvases while the loading
// note is up (a few milliseconds): the main hall's lattice doors (隔扇), four
// leaves to a bay, and the gate tower's studded gate leaves (门钉, 铺首).
// They were flat dark blocks. Painting them costs no geometry: the hall's
// doors are a board per bay carrying the lattice texture, the gateways'
// arched faces carry the gate leaves (with a normal map, since they face the
// sun and the studs should catch it).

import * as THREE from "three";

/** @param {number} w @param {number} h */
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: /** @type {CanvasRenderingContext2D} */ (c.getContext("2d")) };
}

/** @param {HTMLCanvasElement} c @param {boolean} colour */
function texture(c, colour) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A sunk panel: a darker edge on top and left, a lighter one bottom and right (light from above). @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {number} w @param {number} h @param {number} e */
function sunk(g, x, y, w, h, e) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(x, y, w, e);
  g.fillRect(x, y, e, h);
  g.fillStyle = "rgba(255,210,170,0.12)";
  g.fillRect(x, y + h - e, w, e);
  g.fillRect(x + w - e, y, e, h);
}

/**
 * One bay of lattice doors (隔扇), four leaves: each a lacquered frame, a
 * lattice of triple-crossed 菱花 over the dark paper above, a gilt-edged
 * band, a carved skirt panel below. u across the bay, v up the leaf.
 * @param {boolean} lite
 */
export function latticeDoors(lite) {
  const W = lite ? 256 : 512, H = lite ? 360 : 720;
  const { c, g } = canvas(W, H);
  const red = "#b0301c", deep = "#6e1a10", gold = "#e0b050";
  g.fillStyle = deep;
  g.fillRect(0, 0, W, H);
  const leaves = 4, lw = W / leaves, s = W / 512;
  for (let k = 0; k < leaves; k++) {
    const x0 = k * lw;
    // the leaf's frame
    g.fillStyle = red;
    g.fillRect(x0 + 2 * s, 0, lw - 4 * s, H);
    const fr = 10 * s;
    const ix = x0 + fr, iw = lw - 2 * fr;
    // lattice heart: the top 58%
    const ly0 = fr, ly1 = H * 0.58;
    // paper behind the lattice, in the shade of the eaves
    g.fillStyle = "#4a3426";
    g.fillRect(ix, ly0, iw, ly1 - ly0);
    g.save();
    g.beginPath();
    g.rect(ix, ly0, iw, ly1 - ly0);
    g.clip();
    // three-way crossing bars (三交六椀菱花): verticals and ±60° diagonals
    const step = 14 * s;
    g.lineWidth = 3.2 * s;
    g.strokeStyle = "#9a2c18";
    for (let x = ix - H; x < ix + iw + H; x += step) {
      g.beginPath();
      g.moveTo(x, ly0);
      g.lineTo(x, ly1);
      g.stroke();
    }
    for (const dir of [-1, 1]) {
      for (let x = ix - H; x < ix + iw + H; x += step * 2) {
        g.beginPath();
        g.moveTo(x, ly0);
        g.lineTo(x + dir * (ly1 - ly0) * Math.tan(Math.PI / 6), ly1);
        g.stroke();
      }
    }
    // the bars' lit edges and the gilt studs where they cross
    g.lineWidth = 0.9 * s;
    g.strokeStyle = "rgba(230,150,110,0.35)";
    for (let x = ix - H; x < ix + iw + H; x += step) {
      g.beginPath();
      g.moveTo(x - 1.2 * s, ly0);
      g.lineTo(x - 1.2 * s, ly1);
      g.stroke();
    }
    g.fillStyle = gold;
    for (let y = ly0; y < ly1; y += step * Math.tan(Math.PI / 3)) {
      for (let x = ix; x < ix + iw; x += step * 2) {
        g.beginPath();
        g.arc(x + ((Math.round((y - ly0) / (step * Math.tan(Math.PI / 3))) % 2) * step), y, 1.5 * s, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    sunk(g, ix, ly0, iw, ly1 - ly0, 3 * s);
    // waist band (绦环板) and skirt panel (裙板), gilt-edged
    const bands = [[0.6, 0.68], [0.7, 0.93], [0.95, 0.985]];
    for (const [a, b] of bands) {
      const y = H * a, h = H * (b - a);
      g.fillStyle = "#a02a18";
      g.fillRect(ix, y, iw, h);
      sunk(g, ix, y, iw, h, 2.5 * s);
      g.strokeStyle = gold;
      g.lineWidth = 2 * s;
      const m = 7 * s;
      if (h > 4 * m) {
        const r = Math.min(iw, h) * 0.18;
        g.beginPath();
        // (roundRect: Safari 16 and later)
        if (typeof g.roundRect === "function") g.roundRect(ix + m, y + m, iw - 2 * m, h - 2 * m, r);
        else g.rect(ix + m, y + m, iw - 2 * m, h - 2 * m);
        g.stroke();
        // a gilt boss in the skirt panel
        if (b - a > 0.15) {
          g.beginPath();
          g.ellipse(ix + iw / 2, y + h / 2, iw * 0.2, h * 0.14, 0, 0, Math.PI * 2);
          g.stroke();
        }
      } else {
        g.strokeRect(ix + 2 * s, y + 2 * s, iw - 4 * s, h - 4 * s);
      }
    }
    // the gap between leaves
    g.fillStyle = "#1a0d08";
    g.fillRect(x0, 0, 2 * s, H);
  }
  const t = texture(c, true);
  return t;
}

/**
 * The gate tower's gateway: two lacquered leaves meeting in the middle, nine
 * rows of gilt studs, a lion-mask knocker (铺首) with a ring on each, a dark
 * transom in the arch above them. u across the arch, v from the sill to the
 * crown; `spring` is where the arch springs, as a share of the height.
 * Colour and a normal map (the studs stand out).
 * @param {boolean} lite @param {number} spring
 */
export function gateDoors(lite, spring) {
  const W = lite ? 256 : 512, H = W;
  const col = canvas(W, H), hgt = canvas(W, H);
  const g = col.g, hg = hgt.g;
  const sy = H * (1 - spring); // canvas y of the spring line (v = 1 at the top)
  // the arch above the leaves: dark boards
  g.fillStyle = "#2a1a12";
  g.fillRect(0, 0, W, sy);
  hg.fillStyle = "#606060";
  hg.fillRect(0, 0, W, H);
  // leaves
  g.fillStyle = "#8c2416";
  g.fillRect(0, sy, W, H - sy);
  // lacquer wear: faint vertical grain
  for (let i = 0; i < 160; i++) {
    const x = (i * 97.13) % W, a = 0.03 + ((i * 37) % 7) / 120;
    g.fillStyle = `rgba(${i % 2 ? 40 : 200},${i % 2 ? 10 : 90},${i % 2 ? 5 : 60},${a})`;
    g.fillRect(x, sy, 1 + (i % 3), H - sy);
  }
  // the meeting line and the frame
  g.fillStyle = "#1c0b06";
  g.fillRect(W / 2 - 1.5, sy, 3, H - sy);
  g.fillRect(0, sy - 2, W, 4);
  hg.fillStyle = "#303030";
  hg.fillRect(W / 2 - 1.5, sy, 3, H - sy);
  // studs: 9 rows, 5 a leaf
  const rows = 9, cols = 5;
  const mx = W * 0.07, top = sy + (H - sy) * 0.06, bot = H - (H - sy) * 0.06;
  const r = Math.min((W / 2 - 2 * mx) / cols, (bot - top) / rows) * 0.28;
  for (const side of [0, 1]) {
    const x0 = side * W / 2 + mx, x1 = (side + 1) * W / 2 - mx;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const x = x0 + ((j + 0.5) / cols) * (x1 - x0), y = top + ((i + 0.5) / rows) * (bot - top);
        const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        gr.addColorStop(0, "#f3d58a");
        gr.addColorStop(0.55, "#c4923a");
        gr.addColorStop(1, "#6e4a18");
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        const hr = hg.createRadialGradient(x, y, 0, x, y, r);
        hr.addColorStop(0, "#ffffff");
        hr.addColorStop(0.7, "#c8c8c8");
        hr.addColorStop(1, "#606060");
        hg.fillStyle = hr;
        hg.beginPath();
        hg.arc(x, y, r, 0, Math.PI * 2);
        hg.fill();
      }
    }
    // the knocker: a bronze mask with a ring, near the meeting line
    const kx = side ? W / 2 + W * 0.06 : W / 2 - W * 0.06, ky = top + (bot - top) * 0.55, kr = r * 1.8;
    g.fillStyle = "#7a6a3a";
    g.beginPath();
    g.arc(kx, ky, kr, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#c7a24e";
    g.lineWidth = kr * 0.25;
    g.beginPath();
    g.arc(kx, ky + kr * 1.2, kr * 0.9, 0, Math.PI * 2);
    g.stroke();
    hg.fillStyle = "#e0e0e0";
    hg.beginPath();
    hg.arc(kx, ky, kr, 0, Math.PI * 2);
    hg.fill();
    hg.strokeStyle = "#b0b0b0";
    hg.lineWidth = kr * 0.25;
    hg.beginPath();
    hg.arc(kx, ky + kr * 1.2, kr * 0.9, 0, Math.PI * 2);
    hg.stroke();
  }
  // height → normal (OpenGL convention, as three.js reads it)
  const src = hg.getImageData(0, 0, W, H).data;
  const nimg = hg.createImageData(W, H);
  const at = (/** @type {number} */ x, /** @type {number} */ y) => src[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4] / 255;
  const k = lite ? 2.5 : 4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * W + x) * 4;
      nimg.data[o] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      nimg.data[o + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);
      nimg.data[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      nimg.data[o + 3] = 255;
    }
  }
  hg.putImageData(nimg, 0, 0);
  return { map: texture(col.c, true), normalMap: texture(hgt.c, false) };
}

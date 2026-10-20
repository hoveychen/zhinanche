// A free-driving setup in a link: which chariot, its faults and switches, and
// the route the child drew, packed into the URL hash so whoever opens the link
// sees the same chariot drive the same route. Pure functions, no DOM; tested
// in node (tests/app/share.test.js).
//
//   #s=1&m=song&a=0&tk=1.1&wl=1.05&sr=0.2&sp=2&x=1&e=0.5&v=top&p=<route>
//
// Fields left at their free-driving default are left out. The route is the
// start pose and the drawn points, thinned (Douglas–Peucker), in tenths of a
// chi, delta-coded as zig-zag varints in base64url.

/** @import { SceneState } from "./directive.js" */
/** @import { MechanismId } from "../sim/params.js" */
/** @import { ViewId } from "../teach/types.js" */
/** @import { Faults } from "../sim/chariot.js" */
/** @import { Slip } from "../sim/drive.js" */

/**
 * A route as drawn: where the chariot set off from (sim coordinates, heading
 * in radians) and the points drawn on the ground (sim coordinates).
 * @typedef {object} DrawnRoute
 * @property {number} x
 * @property {number} y
 * @property {number} heading
 * @property {{x: number, y: number}[]} pts
 */

/**
 * What a link carries. Every field is there after decoding (defaults filled in).
 * @typedef {object} ShareSetup
 * @property {MechanismId} mechanism
 * @property {boolean} assist
 * @property {Faults} faults
 * @property {Slip} slip
 * @property {number} speed
 * @property {boolean} xray
 * @property {number} explode
 * @property {ViewId} view
 * @property {DrawnRoute | null} route
 */

const VERSION = "1";
/** @type {ViewId[]} */
const VIEWS = ["overview", "top", "follow", "gears", "wheels", "figure"];
/** @type {MechanismId[]} */
const MECHANISMS = ["differential", "song"];
/** grid of the stored route, chi */
const STEP = 0.1;
/** how far the thinned route may stray from the drawn one, chi */
const THIN = 0.12;
const MAX_POINTS = 2000;
const MAX_COORD = 5000;

/** @returns {ShareSetup} */
export function defaultSetup() {
  return { mechanism: "differential", assist: true, faults: {}, slip: {}, speed: 1, xray: false, explode: 0, view: "follow", route: null };
}

/**
 * The part of a scene state a link carries.
 * @param {SceneState} st
 * @param {DrawnRoute | null} route
 * @returns {ShareSetup}
 */
export function setupOf(st, route) {
  return {
    mechanism: st.mechanism, assist: st.assist, faults: { ...st.faults }, slip: { ...st.slip },
    speed: st.speed, xray: st.xray, explode: st.explode, view: st.view, route,
  };
}

/**
 * The page's address with this setup in its hash. The query is dropped (no
 * ?lesson / ?free), except that an English page says so with ?lang=en, so the
 * link opens in English for whoever gets it; a Chinese page adds nothing.
 * @param {string} href the page's address now
 * @param {ShareSetup} setup
 * @param {"zh" | "en"} lang the language the page shows
 */
export function shareHref(href, setup, lang) {
  const u = new URL(href);
  u.search = lang === "en" ? "?lang=en" : "";
  u.hash = encodeShare(setup);
  return u.href;
}

/** A number as short as it can be written (at most 3 decimals). @param {number} v */
const num = (v) => String(Math.round(v * 1000) / 1000);

/**
 * @param {ShareSetup} s
 * @returns {string} the hash, without the leading "#"
 */
export function encodeShare(s) {
  const d = defaultSetup();
  /** @type {[string, string][]} */
  const kv = [["s", VERSION]];
  if (s.mechanism !== d.mechanism) kv.push(["m", s.mechanism]);
  if (!s.assist) kv.push(["a", "0"]);
  /** @type {[string, number | undefined, number][]} */
  const nums = [
    ["tk", s.faults.trackScale, 1], ["wl", s.faults.leftWheelScale, 1], ["wr", s.faults.rightWheelScale, 1],
    ["sl", s.slip.slipL, 0], ["sr", s.slip.slipR, 0], ["sp", s.speed, 1], ["e", s.explode, 0],
  ];
  for (const [k, v, def] of nums) if (v !== undefined && v !== def) kv.push([k, num(v)]);
  if (s.xray) kv.push(["x", "1"]);
  if (s.view !== d.view) kv.push(["v", s.view]);
  if (s.route && s.route.pts.length > 0) kv.push(["p", encodeRoute(s.route)]);
  return kv.map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * Read a link's hash. Anything missing or out of range falls back to its
 * default; a hash that is not one of ours gives null.
 * @param {string} hash with or without the leading "#"
 * @returns {ShareSetup | null}
 */
export function decodeShare(hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  if (q.get("s") !== VERSION) return null;
  const s = defaultSetup();
  const m = q.get("m");
  if (m && MECHANISMS.includes(/** @type {MechanismId} */ (m))) s.mechanism = /** @type {MechanismId} */ (m);
  if (q.get("a") === "0") s.assist = false;
  /** @param {string} k @param {number} lo @param {number} hi */
  const read = (k, lo, hi) => {
    const raw = q.get(k);
    if (raw === null || raw === "") return undefined;
    const v = Number(raw);
    return Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
  };
  const tk = read("tk", 0.5, 2), wl = read("wl", 0.5, 2), wr = read("wr", 0.5, 2);
  if (tk !== undefined && tk !== 1) s.faults.trackScale = tk;
  if (wl !== undefined && wl !== 1) s.faults.leftWheelScale = wl;
  if (wr !== undefined && wr !== 1) s.faults.rightWheelScale = wr;
  const sl = read("sl", 0, 0.9), sr = read("sr", 0, 0.9);
  if (sl) s.slip.slipL = sl;
  if (sr) s.slip.slipR = sr;
  const sp = read("sp", 0.1, 4);
  if (sp !== undefined && sp > 0) s.speed = sp;
  s.explode = read("e", 0, 1) ?? 0;
  s.xray = q.get("x") === "1";
  const v = q.get("v");
  if (v && VIEWS.includes(/** @type {ViewId} */ (v))) s.view = /** @type {ViewId} */ (v);
  const p = q.get("p");
  if (p) s.route = decodeRoute(p);
  return s;
}

/**
 * @param {DrawnRoute} r
 * @returns {string}
 */
export function encodeRoute(r) {
  const q = (/** @type {number} */ v) => Math.round(v / STEP);
  const pts = thin(r.pts, THIN);
  const deg = Math.round((((r.heading * 180) / Math.PI) % 360 + 360) % 360 * 10);
  /** @type {number[]} */
  const ints = [q(r.x), q(r.y), deg];
  let px = ints[0], py = ints[1];
  for (const p of pts) {
    const x = q(p.x), y = q(p.y);
    if (x === px && y === py) continue;
    ints.push(x - px, y - py);
    px = x;
    py = y;
  }
  return toBase64Url(varints(ints));
}

/**
 * @param {string} text
 * @returns {DrawnRoute | null}
 */
export function decodeRoute(text) {
  const bytes = fromBase64Url(text);
  if (!bytes) return null;
  const ints = unvarints(bytes);
  if (!ints || ints.length < 5 || (ints.length - 3) % 2 !== 0 || (ints.length - 3) / 2 > MAX_POINTS) return null;
  let x = ints[0], y = ints[1];
  const heading = ((ints[2] / 10) * Math.PI) / 180;
  if (Math.abs(x * STEP) > MAX_COORD || Math.abs(y * STEP) > MAX_COORD || ints[2] < 0 || ints[2] >= 3600) return null;
  const start = { x: x * STEP, y: y * STEP };
  /** @type {{x: number, y: number}[]} */
  const pts = [];
  for (let i = 3; i < ints.length; i += 2) {
    x += ints[i];
    y += ints[i + 1];
    if (Math.abs(x * STEP) > MAX_COORD || Math.abs(y * STEP) > MAX_COORD) return null;
    pts.push({ x: round(x * STEP), y: round(y * STEP) });
  }
  return { x: round(start.x), y: round(start.y), heading, pts };
}

/** Undo float noise from the grid (0.30000000000000004 → 0.3). @param {number} v */
const round = (v) => Math.round(v * 1e6) / 1e6;

/**
 * Douglas–Peucker: drop the points that lie within `tol` of the line through
 * their neighbours. Keeps the first and the last point.
 * @param {{x: number, y: number}[]} pts
 * @param {number} tol
 */
export function thin(pts, tol) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  /** @type {[number, number][]} */
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = /** @type {[number, number]} */ (stack.pop());
    const A = pts[a], B = pts[b];
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    let far = -1, farD = tol;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      const d = len > 1e-9 ? Math.abs(dx * (P.y - A.y) - dy * (P.x - A.x)) / len : Math.hypot(P.x - A.x, P.y - A.y);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Zig-zag varints (LEB128). @param {number[]} ints */
function varints(ints) {
  /** @type {number[]} */
  const out = [];
  for (const n of ints) {
    let z = n >= 0 ? n * 2 : -n * 2 - 1;
    while (z >= 0x80) {
      out.push((z % 0x80) | 0x80);
      z = Math.floor(z / 0x80);
    }
    out.push(z);
  }
  return Uint8Array.from(out);
}

/** @param {Uint8Array} bytes @returns {number[] | null} */
function unvarints(bytes) {
  /** @type {number[]} */
  const out = [];
  let z = 0, mul = 1;
  for (const b of bytes) {
    z += (b & 0x7f) * mul;
    if (b & 0x80) {
      mul *= 0x80;
      if (mul > 2 ** 35) return null;
    } else {
      out.push(z % 2 === 0 ? z / 2 : -(z + 1) / 2);
      z = 0;
      mul = 1;
    }
  }
  return mul === 1 ? out : null;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** @param {Uint8Array} bytes */
function toBase64Url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 1 >= bytes.length ? 2 : i + 2 >= bytes.length ? 3 : 4;
    for (let k = 0; k < chars; k++) s += B64[(n >> (18 - 6 * k)) & 63];
  }
  return s;
}

/** @param {string} s @returns {Uint8Array | null} */
function fromBase64Url(s) {
  if (s.length % 4 === 1) return null;
  /** @type {number[]} */
  const out = [];
  let acc = 0, bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(out);
}

// Render quality tiers and the frame-rate governor that steps them down.
//   high:   post-processing (multisampled HDR, ambient occlusion, bloom, depth
//           of field in close-ups), 2048 shadow map, pixel ratio ≤ 1.5 (MSAA does
//           the anti-aliasing; full DPR 2 halves the frame rate)
//   medium: no post-processing, 2048 shadow map, pixel ratio ≤ 1.5
//   lite:   no post-processing, 1024 shadow map, pixel ratio 1, smaller textures
// `?quality=high|medium|lite` forces a tier and turns the governor off.
// No three.js here, so tests/scene/quality.test.js can run it in node.

/** @typedef {"high" | "medium" | "lite"} Quality */

export const TIERS = /** @type {const} */ (["high", "medium", "lite"]);

/**
 * @typedef {object} TierSettings
 * @property {boolean} postfx
 * @property {number} shadowSize
 * @property {number} maxPixelRatio
 * @property {"full" | "lite"} textures
 */

/** @type {Record<Quality, TierSettings>} */
export const SETTINGS = {
  high: { postfx: true, shadowSize: 2048, maxPixelRatio: 1.5, textures: "full" },
  medium: { postfx: false, shadowSize: 2048, maxPixelRatio: 1.5, textures: "full" },
  lite: { postfx: false, shadowSize: 1024, maxPixelRatio: 1, textures: "lite" },
};

/**
 * @typedef {object} Device
 * @property {boolean} coarse a touch screen is the way in (phones, tablets of any size)
 * @property {number} shortSide the screen's short side, CSS px
 * @property {boolean} saveData
 * @property {number} [cores] navigator.hardwareConcurrency, where told
 * @property {number} [memory] navigator.deviceMemory (GB), where told
 */

/**
 * The starting tier. High only for a desktop or laptop that isn't small:
 * every touch-first device starts at medium, a big tablet too (a 12.9-inch
 * iPad's short side is 1024 CSS px, and it was put on high; on an M4 desktop
 * high at DPR 2 already had a 95th-percentile frame of 25 ms). The governor
 * can step down further from either.
 * @param {string} search location.search
 * @param {Device} device
 * @returns {{quality: Quality, forced: boolean}}
 */
export function pickQuality(search, device) {
  const q = new URLSearchParams(search).get("quality");
  if (q === "high" || q === "medium" || q === "lite") return { quality: q, forced: true };
  if (device.saveData) return { quality: "lite", forced: false };
  if (device.coarse) return { quality: "medium", forced: false };
  // a small laptop or a Chromebook: few cores or little memory
  if ((device.cores && device.cores <= 4) || (device.memory && device.memory < 4)) return { quality: "medium", forced: false };
  return { quality: "high", forced: false };
}

/**
 * Watches frame intervals and asks for a lower tier when the median frame
 * stays slower than `slowMs` (default ≈ 48 fps) over a window, or when one
 * frame in ten or more takes over 1.6 × that (≈ 30 fps: the view judders
 * though the median looks fine). Waits after
 * start and after every change so loading and shader compiles don't count.
 * Never steps back up (no flip-flopping).
 */
export class FrameGovernor {
  /**
   * @param {Quality} start
   * @param {(q: Quality) => void} onChange
   * @param {{slowMs?: number, window?: number, settleMs?: number}} [opts]
   */
  constructor(start, onChange, opts = {}) {
    this.quality = start;
    this.onChange = onChange;
    this.slowMs = opts.slowMs ?? 1000 / 48;
    this.window = opts.window ?? 90;
    this.settleMs = opts.settleMs ?? 2500;
    /** @type {number[]} */
    this.dts = [];
    this.last = -1;
    this.waitUntil = -1;
    this.enabled = true;
  }

  /** Call once per rendered frame. @param {number} now ms */
  tick(now) {
    if (!this.enabled) return;
    if (this.waitUntil < 0) this.waitUntil = now + this.settleMs;
    const dt = this.last < 0 ? 0 : now - this.last;
    this.last = now;
    if (now < this.waitUntil || dt <= 0 || dt > 250) return; // hidden tab, a hitch, a compile
    this.dts.push(dt);
    if (this.dts.length < this.window) return;
    const sorted = [...this.dts].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    this.dts = [];
    if (median <= this.slowMs && p90 <= this.slowMs * 1.6) return;
    const i = TIERS.indexOf(this.quality);
    if (i >= TIERS.length - 1) {
      this.enabled = false;
      return;
    }
    this.quality = TIERS[i + 1];
    this.waitUntil = now + this.settleMs;
    this.onChange(this.quality);
  }
}

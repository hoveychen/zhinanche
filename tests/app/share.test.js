// Free-driving setups packed into a link (js/app/share.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRoute, decodeShare, defaultSetup, encodeRoute, encodeShare, placeHref, setupOf, shareHref, thin } from "../../js/app/share.js";
import { freeBase } from "../../js/app/directive.js";

/** A drawn S-bend like a child's: a point every half chi, a little hand jitter. */
function wiggle(n = 400) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i * 0.5;
    pts.push({ x: 3 + t, y: -2 + 8 * Math.sin(t / 15) + 0.04 * Math.sin(i * 1.7) });
  }
  return pts;
}

/**
 * Largest distance from any original point to the decoded polyline.
 * @param {{x: number, y: number}[]} orig @param {{x: number, y: number}[]} got
 */
function maxStray(orig, got) {
  let worst = 0;
  for (const p of orig) {
    let best = Infinity;
    for (let i = 1; i < got.length; i++) {
      const a = got[i - 1], b = got[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

test("the free-driving defaults make the shortest link", () => {
  assert.equal(encodeShare(defaultSetup()), "s=1");
  assert.deepEqual(decodeShare("#s=1"), defaultSetup());
  assert.deepEqual(setupOf(freeBase(), null), { ...defaultSetup(), view: "overview" });
});

test("every switch survives the round trip", () => {
  const s = {
    mechanism: /** @type {const} */ ("song"), assist: false, faults: { trackScale: 1.1, leftWheelScale: 1.05 }, slip: { slipR: 0.2 },
    speed: 2, xray: true, explode: 0.5, view: /** @type {const} */ ("top"), route: null,
  };
  const hash = encodeShare(s);
  assert.equal(hash, "s=1&m=song&a=0&tk=1.1&wl=1.05&sr=0.2&sp=2&e=0.5&x=1&v=top");
  assert.deepEqual(decodeShare(`#${hash}`), s);
});

test("a drawn route comes back on the grid, close to what was drawn and much shorter", () => {
  const route = { x: 1.23, y: -4.56, heading: Math.PI / 2 + 0.3, pts: wiggle() };
  const hash = encodeShare({ ...defaultSetup(), route });
  assert.ok(hash.length < 1200, `link too long: ${hash.length}`);
  const got = /** @type {NonNullable<ReturnType<typeof decodeShare>>} */ (decodeShare(hash)).route;
  assert.ok(got);
  assert.equal(got.x, 1.2);
  assert.equal(got.y, -4.6);
  assert.ok(Math.abs(got.heading - route.heading) < 0.002);
  assert.ok(got.pts.length < route.pts.length / 2, `${got.pts.length} points`);
  assert.ok(maxStray(route.pts, got.pts) < 0.2, `strays ${maxStray(route.pts, got.pts)}`);
  // the ends are kept
  const last = route.pts[route.pts.length - 1], end = got.pts[got.pts.length - 1];
  assert.ok(Math.hypot(last.x - end.x, last.y - end.y) < 0.08);
});

test("headings wrap into one turn; negative coordinates and big moves round-trip", () => {
  const r = decodeRoute(encodeRoute({ x: -800, y: 950.4, heading: -Math.PI / 2, pts: [{ x: -100, y: 2000 }, { x: 300, y: -1500 }] }));
  assert.ok(r);
  assert.ok(Math.abs(r.heading - (3 * Math.PI) / 2) < 1e-9);
  assert.deepEqual(r.pts, [{ x: -100, y: 2000 }, { x: 300, y: -1500 }]);
  assert.equal(r.y, 950.4);
});

test("anything that is not one of our links, or is broken, is refused or falls back", () => {
  assert.equal(decodeShare(""), null);
  assert.equal(decodeShare("#lesson=3"), null);
  assert.equal(decodeShare("#s=2&m=song"), null);
  const odd = decodeShare("#s=1&m=steam&tk=9&sp=-1&e=7&v=sky&sr=abc&x=yes");
  assert.deepEqual(odd, defaultSetup());
  assert.equal(decodeShare("#s=1&p=***")?.route, null);
  assert.equal(decodeRoute("A"), null);
  assert.equal(decodeRoute("AAA"), null); // a start pose with no points
  assert.equal(decodeRoute("_____"), null); // a varint that never ends
});

test("thinning keeps the corners of a square and drops the points along its sides", () => {
  const sq = [];
  for (let i = 0; i <= 10; i++) sq.push({ x: i, y: 0 });
  for (let i = 1; i <= 10; i++) sq.push({ x: 10, y: i });
  for (let i = 9; i >= 0; i--) sq.push({ x: i, y: 10 });
  assert.deepEqual(thin(sq, 0.1), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
  assert.deepEqual(thin([{ x: 1, y: 1 }], 0.1), [{ x: 1, y: 1 }]);
});

test("a link from the English page goes to the English entry page; from the Chinese page, to the site's front page", () => {
  const setup = { ...defaultSetup(), mechanism: /** @type {const} */ ("song"), xray: true };
  const en = new URL(shareHref("https://example.org/zhinanche/?free&lang=en#old", setup, "en"));
  assert.equal(en.pathname, "/zhinanche/en.html");
  assert.equal(en.search, "");
  assert.deepEqual(decodeShare(en.hash), setup);
  // already on the English entry, or switched to English on the front page
  assert.equal(new URL(shareHref("https://example.org/zhinanche/en.html?free", setup, "en")).pathname, "/zhinanche/en.html");
  assert.equal(new URL(shareHref("https://example.org/?lesson=3", setup, "en")).pathname, "/en.html");
  const zh = new URL(shareHref("https://example.org/zhinanche/en.html?free&lang=zh", setup, "zh"));
  assert.equal(zh.pathname, "/zhinanche/");
  assert.equal(zh.search, "");
  assert.deepEqual(decodeShare(zh.hash), setup);
  assert.equal(new URL(shareHref("https://example.org/?free", setup, "zh")).search, "");
});

test("the address follows the course: lesson and step, free driving, or the lesson list; ?lang stays", () => {
  const base = "https://example.org/zhinanche/en.html?lang=en&lesson=3&step=4";
  assert.equal(placeHref(base, { mode: "lesson", lesson: 3, step: 5 }), "https://example.org/zhinanche/en.html?lang=en&lesson=3&step=5");
  assert.equal(placeHref(base, { mode: "home" }), "https://example.org/zhinanche/en.html?lang=en");
  assert.equal(placeHref("https://example.org/?lesson=1&step=2", { mode: "free" }), "https://example.org/?free");
  // a shared setup stays in free driving, and goes once a lesson is opened
  const shared = "https://example.org/?free#s=1&m=song";
  assert.equal(placeHref(shared, { mode: "free" }), shared);
  assert.equal(placeHref(shared, { mode: "lesson", lesson: 1, step: 1 }), "https://example.org/?lesson=1&step=1");
  assert.equal(placeHref("https://example.org/?selftest&free", { mode: "home" }), "https://example.org/?selftest");
});

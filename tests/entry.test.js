// The two entry pages: index.html (Chinese) and en.html (English). en.html is
// index.html with its <head> in English for link previews; it loads the same
// scripts and styles and has the same <body>, only its words in English.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (/** @type {string} */ f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const zh = read("index.html");
const en = read("en.html");

/** @param {string} html @param {string} prop @param {string} [attr] */
function meta(html, prop, attr = "property") {
  const m = html.match(new RegExp(`<meta ${attr}="${prop.replace(/[.:]/g, "\\$&")}" content="([^"]*)"`));
  return m?.[1];
}

/** The body's tags and attributes in order, its words left out. @param {string} html */
function skeleton(html) {
  const body = html.slice(html.indexOf("</head>"), html.indexOf("</body>"));
  return [...body.matchAll(/<([a-z0-9]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*\/?>/g)].map(([, tag, attrs]) =>
    `${tag}${[...attrs.matchAll(/\s([a-z-]+)(?:="([^"]*)")?/g)].filter(([, k]) => k !== "aria-label" && k !== "lang").map(([, k, v]) => ` ${k}=${v ?? ""}`).join("")}`);
}

test("en.html loads the same styles, import map and scripts as index.html", () => {
  const assets = (/** @type {string} */ h) => [...h.matchAll(/<(?:link rel="stylesheet"|script[^>]*) (?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(assets(en), assets(zh));
  assert.ok(assets(zh).includes("js/main.js"));
  const map = (/** @type {string} */ h) => h.slice(h.indexOf('<script type="importmap">'), h.indexOf("</script>", h.indexOf("importmap")));
  assert.equal(map(en), map(zh));
});

test("en.html has index.html's body, with only its words changed", () => {
  assert.deepEqual(skeleton(en), skeleton(zh));
});

test("en.html opens in English and previews in English", () => {
  assert.match(en, /<html lang="en" data-entry="en">/);
  assert.equal(meta(en, "og:locale"), "en_US");
  assert.equal(meta(zh, "og:locale"), "zh_CN");
  assert.equal(meta(en, "og:image"), "images/og.en.jpg");
  assert.equal(meta(en, "twitter:image", "name"), "images/og.en.jpg");
  assert.equal(meta(zh, "og:image"), "images/og.jpg");
  for (const f of ["images/og.jpg", "images/og.en.jpg"]) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), f);
  // nothing in en.html's head that a crawler shows is still in Chinese
  const head = en.slice(0, en.indexOf("</head>"));
  for (const m of head.matchAll(/<(?:title>([^<]*)|meta [a-z]+="(?:description|og:[a-z:_]+|twitter:[a-z]+)" content="([^"]*)")/g)) {
    assert.doesNotMatch(m[1] ?? m[2], /[一-鿿]/, m[0]);
  }
});

test("each entry names the other as its alternate language", () => {
  for (const h of [zh, en]) {
    assert.match(h, /<link rel="alternate" hreflang="zh-CN" href="\.\/" \/>/);
    assert.match(h, /<link rel="alternate" hreflang="en" href="en\.html" \/>/);
    assert.match(h, /<link rel="alternate" hreflang="x-default" href="\.\/" \/>/);
  }
});

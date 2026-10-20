// Which language the page speaks: Chinese by default; English on the English
// entry page (en.html, whose <head> is in English for link previews), with
// ?lang=en, or after the switch in the top bar was pressed (remembered in
// localStorage). The address follows: switching moves it to that language's
// entry page, so a copied address opens in the language it was copied in.
// Switching never reloads: whatever shows words subscribes with onLang (or
// binds an element with bind) and redraws them, so the lesson step, the
// drive and the camera stay where they are.

import { STR } from "./teach/strings.js";
import { STR_EN } from "./teach/strings.en.js";
import { LESSONS } from "./teach/lessons.js";
import { LESSONS_EN } from "./teach/lessons.en.js";

/** @import { Strings } from "./teach/strings.js" */
/** @import { Lesson, LessonText } from "./teach/types.js" */

/** @typedef {"zh" | "en"} Lang */

const KEY = "zhinanche.lang";
/** @type {Record<Lang, Strings>} */
const TABLES = { zh: STR, en: STR_EN };

/** @param {unknown} v @returns {v is Lang} */
const isLang = (v) => v === "zh" || v === "en";

/** Each language's entry page, relative to the site's folder. @type {Record<Lang, string>} */
export const ENTRY = { zh: "./", en: "en.html" };

/**
 * The page's address in language `l`: on that language's entry page, with the
 * same query and hash (a ?lang= in it is changed to `l`).
 * @param {string} href @param {Lang} l
 */
export function langHref(href, l) {
  const u = new URL(href);
  if (u.searchParams.has("lang")) u.searchParams.set("lang", l);
  u.pathname = new URL(ENTRY[l], u).pathname;
  return u.href;
}

/** @returns {Lang} */
function initial() {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (isLang(q)) return q;
  } catch {}
  // the English entry page is English whatever was picked last time
  try {
    if (document.documentElement.dataset.entry === "en") return "en";
  } catch {}
  try {
    const v = localStorage.getItem(KEY);
    if (isLang(v)) return v;
  } catch {}
  return "zh";
}

/** @type {Lang} */
let lang = initial();
/** @type {Set<(l: Lang) => void>} */
const subs = new Set();

export const getLang = () => lang;

/** The current string table. */
export const S = () => TABLES[lang];

/** @param {(l: Lang) => void} fn called after every switch @returns {() => void} unsubscribe */
export function onLang(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** @param {Lang} l */
export function setLang(l) {
  if (l === lang) return;
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {}
  applyDocument();
  for (const fn of subs) fn(l);
}

/**
 * Give a long-lived element its words now and after every switch.
 * @template {Element} E
 * @param {E} el
 * @param {(s: Strings) => string} pick
 * @param {string} [attr] an attribute instead of the text
 * @returns {E}
 */
export function bind(el, pick, attr) {
  const set = () => {
    if (attr) el.setAttribute(attr, pick(S()));
    else el.textContent = pick(S());
  };
  set();
  onLang(set);
  return el;
}

/** @type {Partial<Record<Lang, Lesson[]>>} */
const lessonCache = {};

/** The lessons in the current language: lessons.js with the words swapped. */
export function lessons() {
  return (lessonCache[lang] ??= lang === "zh" ? LESSONS : LESSONS.map((l) => overlay(l, LESSONS_EN[l.id])));
}

/** @param {Lesson} l @param {LessonText | undefined} t @returns {Lesson} */
function overlay(l, t) {
  if (!t) return l;
  return {
    ...l,
    title: t.title,
    summary: t.summary,
    steps: l.steps.map((s, i) => {
      const w = t.steps[i];
      if (!w) return s;
      const step = { ...s, text: w.text };
      if (s.picture && w.picture) step.picture = { ...s.picture, ...w.picture };
      if (s.task && w.task) step.task = /** @type {typeof s.task} */ ({ ...s.task, ...w.task });
      return step;
    }),
  };
}

/**
 * The page frame: <html lang>, the title and description, and the elements
 * in index.html marked data-i18n="group.key" (data-i18n-attr names an
 * attribute to fill instead of the text).
 */
export function applyDocument() {
  const s = S();
  // the address says the language too (a copied address opens in it)
  try {
    const to = langHref(location.href, lang);
    if (to !== location.href) history.replaceState(history.state, "", to);
  } catch {}
  document.documentElement.lang = s.page.htmlLang;
  document.title = s.page.title;
  for (const sel of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) document.querySelector(sel)?.setAttribute("content", s.page.description);
  for (const sel of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) document.querySelector(sel)?.setAttribute("content", s.page.title);
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const [group, key] = /** @type {string} */ (el.getAttribute("data-i18n")).split(".");
    const v = /** @type {Record<string, Record<string, unknown>>} */ (/** @type {unknown} */ (s))[group]?.[key];
    if (typeof v !== "string") continue;
    const attr = el.getAttribute("data-i18n-attr");
    if (attr) el.setAttribute(attr, v);
    else el.textContent = v;
  }
}

const KAI = '"Kaiti SC", "STKaiti", "KaiTi", "AR PL UKai CN", "AR PL UKai TW", "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", "Droid Sans Fallback"';
/** @type {Record<Lang, string>} */
const CANVAS_FONT = {
  zh: `${KAI}, serif`,
  // a book serif for the Latin letters; any Chinese character falls through to the Kai list
  en: `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", "P052", Georgia, ${KAI}, serif`,
};

/** The font list for words painted on canvases in the scene. */
export const canvasFont = () => CANVAS_FONT[lang];

/** The 中 / EN switch for the top bar. */
export function langSwitch() {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "lang-btn";
  bind(b, (s) => s.bar.langButton);
  bind(b, (s) => s.bar.langLabel, "aria-label");
  bind(b, (s) => s.bar.langLabel, "title");
  bind(b, (s) => (s.page.htmlLang === "en" ? "zh-CN" : "en"), "lang");
  b.addEventListener("click", () => setLang(lang === "zh" ? "en" : "zh"));
  return b;
}

// The "复制链接" button on the 3D view in free driving: puts the chariot, its
// switches and the route drawn into a link (js/app/share.js) and copies it.

import { h, s } from "./dom.js";
import { S, bind, getLang, onLang } from "../i18n.js";
import { shareHref } from "./share.js";

/** @import { ShareSetup } from "./share.js" */

/**
 * The page's address with this setup in its hash, in the page's language.
 * @param {ShareSetup} setup
 */
export function shareUrl(setup) {
  return shareHref(location.href, setup, getLang());
}

/** @param {string} text */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // not a secure page (plain http on a school network) or no permission
    const ta = h("textarea", { readonly: true, "aria-hidden": "true", style: "position:fixed;top:0;left:0;opacity:0" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export class ShareButton {
  /** @param {() => ShareSetup} setup what to put in the link, read when pressed */
  constructor(setup) {
    this.text = h("span", { text: S().share.copy });
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.timer = undefined;
    this.el = bind(h("button", { type: "button", class: "share-btn", onclick: () => this.press(setup()) }, [
      /** @type {Node} */ (/** @type {unknown} */ (s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, [
        s("path", { class: "i-link", d: "M10 14 a4 4 0 0 0 5.7 0 l3-3 a4 4 0 0 0 -5.7 -5.7 l-1 1 M14 10 a4 4 0 0 0 -5.7 0 l-3 3 a4 4 0 0 0 5.7 5.7 l1 -1" }),
        s("path", { class: "i-done", d: "M5 12.5 L10 17.5 L19 7" }),
      ]))),
      this.text,
    ]), (t) => t.share.hint, "title");
    onLang(() => {
      this.text.textContent = this.el.classList.contains("done") ? S().share.copied : S().share.copy;
    });
    /** announces the copy (put it on the page next to the button) */
    this.status = h("span", { class: "visually-hidden", role: "status" });
  }

  /** @param {ShareSetup} setup */
  async press(setup) {
    const url = shareUrl(setup);
    const ok = await copy(url);
    if (!ok) {
      // last resort: show it so it can be copied by hand
      window.prompt(S().share.manual, url);
      return;
    }
    this.el.classList.add("done");
    this.text.textContent = S().share.copied;
    this.status.textContent = S().share.copied;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.el.classList.remove("done");
      this.text.textContent = S().share.copy;
      this.status.textContent = "";
    }, 2200);
  }
}

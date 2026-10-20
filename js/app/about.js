// The small print under the lesson list: the licence, and a link to the
// source once the repository has an address (js/site.js).

import { h } from "./dom.js";
import { S } from "../i18n.js";
import { SITE } from "../site.js";

export function siteFoot() {
  const t = S().about;
  return h("footer", { class: "site-foot" }, [
    SITE.repo ? h("a", { href: SITE.repo, target: "_blank", rel: "noopener", text: t.source }) : null,
    h("a", { href: "https://www.apache.org/licenses/LICENSE-2.0", target: "_blank", rel: "noopener", text: t.license }),
  ]);
}

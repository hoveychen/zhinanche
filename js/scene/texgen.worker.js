// Runs texgen.js off the main thread so the page stays responsive while the
// textures are made. Message in: {level, parts?}; out: {part: "chariot" | "scene", set}
// for each part asked for (both, the chariot's first, if none are named;
// buffers transferred).

import { generateChariot, generateScene } from "./texgen.js";

const scope = /** @type {{onmessage: ((e: MessageEvent) => void) | null, postMessage: (m: unknown, t: Transferable[]) => void}} */ (
  /** @type {unknown} */ (self)
);
scope.onmessage = (e) => {
  const level = e.data?.level ?? "full";
  const parts = e.data?.parts ?? ["chariot", "scene"];
  for (const [part, make] of /** @type {const} */ ([["chariot", generateChariot], ["scene", generateScene]])) {
    if (!parts.includes(part)) continue;
    const set = make(level);
    scope.postMessage({ part, set }, Object.values(set).map((t) => t.data.buffer));
  }
};

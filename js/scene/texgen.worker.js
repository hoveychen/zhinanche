// Runs texgen.js off the main thread so the page stays responsive while the
// textures are made. Message in: {level}; out: {part: "chariot" | "scene", set}
// twice, the chariot's first (buffers transferred).

import { generateChariot, generateScene } from "./texgen.js";

const scope = /** @type {{onmessage: ((e: MessageEvent) => void) | null, postMessage: (m: unknown, t: Transferable[]) => void}} */ (
  /** @type {unknown} */ (self)
);
scope.onmessage = (e) => {
  const level = e.data?.level ?? "full";
  for (const [part, make] of /** @type {const} */ ([["chariot", generateChariot], ["scene", generateScene]])) {
    const set = make(level);
    scope.postMessage({ part, set }, Object.values(set).map((t) => t.data.buffer));
  }
};

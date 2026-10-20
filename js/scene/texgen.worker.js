// Runs texgen.js off the main thread so the page stays responsive while the
// textures are made. Message in: {level}; out: {set} (buffers transferred).

import { generateAll } from "./texgen.js";

const scope = /** @type {{onmessage: ((e: MessageEvent) => void) | null, postMessage: (m: unknown, t: Transferable[]) => void}} */ (
  /** @type {unknown} */ (self)
);
scope.onmessage = (e) => {
  const set = generateAll(e.data?.level ?? "full");
  scope.postMessage({ set }, Object.values(set).map((t) => t.data.buffer));
};

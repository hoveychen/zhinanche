// Fetches and decodes the photographed textures (photo.js) off the main
// thread. That thread is busy while the scene is being set up, and on it each
// step (fetch, blob, decode) waited its turn behind that work: the sky took
// ~0.5 s to come though its files were in after 2 ms. Here the only wait is
// for the finished picture's message.
// Message in: {id, url, priority}; out: {id, image} (an ImageBitmap,
// transferred, flipped as three.js flips an <img>) or {id} if it failed.

const scope = /** @type {{onmessage: ((e: MessageEvent) => void) | null, postMessage: (m: unknown, t?: Transferable[]) => void}} */ (
  /** @type {unknown} */ (self)
);
scope.onmessage = async (e) => {
  const { id, url, priority } = e.data;
  try {
    const blob = await (await fetch(url, { priority })).blob();
    const image = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
    scope.postMessage({ id, image }, [image]);
  } catch {
    scope.postMessage({ id });
  }
};

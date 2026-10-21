"""Build the tree impostors in assets/photo/ from Poly Haven's CC0 tree models.

  uv run --with numpy --with pillow tools/assets/build_trees.py [--cache DIR] [--blender PATH]
  (or: pnpm trees)

1. fetch_models.py downloads the models in sources.json ("models") into the cache.
2. Blender renders each tree in TREES (blender/scripts/render_impostors.py): 16 frames
   round it, lit by the court's sun and photographed sky. Kept in the cache as
   <cache>/impostors/<name>.npz; delete one to render it again (~13 s a frame on an M4).
3. Each tree's frames are packed 4 × 4 into an atlas, at the sizes the page asks for:

     tree-<name>-<w>.webp   atlas w × 2w (SIZES): frame k at column k % 4, row k // 4 from the top;
                            colour is linear radiance × gain in sRGB, straight alpha, the
                            colour spread into the clear parts so mipmaps don't go dark
     trees.json             each tree's card (metres), frame count, gain, and file names

js/scene/trees.js draws them.
"""

import argparse
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "assets", "photo")
SCRIPT = os.path.join(ROOT, "blender", "scripts", "render_impostors.py")

# name -> (model in sources.json, object in its blend). LOD1: the LOD0 meshes are 10–15×
# the vertices and look the same at a frame's size.
TREES = {
    "pine": ("pine", "pine_tree_01_a_LOD1"),
    "fir": ("fir", "fir_tree_01_a_LOD1"),
    "firb": ("fir", "fir_tree_01_b_LOD1"),
}
FRAMES, COLS = 16, 4
RENDER_PX = 512
# atlas widths: 768 for the full tier, 512 for lite, 256 fetched with the sky for the first
# picture; webp quality (colour, alpha) for each. (1024 was 720–770 KB a tree and looked the
# same at the distances the trees stand at.)
SIZES = {768: (74, 70), 512: (76, 70), 256: (70, 60)}


def srgb8(lin):
    lin = np.clip(lin, 0, 1)
    return np.round(255 * np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)).astype(np.uint8)


def shrink(pre, w):
    """Box-filter premultiplied RGBA down to width w (height 2w)."""
    h0, w0 = pre.shape[:2]
    if w0 % w == 0:
        f = w0 // w
        return pre.reshape(h0 // f, f, w0 // f, f, 4).mean(axis=(1, 3))
    return np.dstack([np.asarray(Image.fromarray(pre[..., c].astype(np.float32), "F").resize((w, 2 * w), Image.BOX)) for c in range(4)])


def bleed(rgb, alpha, passes):
    """Spread colour into the clear texels (each pass: the mean of coloured neighbours)."""
    have = alpha > 1e-3
    rgb = np.where(have[..., None], rgb, 0)
    # what is left is filled with the solid foliage's mean (the thin edges are lighter)
    solid = alpha > 0.7
    mean = rgb[solid].mean(axis=0) if solid.any() else np.zeros(3)
    for _ in range(passes):
        if have.all():
            break
        acc = np.zeros_like(rgb)
        n = np.zeros(have.shape, np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
            s = np.roll(have, (dy, dx), (0, 1))
            acc += np.roll(rgb, (dy, dx), (0, 1)) * s[..., None]
            n += s
        new = ~have & (n > 0)
        rgb[new] = acc[new] / n[new][:, None]
        have = have | new
    rgb[~have] = mean
    return rgb


def render(name, model, obj, cache, blender):
    path = os.path.join(cache, "impostors", f"{name}.npz")
    if os.path.exists(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(os.path.join(HERE, "sources.json")) as f:
        meta = json.load(f)["models"][model]
    blend = os.path.join(cache, meta["id"], f"{meta['id']}_{meta['res']}.blend")
    sky = os.path.join(OUT, "sky-env-1024.webp")
    cmd = [blender, "--background", blend, "--python-exit-code", "1", "--python", SCRIPT, "--",
           "--object", obj, "--sky", sky, "--out", path + ".tmp.npz", "--frames", str(FRAMES), "--px", str(RENDER_PX)]
    print(" ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)
    os.replace(path + ".tmp.npz", path)
    return path


def pack(name, npz, manifest):
    d = np.load(npz)
    frames = d["frames"].astype(np.float32)  # (K, H, W, 4), rows bottom up, premultiplied
    k, fh, fw, _ = frames.shape
    # gain: the brightest foliage near the top of 8 bits (sRGB keeps the darks)
    a = frames[..., 3]
    lit = frames[..., :3][a > 0.5] / a[a > 0.5][:, None]
    gain = float(np.percentile(lit.max(axis=1), 99.9)) / 0.92
    files = {}
    for width, (q, aq) in SIZES.items():
        tw = width // COLS
        atlas = np.zeros((2 * width, width, 4), np.uint8)
        for i in range(k):
            pre = shrink(frames[i], tw)
            al = np.clip(pre[..., 3], 0, 1)
            rgb = pre[..., :3] / np.maximum(al, 1e-4)[..., None]
            rgb = bleed(rgb, al, passes=max(4, tw // 8))
            tile = np.dstack([srgb8(rgb / gain), np.round(al * 255).astype(np.uint8)])
            r, c = divmod(i, COLS)
            # top-down rows in the image file
            atlas[r * 2 * tw:(r + 1) * 2 * tw, c * tw:(c + 1) * tw] = np.flipud(tile)
        fn = f"tree-{name}-{width}.webp"
        Image.fromarray(atlas, "RGBA").save(os.path.join(OUT, fn), "WEBP", quality=q, alpha_quality=aq, method=6, exact=True)
        files[str(width)] = fn
        print(f"{fn}: {os.path.getsize(os.path.join(OUT, fn)) / 1024:.0f} KB")
    manifest[name] = {
        "frames": int(d["count"]),
        "cols": COLS,
        # the card, metres: width, height, the height of its centre; the tree's height
        "card": [round(float(d["width"]), 3), round(float(d["height"]), 3), round(float(d["centre"]), 3)],
        "tree": round(float(d["tree"]), 3),
        "reach": round(float(d["reach"]), 3),
        "gain": round(gain, 5),
        "files": files,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")), "zhinanche-assets"))
    ap.add_argument("--blender", default=os.environ.get("BLENDER", "blender"))
    args = ap.parse_args()
    subprocess.run([sys.executable, os.path.join(HERE, "fetch_models.py"), "--cache", args.cache], check=True)
    manifest = {}
    for name, (model, obj) in TREES.items():
        pack(name, render(name, model, obj, args.cache, args.blender), manifest)
    with open(os.path.join(OUT, "trees.json"), "w") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()

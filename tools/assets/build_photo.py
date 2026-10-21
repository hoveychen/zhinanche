"""Build assets/photo/ from the photographed sky and surface scans in sources.json.

  uv run --with numpy --with pillow tools/assets/build_photo.py [--cache DIR]
  (or: pnpm assets)

Downloads the Poly Haven files (CC0) into a cache (default ~/.cache/zhinanche-assets,
checked against Poly Haven's md5s), then writes small web files and a manifest:

  sky-bg-<w>.webp    the sky over the court: the upper part of the HDRI (SKY_BG rows),
                     turned so its sun sits where environment.js puts the sun
  sky-env-<w>.webp   the whole upper hemisphere, small, for the reflection map
  <name>-albedo|normal|arm-<size>.webp   colour, OpenGL normal, AO/roughness/metal
  manifest.json      what the page needs to know about them (sizes, average colours,
                     the sky's exposure and horizon colour)

The sky is stored in sRGB as linear radiance / SKY_HEADROOM, so brightness up to
SKY_HEADROOM times paper white survives 8 bits; the page multiplies it back. The sun
itself is clipped (environment.js draws it and the directional light is the sunlight).
"""

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
import urllib.request

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "assets", "photo")

# Must match SUN_DIR in js/scene/environment.js: 28° up, 24° north of west.
SUN_ELEV, SUN_NORTH_OF_WEST = 28.0, 24.0
# Azimuth, clockwise from north (-z) through east (+x): west is 270°.
SUN_AZ = 270.0 + SUN_NORTH_OF_WEST

SKY_HEADROOM = 4.0
# Elevation range (degrees) of the background strip: the court's walls and the far
# hills hide what is below; the camera never looks much higher than this.
SKY_BG = (-3.0, 57.0)
SKY_ENV = (-3.0, 90.0)
# Linear luminance the sky's median (away from the sun) is scaled to: about the
# brightness of the procedural sky it replaces.
SKY_MEDIAN = 0.32

# name -> (albedo sizes, normal sizes, arm sizes, albedo mode)
TEXTURES = {
    "ground": ((2048, 1024), (2048, 1024), (1024, 512), "colour"),
    "plaster": ((1024, 512), (1024, 512), (512, 256), "colour"),
    "roof": ((1024, 512), (1024, 512), (512, 256), "grey"),
    "wood": ((1024, 512), (1024, 512), (512, 256), "colour"),
}


# Poly Haven's API turns away Python's default user agent.
UA = {"User-Agent": "zhinanche-build-photo/1 (https://polyhaven.com/our-api)"}


def api(path):
    req = urllib.request.Request(f"https://api.polyhaven.com/{path}", headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def fetch(entry, cache):
    """Download one Poly Haven file entry ({url, md5, size}) into the cache, resuming."""
    url, md5 = entry["url"], entry["md5"]
    dest = os.path.join(cache, url.rsplit("/", 1)[1])
    for attempt in range(8):
        have = os.path.getsize(dest) if os.path.exists(dest) else 0
        if have == entry["size"]:
            break
        req = urllib.request.Request(url, headers={**UA, **({"Range": f"bytes={have}-"} if have else {})})
        try:
            with urllib.request.urlopen(req, timeout=120) as r, open(dest, "ab" if have else "wb") as f:
                while chunk := r.read(1 << 16):
                    f.write(chunk)
        except OSError as err:
            print(f"  retry {url}: {err}", file=sys.stderr)
            time.sleep(2 + attempt * 3)
    with open(dest, "rb") as f:
        got = hashlib.md5(f.read()).hexdigest()
    if got != md5:
        os.remove(dest)
        raise SystemExit(f"md5 mismatch for {url}")
    return dest


def read_hdr(path):
    """Radiance .hdr (RGBE, run-length encoded scanlines) -> float32 (H, W, 3), linear."""
    with open(path, "rb") as f:
        data = f.read()
    pos = 0
    while True:
        end = data.index(b"\n", pos)
        line, pos = data[pos:end], end + 1
        m = re.match(rb"-Y (\d+) \+X (\d+)", line)
        if m:
            h, w = int(m.group(1)), int(m.group(2))
            break
    buf = np.frombuffer(data, dtype=np.uint8, offset=pos)
    out = np.empty((h, w, 4), dtype=np.uint8)
    i = 0
    for y in range(h):
        if buf[i] != 2 or buf[i + 1] != 2:
            raise ValueError("only new-style RLE .hdr files are supported")
        i += 4
        for c in range(4):
            row = out[y, :, c]
            x = 0
            while x < w:
                n = int(buf[i])
                i += 1
                if n > 128:
                    n -= 128
                    row[x:x + n] = buf[i]
                    i += 1
                else:
                    row[x:x + n] = buf[i:i + n]
                    i += n
                x += n
    e = out[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0).astype(np.float32)
    return out[..., :3].astype(np.float32) * scale[..., None]


def to_srgb8(lin):
    lin = np.clip(lin, 0.0, 1.0)
    s = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    return (s * 255 + 0.5).astype(np.uint8)


def from_srgb8(img):
    s = img.astype(np.float32) / 255
    return np.where(s <= 0.04045, s / 12.92, np.power((s + 0.055) / 1.055, 2.4))


def lum(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def strip(src, elev, width):
    """Rows of an equirect image between two elevations, resampled to `width` wide."""
    h, w, _ = src.shape
    y0 = int(round((90 - elev[1]) / 180 * h))
    y1 = int(round((90 - elev[0]) / 180 * h))
    part = src[y0:y1]
    height = max(1, round(width * (elev[1] - elev[0]) / 360))
    # resize each channel as float (PIL "F" mode keeps the dynamic range)
    chans = [np.asarray(Image.fromarray(part[..., c]).resize((width, height), Image.LANCZOS)) for c in range(3)]
    return np.clip(np.stack(chans, -1), 0, None)


def webp(arr, path, quality, lossless=False):
    Image.fromarray(arr).save(path, "WEBP", quality=quality, method=6, lossless=lossless)
    return os.path.basename(path)


def build_sky(meta, cache, manifest):
    files = api(f"files/{meta['id']}")
    src = read_hdr(fetch(files["hdri"][meta["res"]]["hdr"], cache))
    h, w, _ = src.shape
    # Find the sun: the brightest spot after a little blur (a single hot pixel won't do).
    l = lum(src)
    small = l.reshape(h // 8, 8, w // 8, 8).mean(axis=(1, 3))
    sy, sx = np.unravel_index(np.argmax(small), small.shape)
    sun_u = (sx + 0.5) / small.shape[1]
    sun_elev = 90 - (sy + 0.5) / small.shape[0] * 180
    # Column u of an equirect image looks at azimuth 360°·u clockwise (from above), so
    # rolling it puts the sun at SUN_AZ: column 0 of the output looks north.
    shift = int(round((sun_u - SUN_AZ / 360) * w)) % w
    src = np.roll(src, -shift, axis=1)
    # Exposure: the sky's median away from the sun (the upper hemisphere, sun side cut).
    upper = src[: h // 2]
    az = (np.arange(w) + 0.5) / w * 360
    away = np.abs(((az - SUN_AZ + 180) % 360) - 180) > 60
    k = SKY_MEDIAN / float(np.median(lum(upper[:, away])))
    src *= k
    # The photo's sun stands higher than ours: paint it out (a disc filled with the
    # sky just round it), or the court would have two suns.
    ys = slice(max(0, sy * 8 - h // 30), sy * 8 + h // 30)
    cx = int(SUN_AZ / 360 * w)
    xs = np.arange(cx - w // 60, cx + w // 60) % w
    win = src[ys][:, xs]
    yy = (np.arange(ys.start, ys.stop) + 0.5)[:, None]
    xx = (cx - w // 60 + np.arange(len(xs)) + 0.5)[None, :]
    el = np.radians(90 - yy / h * 180)
    r = np.degrees(np.arccos(np.clip(
        np.sin(el) * math.sin(math.radians(sun_elev))
        + np.cos(el) * math.cos(math.radians(sun_elev)) * np.cos(np.radians((xx - (cx + 0.5)) / w * 360)), -1, 1)))
    ring = win[(r > 2.5) & (r < 3.5)].mean(0)
    fill = np.clip((r - 1.5) / 1.0, 0, 1)[..., None]
    src[ys.start:ys.stop, xs] = win * fill + ring * (1 - fill)
    out = {"id": meta["id"], "headroom": SKY_HEADROOM, "sunElevation": round(float(sun_elev), 1)}
    for name, elev, widths in (("bg", SKY_BG, (4096, 2048)), ("env", SKY_ENV, (1024,))):
        files_out = {}
        for width in widths:
            s = strip(src, elev, width)
            files_out[str(width)] = webp(to_srgb8(s / SKY_HEADROOM), os.path.join(OUT, f"sky-{name}-{width}.webp"), 86)
        out[name] = {"elev": list(elev), "files": files_out}

    def mean(elev, az0, az1):
        a = strip(src, elev, 720)
        cols = slice(int(az0 * 2), int(az1 * 2))
        return [round(float(v), 4) for v in a[:, cols].reshape(-1, 3).mean(0)]

    # Fog: the haze just above the horizon looking south, where the view mostly goes.
    out["fog"] = mean((0.5, 3.0), 150, 210)
    out["zenith"] = mean((80.0, 90.0), 0, 360)
    manifest["sky"] = out
    print(f"sky: sun found at {sun_elev:.1f}° up; exposure x{k:.3f}; fog {out['fog']}")


def resize(img, size, mode=Image.LANCZOS):
    return img if img.size[0] == size else img.resize((size, size), mode)


def build_texture(name, meta, cache, manifest):
    files = api(f"files/{meta['id']}")
    res = meta["res"]
    albedo = Image.open(fetch(files["Diffuse"][res]["jpg"], cache)).convert("RGB")
    normal = Image.open(fetch(files["nor_gl"][res]["jpg"], cache)).convert("RGB")
    arm = Image.open(fetch(files["arm"][res]["jpg"], cache)).convert("RGB")
    a_sizes, n_sizes, m_sizes, mode = TEXTURES[name]
    lin = from_srgb8(np.asarray(albedo))
    if mode == "grey":
        # keep the light and dark of the scan, lose its colour: the page tints it
        g = lum(lin)
        g = g / g.mean() * 0.5
        lin = np.repeat(g[..., None], 3, -1)
        albedo = Image.fromarray(to_srgb8(lin))
    out = {"id": meta["id"], "mean": [round(float(v), 4) for v in lin.reshape(-1, 3).mean(0)], "albedo": {}, "normal": {}, "arm": {}}
    for s in a_sizes:
        out["albedo"][str(s)] = webp(np.asarray(resize(albedo, s)), os.path.join(OUT, f"{name}-albedo-{s}.webp"), 84)
    for s in n_sizes:
        out["normal"][str(s)] = webp(np.asarray(resize(normal, s)), os.path.join(OUT, f"{name}-normal-{s}.webp"), 90)
    for s in m_sizes:
        out["arm"][str(s)] = webp(np.asarray(resize(arm, s)), os.path.join(OUT, f"{name}-arm-{s}.webp"), 88)
    manifest["textures"][name] = out
    print(f"{name}: {meta['id']} mean {out['mean']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")), "zhinanche-assets"))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(HERE, "sources.json")) as f:
        sources = json.load(f)
    manifest = {"about": "Generated by tools/assets/build_photo.py from tools/assets/sources.json; do not edit.", "textures": {}}
    build_sky(sources["sky"], args.cache, manifest)
    for name, meta in sources["textures"].items():
        build_texture(name, meta, args.cache, manifest)
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")
    total = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
    print(f"wrote {OUT} ({total / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

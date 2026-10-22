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

Two sets are baked here rather than cut from a scan, because no CC0 scan has them:

  roof-*      palace glazed tiles: rows of round tiles (筒瓦) over pan tiles (板瓦), from
              a height field (TILE_*), with the clay roof scan's stains and chips as the
              glaze's grain. The page puts a round tile end (瓦当) at the foot of every row
              (js/scene/eaves.js TILE must match TILE_* here; tests/scene/eaves.test.js checks).
  dougong-*   the bracket sets (斗拱) under an eave, a band in front elevation: the parts
              of one Qing set drawn into a depth buffer, painted, with the plaster scan's
              stains; the depth gives the normal map and the occlusion.

  --only roof,dougong   rebuild just those (the rest of the manifest is kept)
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
from PIL import Image, ImageFilter

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

# name -> (albedo sizes, normal sizes, arm sizes, albedo mode); the sizes are the ones
# js/scene/look.js asks for (full, lite tiers).
#   colour      the scan as it is (the page tints it to the old colour by its mean)
#   grey        light and dark only, mean 0.5 (the page tints it per roof)
#   multiplier  light and dark only, a little warm, near white (mean ~0.72 linear):
#               it multiplies the chariot's role colours as the procedural wood did,
#               so materials.js and the rig's highlight colours stay as they are
#   tint        like multiplier (near white, contrast softened) but keeping the scan's
#               own colour: rust stays brown under the role's iron grey
#   lacquer     a lacquered board: the colour a faint grain near white (mean ~0.85 linear,
#               like the procedural woodSoft it replaces) under the role's lacquer colour;
#               the arm's G the scan's gloss -- rubs, scratches and board seams -- spread
#               round a mean of 0.5, so a role's roughness doubles to its old mean; its B
#               (no metal) flakes along the grain, where a worn edge breaks through first
#   rows        palace tile rows baked from a height field, the scan for grain (tile_rows)
TEXTURES = {
    # ground also at 256: fetched with the sky, so the very first picture already has it
    "ground": ((1024, 256), (1024, 256), (1024, 512, 256), "colour"),
    "plaster": ((1024, 512), (1024, 512), (512, 256), "colour"),
    "roof": ((1024, 512), (512,), (512, 256), "rows"),
    "wood": ((1024, 512), (1024, 512), (), "multiplier"),
    # the ironwork is small: 512 is plenty, and its arm map carries the rust (metal 0) vs iron (metal 1)
    "iron": ((512,), (512,), (512,), "tint"),
    # the chariot's lacquer (box, railing, wheels, eaves, paintings' coat)
    "lacquer": ((1024, 512), (1024, 512), (1024, 512), "lacquer"),
}

# The tile rows (chi): one texture is TILE_SPAN square, TILE_ROWS rows of round tiles
# across it, TILE_SEGS tiles up each row; round tiles TILE_RADIUS. Palace rows are
# about 1¼ chi apart; the clay scan's were half that, too fine to read as rows.
TILE_SPAN, TILE_ROWS, TILE_SEGS, TILE_RADIUS = 10.0, 8, 8, 0.3

# The bracket band: one set per module, DOUGONG_M wide and DOUGONG_H high (chi);
# texel widths for the full and lite tiers.
DOUGONG_M, DOUGONG_H = 3.0, 2.4
DOUGONG_SIZES = (320, 160)


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


# ---- baked sets: height fields -----------------------------------------------------


def blur(a, r):
    """Gaussian blur of radius r texels, wrapping (the results tile)."""
    h, w = a.shape
    fy, fx = np.fft.fftfreq(h)[:, None], np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi * r) ** 2 * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g)).astype(np.float32)


def normal_map(h, per_unit):
    """OpenGL tangent-space normals (8-bit RGB) of a height field in chi, image row 0 at v = 1."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * per_unit
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * per_unit
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return (n * 127.5 + 127.5 + 0.5).clip(0, 255).astype(np.uint8)


def occlusion(h, per_unit, radii):
    """Cheap sky occlusion: how far a texel sits below its surroundings, over a few scales."""
    occ = sum(np.maximum(blur(h, r) - h, 0) * per_unit / r for r in radii)
    return np.clip(1 - 0.9 * occ / len(radii), 0, 1)


def grain(path, w, h, close, radius, crop=None):
    """A scan's light and dark as a multiplier near 1: its thin dark joints closed away
    (a max then a min filter `close` texels wide), high-passed at `radius`; of the part
    `crop` (a PIL box) of it if given."""
    img = Image.open(path).convert("RGB")
    if crop:
        img = img.crop(crop)
    if img.size != (w, h):
        img = img.resize((w, h), Image.LANCZOS)
    l = lum(from_srgb8(np.asarray(img)))
    if close:
        im = Image.fromarray(to_srgb8(l)).filter(ImageFilter.MaxFilter(close)).filter(ImageFilter.MinFilter(close))
        l = blur(from_srgb8(np.asarray(im)), 1.0)
    return np.clip(l / np.maximum(blur(l, radius), 1e-3), 0.6, 1.4)


def arm8(ao, rough):
    return (np.stack([ao, rough, np.zeros_like(ao)], -1) * 255 + 0.5).clip(0, 255).astype(np.uint8)


def tile_rows(scan, size=1024, seed=3):
    """Glazed palace tiles, TILE_SPAN chi square: returns (albedo grey linear mean 0.5,
    normal 8-bit, arm 8-bit). u runs along the eave, v up the slope; the rows are
    centred at u = (k + ½)·span/rows. Each tile laps the one below it, so its lower
    edge stands proud; the round tiles have a groove at each joint."""
    rng = np.random.default_rng(seed)
    per = size / TILE_SPAN
    pitch, seg, R = TILE_SPAN / TILE_ROWS, TILE_SPAN / TILE_SEGS, TILE_RADIUS
    x = (np.arange(size) + 0.5) / per
    v = TILE_SPAN - (np.arange(size) + 0.5) / per
    X, V = np.meshgrid(x, v)
    k = np.floor(X / pitch).astype(int) % TILE_ROWS
    du = X - (np.floor(X / pitch) + 0.5) * pitch
    tube = np.abs(du) < R
    # where along its tile a texel is (0 lower edge .. 1 top), the rows staggered
    up = V + k * 0.37 * seg
    ph = up % seg / seg
    lap = 0.05 * (1 - ph)
    groove = 0.06 * (np.exp(-(ph / 0.03) ** 2) + np.exp(-((ph - 1) / 0.03) ** 2))
    # pan tiles between the rows: a shallow trough laid in short courses (三露七压: a third shows)
    pan_seg = seg / 3
    pph = (V + k * 0.21) % pan_seg / pan_seg
    t = np.clip((np.abs(du) - R * 0.9) / (pitch / 2 - R * 0.9), 0, 1)
    pan = -0.06 * np.sin(t * np.pi / 2) + 0.04 * (1 - pph)
    h = np.maximum(np.where(tube, np.sqrt(np.clip(R * R - du * du, 0, None)) + lap - groove + 0.02, 0.0), pan)
    h = blur(h.astype(np.float32), 0.8 * size / 1024)
    # tile to tile the glaze varies; a few are faded
    seg_id = np.floor(up / seg).astype(int) % TILE_SEGS
    pan_id = np.floor((V + k * 0.21) / pan_seg).astype(int) % (TILE_SEGS * 3)
    tone = rng.normal(1.0, 0.07, (TILE_ROWS, TILE_SEGS)).clip(0.8, 1.2)
    fade = (rng.random((TILE_ROWS, TILE_SEGS)) < 0.12) * rng.uniform(0.2, 0.5, (TILE_ROWS, TILE_SEGS))
    pan_tone = rng.normal(0.92, 0.06, (TILE_ROWS, TILE_SEGS * 3)).clip(0.75, 1.1)
    g = grain(scan, size, size, max(3, size // 200) | 1, 14 * size / 1024) ** 0.7
    ao = occlusion(h, per, [r * size / 1024 for r in (3, 8, 20)])
    dirt = np.clip(1 - h / 0.25, 0, 1) * ~tube
    albedo = np.where(tube, tone[k, seg_id] * (1 + fade[k, seg_id]), pan_tone[k, pan_id] * 0.85)
    albedo = albedo * g * (1 - 0.25 * dirt) * (0.55 + 0.45 * ao)
    albedo = albedo / albedo.mean() * 0.5
    rough = np.where(tube, 0.32, 0.62) + 0.18 * (1 - np.clip(g, 0, 1.2) / 1.2) + 0.15 * dirt
    rough = np.clip(blur(rough.astype(np.float32), 1.0), 0, 1)
    return albedo.astype(np.float32), normal_map(h, per), arm8(ao, rough)


def hexlin(h):
    return from_srgb8(np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], np.uint8))


def dougong_band(stains, width):
    """One bracket set (平身科) of a Qing eave in front elevation, centred in a module
    DOUGONG_M wide and DOUGONG_H high (v = 0 at the band's foot): returns (albedo linear
    RGB, normal 8-bit, arm 8-bit). Parts nearer the viewer win the depth buffer; blue and
    green alternate part to part (青绿相间), red panels between the sets, a dark edge and
    a white line just inside every part (墨线, 白粉)."""
    blue, green, panel, gold = hexlin(0x31556E), hexlin(0x3E6B58), hexlin(0x7E2E22), hexlin(0xB08A48)
    hp = int(round(width * DOUGONG_H / DOUGONG_M))
    per = width / DOUGONG_M
    X, Y = np.meshgrid(((np.arange(width) + 0.5) / width - 0.5) * DOUGONG_M, DOUGONG_H - (np.arange(hp) + 0.5) / per)
    depth = np.zeros((hp, width), np.float32)
    col = np.tile(panel, (hp, width, 1)).astype(np.float32)
    ids = np.zeros((hp, width), np.int32)
    n = 0

    def put(mask, d, c):
        nonlocal depth, n
        n += 1
        win = mask & (d >= depth)
        depth = np.where(win, d, depth)
        col[win] = c
        ids[win] = n

    def rect(x0, x1, y0, y1):
        return (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)

    def arm(w, y0, y1, r=0.18):
        """A bracket arm (拱), its ends rounded off underneath (卷杀)."""
        m = rect(-w / 2, w / 2, y0, y1)
        for s in (-1, 1):
            cx, cy = s * (w / 2 - r), y0 + r
            m &= ~((s * X > s * cx) & (Y < cy) & ((X - cx) ** 2 + (Y - cy) ** 2 > r * r))
        return m

    def dou(cx, w, y0, y1):
        """A block (斗, 升): straight sides above, tapering in its lower part."""
        half = w / 2 * (0.78 + 0.22 * np.clip((Y - y0) / ((y1 - y0) * 0.4), 0, 1))
        return (np.abs(X - cx) <= half) & (Y >= y0) & (Y <= y1)

    full = DOUGONG_M  # beams run on across the module edges
    put(rect(-full, full, 0, 0.26), 0.06, blue)  # the plank the sets stand on (平板枋)
    put(dou(0, 0.95, 0.26, 0.74), 0.32, green)  # the big block (坐斗)
    put(arm(2.0, 0.66, 0.98), 0.24, blue)  # first arm across it (瓜拱)
    for s in (-1, 1):
        put(dou(s * 0.82, 0.38, 0.98, 1.2), 0.28, green)
    put(arm(2.7, 1.16, 1.46), 0.2, green)  # the longer arm (万拱)
    for s in (-1, 1):
        put(dou(s * 1.16, 0.38, 1.46, 1.66), 0.24, blue)
    put(rect(-full, full, 1.66, 1.92), 0.16, blue)  # the beam they carry (正心枋)
    # the cantilever coming out at the middle: a beak pointing down (昂嘴), blocks, the outer arm (厢拱)
    put((np.abs(X) <= 0.2 * np.clip((Y - 0.42) / 0.36, 0, 1)) & (Y >= 0.42) & (Y <= 1.0), 1.15, green)
    put(dou(0, 0.46, 0.98, 1.22), 0.95, blue)
    put(arm(1.9, 1.5, 1.8), 1.35, blue)
    put(dou(0, 0.46, 1.22, 1.5), 1.25, green)
    for s in (-1, 1):
        put(dou(s * 0.76, 0.36, 1.8, 2.02), 1.4, green)
    put(rect(-full, full, 2.02, DOUGONG_H), 1.6, green)  # the eave beam on top, proud of it all (挑檐枋)
    # a painted flame on each panel between the sets
    flame = (ids == 0) & ((((X - DOUGONG_M / 2 * np.sign(X)) / 0.2) ** 2 + ((Y - 0.95) / 0.28) ** 2) < 1)
    col[flame] = col[flame] * 0.6 + gold * 0.4
    edge = np.zeros_like(ids, bool)
    inner = np.zeros_like(ids, bool)
    s = width / 320
    for i in range(1, n + 1):
        m = (ids == i).astype(np.float32)
        b1, b3 = blur(m, 1.2 * s), blur(m, 3.2 * s)
        edge |= (m > 0.5) & (b1 < 0.75)
        inner |= (m > 0.5) & (b1 >= 0.75) & (b3 < 0.62) & (b3 > 0.42)
    col[edge] *= 0.35
    col[inner] = col[inner] * 0.45 + 0.55 * np.array([0.8, 0.78, 0.7], np.float32)
    # old paint: faded a little towards grey, stained
    col = col * 0.85 + col.mean(-1, keepdims=True) * 0.15
    # (a corner of the scan, so its stains are about the size they were on the wall)
    col *= (grain(stains, width, hp, 0, 10 * s, crop=(0, 0, 1024, 1024 * hp // width)) ** 0.8)[..., None]
    h = blur(depth, 0.9 * s)
    ao = occlusion(h, per, [r * s for r in (3, 9, 24)])
    albedo = col * (0.45 + 0.55 * ao[..., None])
    return albedo, normal_map(h, per), arm8(ao, np.full_like(ao, 0.78))


def build_texture(name, meta, cache, manifest):
    files = api(f"files/{meta['id']}")
    res = meta["res"]
    albedo_path = fetch(files["Diffuse"][res]["jpg"], cache)
    albedo = Image.open(albedo_path).convert("RGB")
    normal = Image.open(fetch(files["nor_gl"][res]["jpg"], cache)).convert("RGB")
    arm = Image.open(fetch(files["arm"][res]["jpg"], cache)).convert("RGB")
    a_sizes, n_sizes, m_sizes, mode = TEXTURES[name]
    lin = from_srgb8(np.asarray(albedo))
    extra = {}
    if mode == "rows":
        # grey like "grey" (the page tints it per roof), but the rows are baked, not the scan's
        g, nor, rm = tile_rows(albedo_path, max(a_sizes))
        lin = np.repeat(g[..., None], 3, -1)
        albedo, normal, arm = Image.fromarray(to_srgb8(lin)), Image.fromarray(nor), Image.fromarray(rm)
        extra = {"tile": {"span": TILE_SPAN, "rows": TILE_ROWS, "radius": TILE_RADIUS}}
    elif mode == "grey":
        # keep the light and dark of the scan, lose its colour: the page tints it
        g = lum(lin)
        g = g / g.mean() * 0.5
        lin = np.repeat(g[..., None], 3, -1)
        albedo = Image.fromarray(to_srgb8(lin))
    elif mode == "multiplier":
        g = lum(lin)
        # grain contrast a little softer than the scan's (dark wood has deep figure)
        g = np.exp(np.log(np.maximum(g / g.mean(), 1e-3)) * 0.7)
        lin = np.clip(g[..., None] * 0.72 * np.array([1.0, 0.93, 0.85], np.float32), 0, 1)
        albedo = Image.fromarray(to_srgb8(lin))
    elif mode == "lacquer":
        g = lum(lin)
        g = np.exp(np.log(np.maximum(g / g.mean(), 1e-3)) * 0.5)
        lin = np.clip(g[..., None] * 0.85, 0, 1).repeat(3, -1)
        albedo = Image.fromarray(to_srgb8(lin))
        r = np.asarray(arm, np.float32)[..., 1] / 255
        r = np.clip(0.5 + (r - r.mean()) * 1.6, 0.25, 1)
        # B (no metal here): where an edge's wear breaks through first, the scan's
        # figure blurred to flakes along the grain, ranked to an even 0..1
        f = blur(lum(from_srgb8(np.asarray(Image.open(albedo_path).convert("RGB")))), 5.0)
        f = (np.argsort(np.argsort(f, axis=None)).reshape(f.shape) / f.size).astype(np.float32)
        arm = Image.fromarray((np.stack([np.ones_like(r), r, f], -1) * 255 + 0.5).clip(0, 255).astype(np.uint8))
    elif mode == "tint":
        g = lum(lin)
        g2 = np.exp(np.log(np.maximum(g / g.mean(), 1e-3)) * 0.7) * 0.72
        lin = np.clip(lin * (g2 / np.maximum(g, 1e-4))[..., None], 0, 1)
        albedo = Image.fromarray(to_srgb8(lin))
    out = {"id": meta["id"], "mean": [round(float(v), 4) for v in lin.reshape(-1, 3).mean(0)], "albedo": {}, "normal": {}, "arm": {}, **extra}
    for s in a_sizes:
        out["albedo"][str(s)] = webp(np.asarray(resize(albedo, s)), os.path.join(OUT, f"{name}-albedo-{s}.webp"), 84)
    for s in n_sizes:
        out["normal"][str(s)] = webp(np.asarray(resize(normal, s)), os.path.join(OUT, f"{name}-normal-{s}.webp"), 90)
    for s in m_sizes:
        out["arm"][str(s)] = webp(np.asarray(resize(arm, s)), os.path.join(OUT, f"{name}-arm-{s}.webp"), 88)
    manifest["textures"][name] = out
    print(f"{name}: {meta['id']} mean {out['mean']}")
    return albedo_path


def build_dougong(stains, manifest):
    """The bracket band (dougong_band) at DOUGONG_SIZES texel widths."""
    master = max(DOUGONG_SIZES)
    lin, nor, rm = dougong_band(stains, master)
    hp = lin.shape[0]
    out = {"id": "baked: build_photo.py dougong_band", "mean": [round(float(v), 4) for v in lin.reshape(-1, 3).mean(0)],
           "module": [DOUGONG_M, DOUGONG_H], "albedo": {}, "normal": {}, "arm": {}}
    for w in DOUGONG_SIZES:
        size = (w, round(hp * w / master))
        for key, arr, q in (("albedo", to_srgb8(lin), 88), ("normal", nor, 92), ("arm", rm, 90)):
            img = Image.fromarray(arr)
            if img.size != size:
                img = img.resize(size, Image.LANCZOS)
            out[key][str(w)] = webp(np.asarray(img), os.path.join(OUT, f"dougong-{key}-{w}.webp"), q)
    manifest["textures"]["dougong"] = out
    print(f"dougong: {master} x {hp}, mean {out['mean']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")), "zhinanche-assets"))
    ap.add_argument("--only", default="", help="comma-separated parts to rebuild (sky, ground, plaster, roof, wood, dougong); the rest of the manifest is kept")
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(HERE, "sources.json")) as f:
        sources = json.load(f)
    only = set(filter(None, args.only.split(",")))
    want = lambda part: not only or part in only  # noqa: E731
    manifest = {"about": "Generated by tools/assets/build_photo.py from tools/assets/sources.json; do not edit.", "textures": {}}
    old_path = os.path.join(OUT, "manifest.json")
    if only and os.path.exists(old_path):
        with open(old_path) as f:
            old = json.load(f)
        manifest["textures"] = old.get("textures", {})
        if "sky" in old:
            manifest["sky"] = old["sky"]
    if want("sky"):
        build_sky(sources["sky"], args.cache, manifest)
    for name, meta in sources["textures"].items():
        if want(name):
            build_texture(name, meta, args.cache, manifest)
    if want("dougong"):
        files = api(f"files/{sources['textures']['plaster']['id']}")
        build_dougong(fetch(files["Diffuse"][sources["textures"]["plaster"]["res"]]["jpg"], args.cache), manifest)
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")
    total = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
    print(f"wrote {OUT} ({total / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

"""Download the Poly Haven models named in sources.json ("models") with their textures.

  uv run tools/assets/fetch_models.py [--cache DIR]

Each model's .blend and the texture files it links to go into <cache>/<id>/ (the blend
looks for them in textures/ next to it), checked against Poly Haven's md5s and resumed
if cut off. build_trees.py renders them; nothing here goes into the site.
"""

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "zhinanche-build-photo/1 (https://polyhaven.com/our-api)"}


def api(path):
    req = urllib.request.Request(f"https://api.polyhaven.com/{path}", headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def fetch(url, md5, size, dest):
    """Download url to dest, resuming, and check its md5."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(12):
        have = os.path.getsize(dest) if os.path.exists(dest) else 0
        if have == size:
            break
        if have > size:
            os.remove(dest)
            have = 0
        req = urllib.request.Request(url, headers={**UA, **({"Range": f"bytes={have}-"} if have else {})})
        try:
            with urllib.request.urlopen(req, timeout=120) as r, open(dest, "ab" if have else "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
        except OSError as err:
            print(f"  retry {url}: {err}", file=sys.stderr)
            time.sleep(2 + attempt * 3)
    h = hashlib.md5()
    with open(dest, "rb") as f:
        while chunk := f.read(1 << 24):
            h.update(chunk)
    if h.hexdigest() != md5:
        os.remove(dest)
        raise SystemExit(f"md5 mismatch for {url}")
    return dest


def fetch_model(meta, cache):
    """The model's blend (at meta['res'] textures) and its textures; returns the blend's path."""
    files = api(f"files/{meta['id']}")
    entry = files["blend"][meta["res"]]["blend"]
    root = os.path.join(cache, meta["id"])
    for rel, inc in entry.get("include", {}).items():
        fetch(inc["url"], inc["md5"], inc["size"], os.path.join(root, rel))
    blend = fetch(entry["url"], entry["md5"], entry["size"], os.path.join(root, entry["url"].rsplit("/", 1)[1]))
    print(f"{meta['id']}: {blend}")
    return blend


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")), "zhinanche-assets"))
    args = ap.parse_args()
    with open(os.path.join(HERE, "sources.json")) as f:
        sources = json.load(f)
    for meta in sources["models"].values():
        fetch_model(meta, args.cache)


if __name__ == "__main__":
    main()

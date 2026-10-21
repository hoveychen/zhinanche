"""Run many (route, settings) cases in parallel and keep numbers and curves.

    uv run --with mujoco --with numpy python batch.py --root ../../../cad-chariot \
        --routes out/routes-cad.json --out out/results-cad.json [--only song:normal:*] \
        [--set "clutch_push=1000;friction=0.2"] [--tag name] [--jobs 10]

`--only` takes comma-separated mechanism:mode:name globs. `--set` may be given several
times; every route is run once per `--set` (none = the design's own settings). Results are
appended to `--out` (keyed by tag, route and settings, so reruns replace), and each run's
curves at 20 Hz go to `<out stem>/<tag>/<mechanism>.<mode>.<name>.<settings>.npz` for plot.py.
"""

import argparse
import fnmatch
import json
import os
import sys
import time
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model import design  # noqa: E402
from sim import REC_HZ, metrics, run  # noqa: E402

CURVE_HZ = 20


def parse_set(spec):
    kw = {}
    for a in (spec or "").split(";"):
        if not a.strip():
            continue
        k, v = a.split("=")
        try:
            kw[k.strip()] = json.loads(v)
        except json.JSONDecodeError:
            kw[k.strip()] = v.strip()
    return kw


def set_label(kw):
    return ",".join(f"{k}={v}" for k, v in sorted(kw.items())) or "base"


def one(job):
    route, root, dname, kw, curve_path = job
    t0 = time.time()
    try:
        res = run(route, route["mechanism"], root, design(dname, **kw))
        mt, err, dp, dk = metrics(res)
    except Exception as e:  # a blow-up is a result too
        return dict(key=job_key(route), settings=kw, error=repr(e), wall=time.time() - t0)
    R = res["info"]["wheel_r"] / 0.31  # chi
    dist = np.concatenate([[0.0], np.cumsum((np.abs(np.diff(res["pl"])) + np.abs(np.diff(res["pr"]))) / 2 * R)])
    k = max(1, REC_HZ // CURVE_HZ)
    os.makedirs(os.path.dirname(curve_path), exist_ok=True)
    np.savez_compressed(curve_path, t=res["t"][::k], dist=dist[::k], err=err[::k], dev_phys=dp[::k], dev_kin=dk[::k],
                        liftL=res["liftL"][::k], liftR=res["liftR"][::k], pen=res["pen"][::k])
    mt["dist_chi"] = float(dist[-1])
    mt["curves"] = curve_path
    return dict(key=job_key(route), settings=kw, metrics=mt, wall=time.time() - t0)


def job_key(r):
    return f'{r["mechanism"]}:{r["mode"]}:{r["name"]}'


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.join(here, "..", ".."))
    ap.add_argument("--routes", default=os.path.join(here, "out", "routes-cad.json"))
    ap.add_argument("--out", default=os.path.join(here, "out", "results-cad.json"))
    ap.add_argument("--design", default="layout")
    ap.add_argument("--only", default="*")
    ap.add_argument("--set", action="append")
    ap.add_argument("--tag", default="main")
    ap.add_argument("--jobs", type=int, default=os.cpu_count())
    a = ap.parse_args()
    routes = json.load(open(a.routes))["routes"]
    pats = a.only.split(",")
    routes = [r for r in routes if any(fnmatch.fnmatch(job_key(r), p) for p in pats)]
    sets = [parse_set(s) for s in (a.set or [""])]
    stem = os.path.splitext(a.out)[0]
    jobs = []
    for kw in sets:
        for r in routes:
            cp = os.path.join(stem, a.tag, f'{job_key(r).replace(":", ".")}.{set_label(kw)}.npz')
            jobs.append((r, os.path.abspath(a.root), a.design, kw, cp))
    print(f"{len(jobs)} runs on {a.jobs} processes", flush=True)
    db = json.load(open(a.out)) if os.path.exists(a.out) else {"runs": []}
    t0 = time.time()
    new = []
    with Pool(a.jobs) as p:
        for i, r in enumerate(p.imap_unordered(one, jobs)):
            r.update(tag=a.tag, design=a.design, root=os.path.abspath(a.root))
            new.append(r)
            m = r.get("metrics")
            if m:
                print(f'[{i + 1}/{len(jobs)}] {r["key"]:38s} {set_label(r["settings"]):30s} err max {m["err_max"]:7.2f} '
                      f'end {m["err_end"]:7.2f} skips {m["skips"]} pen {m["pen_max_mm"]:.2f}mm '
                      f'({m["sim_time"]:.0f}s sim, {r["wall"]:.0f}s)', flush=True)
            else:
                print(f'[{i + 1}/{len(jobs)}] {r["key"]} FAILED {r["error"]}', flush=True)
    ids = {(r["tag"], r["key"], set_label(r["settings"])) for r in new}
    db["runs"] = [r for r in db["runs"] if (r["tag"], r["key"], set_label(r["settings"])) not in ids] + new
    json.dump(db, open(a.out, "w"), indent=1, default=str)
    print(f"done in {time.time() - t0:.0f}s -> {a.out}")


if __name__ == "__main__":
    main()

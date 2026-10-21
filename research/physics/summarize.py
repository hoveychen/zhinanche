"""Tables from batch.py results.

    python summarize.py out/results-cad.json [--tag base] [--routes]   # per group, or per route
"""

import argparse
import json
from collections import defaultdict

import numpy as np


def label(kw):
    return ",".join(f"{k}={v}" for k, v in sorted(kw.items())) or "base"


def group_of(key):
    mech, mode, name = key.split(":")
    kind = "random" if name.startswith("random") else "named"
    return f"{mech}:{mode}:{kind}"


def rows(db, tag=None):
    for r in db["runs"]:
        if tag and r["tag"] != tag:
            continue
        if "metrics" in r:
            yield r


def table(db, tag=None, per_route=False):
    g = defaultdict(list)
    for r in rows(db, tag):
        k = (r["tag"], label(r["settings"]), r["key"] if per_route else group_of(r["key"]))
        g[k].append(r["metrics"])
    out = []
    for (tg, st, grp), ms in sorted(g.items()):
        em = np.array([m["err_max"] for m in ms])
        ee = np.array([abs(m["err_end"]) for m in ms])
        sk = np.array([m["skips"] for m in ms])
        row = dict(tag=tg, settings=st, group=grp, n=len(ms),
                   err_max_med=float(np.median(em)), err_max_max=float(em.max()),
                   err_end_med=float(np.median(ee)), err_end_max=float(ee.max()),
                   jump_max=float(max(m["jump_max"] for m in ms)),
                   runs_with_skips=int((sk > 0).sum()), skips=int(sk.sum()),
                   pen_max_mm=float(max(m["pen_max_mm"] for m in ms)),
                   dist_chi=float(sum(m["dist_chi"] for m in ms)))
        eng = [e for m in ms for e in m.get("engage_list", [])]
        if eng:
            dl = np.array([e["delay"] for e in eng])
            fj = np.array([e["fig_jump"] for e in eng])
            dl = np.where(np.isfinite(dl), dl, 1e3)  # never seated: counts as very late
            row.update(engagements=len(eng), not_seated=int(sum(not e["seated_before_move"] for e in eng)),
                       never=int((dl >= 1e3).sum()),
                       delay_p50=float(np.median(dl)), delay_p90=float(np.percentile(dl, 90)),
                       jump_abs_p50=float(np.median(np.abs(fj))), jump_abs_max=float(np.abs(fj).max()))
        out.append(row)
    return out


def fmt(rs):
    lines = ["| 设定 | 组 | 条数 | 误差最大 中位/最大 (°) | 末值绝对 中位/最大 (°) | 有永久台阶的条数 / 台阶数 | 最大穿透 mm | 入齿次数 / 开车前未落座 | 入齿延迟 p50/p90 s | 入齿跳变 中位/最大 (°) |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for r in rs:
        e = (f'{r["engagements"]} / {r["not_seated"]} | {r["delay_p50"]:.2f}/{r["delay_p90"]:.2f} | '
             f'{r["jump_abs_p50"]:.2f}/{r["jump_abs_max"]:.2f}') if "engagements" in r else "– | – | –"
        lines.append(f'| {r["settings"]} | {r["group"]} | {r["n"]} | {r["err_max_med"]:.2f} / {r["err_max_max"]:.2f} | '
                     f'{r["err_end_med"]:.2f} / {r["err_end_max"]:.2f} | {r["runs_with_skips"]} / {r["skips"]} | '
                     f'{r["pen_max_mm"]:.2f} | {e} |')
    return "\n".join(lines)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("results")
    ap.add_argument("--tag")
    ap.add_argument("--routes", action="store_true")
    a = ap.parse_args()
    print(fmt(table(json.load(open(a.results)), a.tag, a.routes)))

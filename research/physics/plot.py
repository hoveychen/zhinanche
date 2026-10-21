"""Figures for REPORT.md from batch.py results.

    uv run --with numpy --with matplotlib python plot.py out/results-cad.json --out figs
"""

import argparse
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from summarize import label  # noqa: E402

C = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"]  # categorical, fixed order
INK, MUTED, GRID = "#1f1f1e", "#6b6a63", "#e4e3dc"
W = "friction=0.1,latch=True"
BEST = "chamfer=0.04,friction=0.1,latch=True,ridge=['small.L', 'small.R', 'big']"  # chamfer capped at 0.027 by the 0.06 tip
plt.rcParams.update({"font.size": 9, "axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": MUTED,
                     "ytick.color": MUTED, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6,
                     "axes.spines.top": False, "axes.spines.right": False, "lines.linewidth": 1.6,
                     "font.family": ["PingFang SC", "Heiti SC", "Arial Unicode MS", "sans-serif"]})


def runs(db):
    out = {}
    for r in db["runs"]:
        if "metrics" in r:
            out[(r["tag"], label(r["settings"]), r["key"])] = r["metrics"]
    return out


def curves(m):
    return np.load(m["curves"])


def find(R, key, setting):
    for (tg, st, k), m in R.items():
        if k == key and st == setting:
            return m
    return None


def err_vs_dist(R, out):
    panels = [("差动式（任意开法）", "differential:any", ["straight", "circle", "sCurve", "figureEight", "spinLeft", "drawing"], "base"),
              ("宋史式 绕内轮转 · 基线（摩擦 0.4，靠重量压下）", "song:pivot", ["pivotLeft", "pivotSquare", "pivotZigzag", "drawing"], "base"),
              ("宋史式 绕内轮转 · 上油 0.1 + 插销 + 屋脊齿 + 倒角", "song:pivot", ["pivotLeft", "pivotSquare", "pivotZigzag", "drawing"], BEST),
              ("宋史式 普通转弯 · 基线", "song:normal", ["spinLeft", "circle", "sCurve", "figureEight", "drawing"], "base"),
              ("宋史式 普通转弯 · 上油 0.1 + 插销 + 屋脊齿 + 倒角", "song:normal", ["spinLeft", "circle", "sCurve", "figureEight", "drawing"], BEST)]
    fig, axs = plt.subplots(len(panels), 1, figsize=(8, 2.3 * len(panels)), constrained_layout=True)
    for ax, (title, grp, names, st) in zip(axs, panels):
        for i, n in enumerate(names):
            m = find(R, f"{grp}:{n}", st)
            if m is None:
                continue
            c = curves(m)
            ax.plot(c["dist"], c["err"], color=C[i % len(C)], label=n)
        ax.axhline(0, color=MUTED, lw=0.8)
        ax.set_title(title, loc="left", fontsize=9, color=INK)
        ax.set_ylabel("物理 − 运动学 (°)")
        ax.legend(loc="upper left", fontsize=7, frameon=False, ncol=len(names))
    axs[-1].set_xlabel("行程（两轮平均滚过的距离，尺）")
    fig.savefig(os.path.join(out, "err_vs_dist.png"), dpi=160)


def phys_vs_kin(R, out):
    cases = [("差动式 drawing", "differential:any:drawing", "base"),
             ("宋史式 绕内轮转 pivotSquare · 基线", "song:pivot:pivotSquare", "base"),
             ("宋史式 绕内轮转 pivotSquare · 改进齿形", "song:pivot:pivotSquare", BEST),
             ("宋史式 普通转弯 circle · 基线", "song:normal:circle", "base"),
             ("宋史式 普通转弯 circle · 改进齿形", "song:normal:circle", BEST)]
    fig, axs = plt.subplots(len(cases), 1, figsize=(8, 2.2 * len(cases)), constrained_layout=True)
    for ax, (title, key, st) in zip(axs, cases):
        m = find(R, key, st)
        if m is None:
            continue
        c = curves(m)
        ax.plot(c["dist"], c["dev_kin"], color=C[0], label="运动学（js/sim）")
        ax.plot(c["dist"], c["dev_phys"], color=C[1], lw=1.2, label="物理（MuJoCo，齿接触）")
        ax.set_title(title, loc="left", fontsize=9, color=INK)
        ax.set_ylabel("木人偏离正南 (°)")
        ax.set_ylim(-185, 185)
        ax.legend(loc="upper left", fontsize=7, frameon=False, ncol=2)
    axs[-1].set_xlabel("行程（尺）")
    fig.savefig(os.path.join(out, "phys_vs_kin.png"), dpi=160)


def engagements(R, out):
    sets = [("base", "基线"), (W, "上油+插销"), ("chamfer=0.04,friction=0.1,latch=True", "上油+插销+倒角 0.027"),
            (BEST, "上油+插销+倒角+屋脊齿")]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9, 3.2), constrained_layout=True)
    bins_d = np.linspace(0, 3, 31)
    bins_j = np.linspace(-8, 8, 33)
    for i, (st, name) in enumerate(sets):
        eng = [e for (tg, s, k), m in R.items() if s == st and k.startswith("song") for e in m.get("engage_list", [])]
        if not eng:
            continue
        dl = np.clip([e["delay"] if np.isfinite(e["delay"]) else 99 for e in eng], 0, 3)
        fj = np.clip([e["fig_jump"] for e in eng], -8, 8)
        a1.hist(dl, bins=bins_d, histtype="step", lw=1.6, color=C[i], label=f"{name}（{len(eng)} 次）")
        a2.hist(fj, bins=bins_j, histtype="step", lw=1.6, color=C[i], label=name)
    a1.set_xlabel("放下到落座的时间 (s)，3 s 处含没落座的")
    a1.set_ylabel("入齿次数")
    a1.axvline(0.85, color=MUTED, lw=0.8, ls="--")
    a1.text(0.87, a1.get_ylim()[1] * 0.9, "基线开车时刻", color=MUTED, fontsize=7)
    a2.set_xlabel("入齿前后木人的跳变 (°)，大平轮半齿 = 3.75°")
    a1.legend(fontsize=7, frameon=False)
    fig.savefig(os.path.join(out, "engagements.png"), dpi=160)


def sensitivity(db, out):
    from summarize import table
    rows = table(db)
    groups = [("differential:any", "差动式"), ("song:pivot", "宋史式 绕内轮"), ("song:normal", "宋史式 普通转弯")]
    order = []
    for r in rows:
        if (r["tag"], r["settings"]) not in order:
            order.append((r["tag"], r["settings"]))
    fig, axs = plt.subplots(1, 3, figsize=(11, 0.32 * len(order) + 1.2), sharey=True, constrained_layout=True)
    ylab = [f"{s}" for _, s in order]
    for ax, (g, name) in zip(axs, groups):
        for yi, (tg, st) in enumerate(order):
            rr = [r for r in rows if r["tag"] == tg and r["settings"] == st and r["group"].startswith(g + ":")]
            if not rr:
                continue
            med = np.median([r["err_end_med"] for r in rr])
            mx = max(r["err_end_max"] for r in rr)
            ax.plot([med, mx], [yi, yi], color=GRID, lw=2)
            ax.plot(med, yi, "o", color=C[0], ms=5)
            ax.plot(mx, yi, "o", color=C[1], ms=5)
        ax.set_xscale("symlog", linthresh=5)
        ax.set_title(name, loc="left", fontsize=9, color=INK)
        ax.set_xlabel("|末值误差| (°)  ●中位 ●最大")
    axs[0].set_yticks(range(len(order)), ylab, fontsize=7)
    axs[0].invert_yaxis()
    fig.savefig(os.path.join(out, "sensitivity.png"), dpi=160)


def lift(R, out):
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8, 4), sharex=True, constrained_layout=True)
    for i, (st, name) in enumerate([("base", "基线：摩擦 0.4，重量 + 50 N"), ("friction=0.0", "摩擦 0"), ("latch=True", "摩擦 0.4 + 插销"), (BEST, "改进齿形")]):
        m = find(R, "song:normal:circle", st)
        if m is None:
            continue
        c = curves(m)
        a1.plot(c["t"], c["liftR"] * 1000, color=C[i], label=name)
        a2.plot(c["t"], c["err"], color=C[i], label=name)
    a1.set_ylabel("右小平轮抬起 (mm)\n124 = 全抬起")
    a2.set_ylabel("物理 − 运动学 (°)")
    a2.set_xlabel("时间 (s)，宋史式普通转弯 circle")
    a1.legend(fontsize=7, frameon=False)
    fig.savefig(os.path.join(out, "lift.png"), dpi=160)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("results")
    ap.add_argument("--out", default="figs")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    db = json.load(open(a.results))
    R = runs(db)
    for f in (err_vs_dist, phys_vs_kin, engagements, lift):
        f(R, a.out)
    sensitivity(db, a.out)
    print("figures in", a.out)

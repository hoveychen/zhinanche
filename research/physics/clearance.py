"""Geometric check: do the block teeth clear each other when every gear turns at exactly
the ratio js/sim uses? No dynamics: gears are posed and MuJoCo's collision pass measures
the signed distance of every pair of touching geoms (negative = overlap).

  uv run --with mujoco python clearance.py [--root DIR] [--sweep]

Without --sweep: prints the worst overlap per meshing pair for the §6.3 teeth.
With --sweep: finds, for a range of tooth heights, the smallest backlash at which every
mesh of both chariots clears over a full tooth cycle, and writes out/clearance.json.
"""

import argparse
import json
import math
import os

import mujoco
import numpy as np

from model import CHI, Opts, build

HERE = os.path.dirname(os.path.abspath(__file__))


def poses(mechanism, n):
    """Joint-angle dicts covering the mesh cycles. Angles follow js/sim/chariot.js."""
    out = []
    rng = np.random.default_rng(1)
    if mechanism == "song":
        for side in ("R", "L"):
            for a in np.linspace(0, 2 * math.pi / 24 * 2, n):  # two foot pitches
                small = 2 * a if side == "R" else -2 * a
                big = -small / 4
                q = {"wheel.L": 0.0, "wheel.R": 0.0, "lift.L": 1, "lift.R": 1, "figure": big,
                     f"wheel.{side}": a, f"small.{side}": small, f"lift.{side}": 0}
                out.append(q)
    else:
        for _ in range(n * 2):
            a, b = rng.uniform(0, 2 * math.pi, 2)
            A, B = a, -b
            out.append({"wheel.L": a, "wheel.R": b, "sideA": A, "sideB": B, "figure": (A + B) / 2,
                        "pinion.0": A - B, "pinion.1": A - B})
        for a in np.linspace(0, 2 * math.pi / 18, n):  # straight: A = a, B = -a
            out.append({"wheel.L": a, "wheel.R": a, "sideA": a, "sideB": -a, "figure": 0.0,
                        "pinion.0": 2 * a, "pinion.1": 2 * a})
    return out


def worst(root, mechanism, opts, n=40, margin=0.03):
    xml, info = build(root, mechanism, opts)
    m = mujoco.MjModel.from_xml_string(xml)
    m.geom_margin[:] = margin
    m.geom_gap[:] = 0
    d = mujoco.MjData(m)
    names = [m.body(i).name for i in range(m.nbody)]
    res = {}
    for q in poses(mechanism, n):
        d.qpos[:] = 0
        for j, v in q.items():
            jj = m.joint(j)
            d.qpos[m.jnt_qposadr[jj.id]] = info["lift"] * v if j.startswith("lift") else v
        mujoco.mj_forward(m, d)
        for c in d.contact[: d.ncon]:
            k = "~".join(sorted((names[m.geom_bodyid[c.geom1]], names[m.geom_bodyid[c.geom2]])))
            g1, g2 = m.geom(c.geom1).name, m.geom(c.geom2).name
            kind = "rim" if (".rim" in g1 or ".rim" in g2) else "tooth"
            kk = f"{k} [{kind}]"
            if kk not in res or c.dist < res[kk]:
                res[kk] = c.dist
    return {k: v / CHI for k, v in sorted(res.items())}, info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.join(HERE, "..", ".."))
    ap.add_argument("--sweep", action="store_true")
    ap.add_argument("--out", default=os.path.join(HERE, "out", "clearance.json"))
    a = ap.parse_args()
    if not a.sweep:
        for mech in ("song", "differential"):
            r, info = worst(a.root, mech, Opts())
            print(mech)
            for k, v in r.items():
                print(f"  {k:28s} min distance {v:+.4f} chi")
        return
    table = []
    grid = np.round(np.arange(0.04, 0.905, 0.02), 3)
    for height in (1.0, 0.8, 0.64, 0.5):
        for thick in (0.2, 0.15):
            row = dict(height=height, thickness=thick, need={})
            for mech in ("song", "differential"):
                ok_from = {}
                for b in grid[::-1]:  # from loose to tight: the tightest backlash a pair still clears at
                    r, info = worst(a.root, mech, Opts(backlash=float(b), height=height, thickness=thick, tip_clear=0.03), n=24)
                    for k, v in r.items():
                        if v >= 0 and ok_from.get(k, 1.0) <= b + 0.021:
                            ok_from[k] = float(b)
                        elif v >= 0 and k not in ok_from:
                            ok_from[k] = float(b)
                row["need"][mech] = {k: v for k, v in ok_from.items() if "[tooth]" in k}
            print(json.dumps(row))
            table.append(row)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(table, open(a.out, "w"), indent=1)


if __name__ == "__main__":
    main()


# Pairs as (driver joint, driven joint, ratio driven/driver, gear keys that touch).
PAIRS = {
    "song": [("wheel.R", "small.R", 2.0, ("wheel.R", "small.R")),
             ("small.R", "figure", -0.25, ("small.R", "big"))],
    "differential": [("wheel.L", "sideA", 1.0, ("wheel.L", "sideA")),
                     ("wheel.R", "sideB", -1.0, ("wheel.R", "sideB")),
                     ("sideA", "pinion.0", 2.0, ("sideA", "pinion.0")),
                     ("sideB", "pinion.0", -2.0, ("sideB", "pinion.0"))],
}


def free_play(root, mechanism, opts, n=60, nd=81):
    """For each mesh: over a driver cycle, the interval of driven-angle offsets (rad, from
    the exact ratio) at which the pair does not overlap. Returns per pair the narrowest
    interval width and the extreme offsets, in units of the driven gear's tooth pitch."""
    xml, info = build(root, mechanism, opts)
    m = mujoco.MjModel.from_xml_string(xml)
    m.geom_margin[:] = 0
    m.geom_gap[:] = 0
    d = mujoco.MjData(m)
    names = [m.body(i).name for i in range(m.nbody)]
    teeth = info["teeth"]
    out = {}
    for drv, dvn, ratio, (b1, b2) in PAIRS[mechanism]:
        key_dvn = {"small.R": "small.R", "figure": "big", "sideA": "sideA", "sideB": "sideB", "pinion.0": "pinion.0"}[dvn]
        n_dvn = teeth[key_dvn]["n"]
        n_drv = teeth[{"wheel.R": "foot.R" if mechanism == "song" else "crown.R", "wheel.L": "crown.L",
                       "small.R": "small.R", "sideA": "ringA", "sideB": "ringB"}[drv]]["n"]
        pitch_dvn = 2 * math.pi / n_dvn
        widths, lo_all, hi_all = [], [], []
        for a in np.linspace(0, 2 * math.pi / n_drv, n, endpoint=False):
            ok = []
            for off in np.linspace(-0.5, 0.5, nd) * pitch_dvn:
                d.qpos[:] = 0
                if mechanism == "song":
                    d.qpos[m.jnt_qposadr[m.joint("lift.L").id]] = info["lift"]
                    d.qpos[m.jnt_qposadr[m.joint("lift.R").id]] = 0
                    if drv == "small.R":  # foot held where it fits; drive small, offset big
                        d.qpos[m.jnt_qposadr[m.joint("wheel.R").id]] = a / 2.0
                d.qpos[m.jnt_qposadr[m.joint(drv).id]] = a
                d.qpos[m.jnt_qposadr[m.joint(dvn).id]] = ratio * a + off
                mujoco.mj_forward(m, d)
                hit = False
                for c in d.contact[: d.ncon]:
                    k = {names[m.geom_bodyid[c.geom1]], names[m.geom_bodyid[c.geom2]]}
                    if k == {b1, b2} and c.dist < 0:
                        hit = True
                        break
                ok.append(not hit)
            ok = np.array(ok)
            offs = np.linspace(-0.5, 0.5, nd)
            # the clear interval containing (or nearest) zero
            if not ok.any():
                widths.append(0.0); lo_all.append(np.nan); hi_all.append(np.nan)
                continue
            i0 = nd // 2
            if not ok[i0]:
                idx = np.where(ok)[0]
                i0 = idx[np.argmin(np.abs(idx - nd // 2))]
            lo = i0
            while lo > 0 and ok[lo - 1]:
                lo -= 1
            hi = i0
            while hi < nd - 1 and ok[hi + 1]:
                hi += 1
            widths.append(offs[hi] - offs[lo]); lo_all.append(offs[lo]); hi_all.append(offs[hi])
        out[f"{b1}~{b2}"] = dict(min_width=float(np.min(widths)), max_width=float(np.max(widths)),
                                 lo_max=float(np.nanmax(lo_all)), hi_min=float(np.nanmin(hi_all)),
                                 step=float(1.0 / (nd - 1)))
    return out

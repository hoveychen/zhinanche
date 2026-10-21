"""Drive the MuJoCo gear train along one exported route and measure the figure.

The road wheels and the chassis heading are prescribed from the route (position and
velocity written every step); the figure's gear only turns because teeth push it.
Song: whenever the kinematic sim changes which small flat wheel is down, the wheels stop,
the old one is lifted, the new one is let down by its weight plus a push (Opts.clutch_push),
and only then does the chariot move on. In the kinematic sim the swap is instant and
the wheels don't move during it, so this changes nothing there.

The kinematic reference is recomputed from the very wheel angles that were applied, with
the ratios js/sim/chariot.js uses (and checked against js/sim's own figure angle at the
route's end), so the difference is purely what the teeth did.
"""

import math
import time

import mujoco
import numpy as np

from model import CHI, Opts, build

OMEGA_MAX = 2.0  # rad/s of a road wheel: 6 chi/s on a 6 chi wheel, the site's speed
SMOOTH = 0.15  # s, box filter applied twice to the wheel references
DWELL = dict(settle=0.35, raise_=0.3, lower=0.5, after=0.35)
REC_HZ = 100


def _segments(route):
    """Split steps into runs with one clutch state. state: 0 none, 1 left down, 2 right down."""
    cl, cr = np.array(route["clutchL"]), np.array(route["clutchR"])
    state = np.where(cl > 0, 1, np.where(cr > 0, 2, 0))
    return state


def schedule(route, mechanism, dt, opts=None):
    """Time-parameterise a route. Returns dict of arrays on the physics time grid."""
    wl, wr = np.asarray(route["wheelL"]), np.asarray(route["wheelR"])
    state = _segments(route) if mechanism == "song" else np.zeros(len(wl), int)
    # knots: (t, phiL, phiR); events: (t_start, t_end, side_up, side_down)
    t = 0.5  # rest first, so the smoothing starts from the true initial angles
    kt, kl, kr = [0.0, t], [wl[0], wl[0]], [wr[0], wr[0]]
    seg_state = []  # (t_from, t_to, state) of motion
    events = []
    cur = 0  # all small wheels start lifted
    i = 1
    n = len(wl)
    while i < n:
        s = state[i]
        if mechanism == "song" and s != cur:
            # dwell: stop, lift `cur`, lower `s`
            t0 = t
            t_raise = t0 + DWELL["settle"]
            t_lower = t_raise + (DWELL["raise_"] if cur else 0.0)
            lower = opts.dwell_lower if opts and opts.dwell_lower is not None else DWELL["lower"]
            t_end = t_lower + (lower if s else 0.0) + DWELL["after"]
            events.append(dict(t0=t0, t_raise=t_raise, t_lower=t_lower, t_end=t_end, up=cur, down=s, step=i))
            t = t_end
            kt.append(t); kl.append(kl[-1]); kr.append(kr[-1])
            cur = s
        j = i
        while j < n and state[j] == s:
            j += 1
        t_from = t
        for k in range(i, j):
            d = max(abs(wl[k] - wl[k - 1]), abs(wr[k] - wr[k - 1]))
            t += max(d / OMEGA_MAX, 1e-4)
            kt.append(t); kl.append(wl[k]); kr.append(wr[k])
        seg_state.append((t_from, t, s))
        i = j
    t_total = t + DWELL["settle"] + 0.5
    kt.append(t_total); kl.append(kl[-1]); kr.append(kr[-1])
    grid = np.arange(0.0, t_total, dt)
    pl = np.interp(grid, kt, kl)
    pr = np.interp(grid, kt, kr)
    w = max(1, int(round(SMOOTH / dt)))

    def box(x):
        pad = np.concatenate([np.full(w, x[0]), x, np.full(w, x[-1])])
        c = np.cumsum(np.concatenate([[0.0], pad]))
        y = (c[w:] - c[:-w]) / w
        return y[w // 2: w // 2 + len(x)]

    pl, pr = box(box(pl)), box(box(pr))
    vl, vr = np.gradient(pl, dt), np.gradient(pr, dt)
    engaged = np.zeros(len(grid), int)
    for (a, b, s) in seg_state:
        engaged[(grid >= a - 2 * SMOOTH) & (grid <= b + 2 * SMOOTH)] = s
    return dict(t=grid, pl=pl, pr=pr, vl=vl, vr=vr, engaged=engaged, events=events)


def kinematic_figure(sch, info):
    """Figure angle relative to the body from the applied wheel angles (js/sim ratios)."""
    pl, pr = sch["pl"], sch["pr"]
    if info["mechanism"] == "differential":
        k = info["inputRatio"]
        return k * (pl - pl[0]) / 2 - k * (pr - pr[0]) / 2
    r = info["ratio"]
    dl, dr = np.diff(pl, prepend=pl[0]), np.diff(pr, prepend=pr[0])
    e = sch["engaged"]
    # chariot.js: right down: dBig = -dPhiR * foot / big; left down: dBig = +dPhiL * foot / big
    d = np.where(e == 2, -dr * r["foot"] / r["big"], np.where(e == 1, dl * r["foot"] / r["big"], 0.0))
    return np.cumsum(d)


def run(route, mechanism, root, opts=None, record_video=None, max_time=None, verbose=False):
    opts = opts or Opts()
    xml, info = build(root, mechanism, opts)
    m = mujoco.MjModel.from_xml_string(xml)
    d = mujoco.MjData(m)
    dt = m.opt.timestep
    sch = schedule(route, mechanism, dt, opts)
    if max_time:
        for k in ("t", "pl", "pr", "vl", "vr", "engaged"):
            sch[k] = sch[k][: int(max_time / dt)]
    fig_kin = kinematic_figure(sch, info)
    R, TR = info["wheel_r"], info["track"]
    heading = R * (sch["pl"] - sch["pl"][0] - (sch["pr"] - sch["pr"][0])) * -1 / TR  # (phiR - phiL) R / track
    vhead = R * (sch["vr"] - sch["vl"]) / TR

    def jid(name):
        return m.joint(name).id

    jh, jl, jr, jf = jid("heading"), jid("wheel.L"), jid("wheel.R"), jid("figure")
    qa = {k: m.jnt_qposadr[v] for k, v in (("h", jh), ("l", jl), ("r", jr), ("f", jf))}
    va = {k: m.jnt_dofadr[v] for k, v in (("h", jh), ("l", jl), ("r", jr), ("f", jf))}
    lift = {}
    if mechanism == "song":
        for s in ("L", "R"):
            j = jid(f"lift.{s}")
            lift[s] = (m.jnt_qposadr[j], m.jnt_dofadr[j])
            d.qpos[lift[s][0]] = info["lift"]
        small_mass = {s: m.body_subtreemass[m.body(f"small.{s}").id] for s in ("L", "R")}
    body_of_geom = m.geom_bodyid
    names = [m.body(i).name for i in range(m.nbody)]
    mesh_pairs = {tuple(sorted(p)) for p in info["mesh_pairs"]}
    # target lift state per side over time
    events = sch["events"]
    down = {"L": False, "R": False}
    seated = {"L": False, "R": False}  # down and once fully home (for Opts.latch)

    nrec = max(1, int(round(1.0 / (REC_HZ * dt))))
    rec = {k: [] for k in ("t", "fig", "fig_kin", "head", "pl", "pr", "liftL", "liftR", "tqL", "tqR", "pen", "ncon")}
    unintended = {}
    pen_max = 0.0
    pen_where = None
    tq_max = 0.0
    ev_i = 0
    n = len(sch["t"])
    tq_acc = [0.0, 0.0]
    pen_acc = 0.0
    wall = time.time()
    frames = []
    renderer = None
    if record_video:
        renderer = mujoco.Renderer(m, 480, 640)
    for i in range(n):
        tt = sch["t"][i]
        # clutch commands
        while ev_i < len(events) and tt >= events[ev_i]["t_raise"]:
            ev = events[ev_i]
            if ev["up"]:
                down["L" if ev["up"] == 1 else "R"] = False
                seated["L" if ev["up"] == 1 else "R"] = False
            if tt >= ev["t_lower"]:
                if ev["down"]:
                    down["L" if ev["down"] == 1 else "R"] = True
                ev_i += 1
            else:
                break
        d.qpos[qa["h"]] = heading[i]
        d.qvel[va["h"]] = vhead[i]
        d.qpos[qa["l"]] = sch["pl"][i]
        d.qvel[va["l"]] = sch["vl"][i]
        d.qpos[qa["r"]] = sch["pr"][i]
        d.qvel[va["r"]] = sch["vr"][i]
        if mechanism == "song":
            for s in ("L", "R"):
                qa_, va_ = lift[s]
                if down[s]:
                    if d.qpos[qa_] < 0.002:
                        seated[s] = True
                    if opts.latch and seated[s]:  # pinned at its working height: no force can lift it
                        d.qpos[qa_], d.qvel[va_] = 0.0, 0.0
                        d.qfrc_applied[va_] = 0.0
                        continue
                    f = -opts.clutch_push
                else:
                    f = small_mass[s] * 9.81 + 4000 * (info["lift"] - d.qpos[qa_]) - 300 * d.qvel[va_]
                    f = min(max(f, 0.0), 3000.0)
                d.qfrc_applied[va_] = f
        mujoco.mj_step(m, d)
        # contacts
        for c in d.contact[: d.ncon]:
            if c.dist < 0:
                b1, b2 = names[body_of_geom[c.geom1]], names[body_of_geom[c.geom2]]
                key = tuple(sorted((b1, b2)))
                if key not in mesh_pairs:
                    if c.dist < -1e-4:
                        u = unintended.setdefault(key, [0, 0.0, tt])
                        u[0] += 1
                        u[1] = max(u[1], -c.dist)
                if -c.dist > pen_acc:
                    pen_acc = -c.dist
                if -c.dist > pen_max:
                    pen_max = -c.dist
                    pen_where = (m.geom(c.geom1).name, m.geom(c.geom2).name, tt)
        tql, tqr = d.qfrc_constraint[va["l"]], d.qfrc_constraint[va["r"]]
        tq_acc[0] = max(tq_acc[0], abs(tql))
        tq_acc[1] = max(tq_acc[1], abs(tqr))
        if i % nrec == 0:
            rec["t"].append(tt)
            rec["fig"].append(d.qpos[qa["f"]])
            rec["fig_kin"].append(fig_kin[i])
            rec["head"].append(heading[i])
            rec["pl"].append(sch["pl"][i])
            rec["pr"].append(sch["pr"][i])
            rec["liftL"].append(d.qpos[lift["L"][0]] if lift else 0.0)
            rec["liftR"].append(d.qpos[lift["R"][0]] if lift else 0.0)
            rec["tqL"].append(tq_acc[0])
            rec["tqR"].append(tq_acc[1])
            rec["pen"].append(pen_acc)
            rec["ncon"].append(d.ncon)
            tq_max = max(tq_max, *tq_acc)
            tq_acc = [0.0, 0.0]
            pen_acc = 0.0
            if renderer is not None and len(rec["t"]) % record_video.get("every", 4) == 0 and tt < record_video.get("until", 1e9):
                renderer.update_scene(d, camera=record_video.get("camera", -1))
                frames.append(renderer.render())
        if not np.all(np.isfinite(d.qpos)):
            raise RuntimeError(f"simulation blew up at t={tt:.3f}")
    out = {k: np.asarray(v) for k, v in rec.items()}
    out["events"] = events
    out["info"] = info
    out["wall"] = time.time() - wall
    out["sim_time"] = float(sch["t"][-1]) if n else 0.0
    out["pen_max_m"] = pen_max
    out["pen_where"] = pen_where
    out["unintended"] = {f"{a}~{b}": v for (a, b), v in unintended.items()}
    out["frames"] = frames
    out["js_fig_end"] = route["figureRel"][-1]
    return out


def metrics(res, route=None):
    """Numbers for one run, angles in degrees."""
    info = res["info"]
    fig, kin, head, t = res["fig"], res["fig_kin"], res["head"], res["t"]
    err = np.degrees(fig - kin)
    dev_phys = np.degrees(np.angle(np.exp(1j * (head + fig))))
    dev_kin = np.degrees(np.angle(np.exp(1j * (head + kin))))
    out = dict(
        sim_time=res["sim_time"], wall=res["wall"],
        err_max=float(np.max(np.abs(err))), err_end=float(err[-1]), err_rms=float(np.sqrt(np.mean(err ** 2))),
        dev_phys_max=float(np.max(np.abs(dev_phys))), dev_phys_end=float(dev_phys[-1]),
        dev_kin_max=float(np.max(np.abs(dev_kin))), dev_kin_end=float(dev_kin[-1]),
        kin_vs_js_end=float(np.degrees(kin[-1] - res["js_fig_end"])),
        pen_max_mm=res["pen_max_m"] * 1000, pen_where=res["pen_where"],
        torque_max=float(np.max(res["tqL"]) if len(res["tqL"]) else 0), torque_max_R=float(np.max(res["tqR"]) if len(res["tqR"]) else 0),
        unintended=res["unintended"],
    )
    # jumps: the largest change of the error within 0.2 s (rattle and skips alike)
    if info["mechanism"] == "song":
        pitch = 360.0 / info["ratio"]["big"]
    else:
        pitch = 360.0 / info["teeth"]["sideB"]["n"] / 2
    lag = max(1, int(0.2 * REC_HZ))
    jumps = np.abs(err[lag:] - err[:-lag])
    out["jump_max"] = float(jumps.max()) if len(jumps) else 0.0
    out["fig_pitch_deg"] = pitch
    # skips: a lasting step. The error's 1 s running median is compared with itself 1 s
    # later; a step of more than 3/4 of the figure-side pitch that is still there 3 s on
    # counts once. Rattle inside the backlash comes back, and its swing (crossing the
    # backlash from one flank to the other) stays under that.
    w = REC_HZ
    if len(err) > 4 * w:
        med = np.array([np.median(err[max(0, i - w // 2): i + w // 2 + 1]) for i in range(len(err))])
        step = med[w:] - med[:-w]
        skips, i = [], 0
        while i < len(step):
            if abs(step[i]) > 0.75 * pitch:
                j = min(i + 3 * w, len(med) - 1)
                if abs(med[j] - med[i]) > 0.75 * pitch:
                    skips.append((float(t[i + w // 2]), float(med[j] - med[i])))
                i += 2 * w
            else:
                i += 1
        out["skips"] = len(skips)
        out["skip_list"] = skips
    else:
        out["skips"], out["skip_list"] = 0, []
    # clutch engagements
    eng = []
    if info["mechanism"] == "song":
        for ev in res["events"]:
            if not ev["down"]:
                continue
            side = "L" if ev["down"] == 1 else "R"
            lf = res["lift" + side]
            i0 = np.searchsorted(t, ev["t_lower"])
            i1 = np.searchsorted(t, ev["t_end"])
            seated = np.where(lf[i0:] < 0.002)[0]
            delay = float(t[i0 + seated[0]] - t[i0]) if len(seated) else float("inf")
            ok_before_move = bool(len(seated) and i0 + seated[0] < i1)
            jump = float(err[min(i1, len(err) - 1)] - err[max(i0 - 1, 0)])
            eng.append(dict(t=ev["t_lower"], side=side, delay=delay, seated_before_move=ok_before_move, fig_jump=jump))
        out["engagements"] = len(eng)
        if eng:
            dl = np.array([e["delay"] for e in eng])
            out["engage_not_seated"] = int(sum(not e["seated_before_move"] for e in eng))
            out["engage_never"] = int(np.sum(~np.isfinite(dl)))
            fin = dl[np.isfinite(dl)]
            out["engage_delay_max"] = float(fin.max()) if len(fin) else float("inf")
            js = np.array([e["fig_jump"] for e in eng])
            out["engage_jump_maxabs"] = float(np.abs(js).max())
            out["engage_jump_mean"] = float(js.mean())
            out["engage_jump_rms"] = float(np.sqrt(np.mean(js ** 2)))
        out["engage_list"] = eng
    return out, err, dev_phys, dev_kin

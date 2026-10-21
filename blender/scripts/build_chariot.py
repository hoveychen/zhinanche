"""Build the south-pointing chariot GLBs from params/chariot.json.

  blender --background --factory-startup --python-exit-code 1 --python build_chariot.py -- \
      [--mechanism differential|song|all] [--out PATH] [--blend PATH]

Without --mechanism (or with "all") both files are written to assets/chariot-<m>.glb.
Node names and extras follow docs/model-contract.md; the gear layout and the running
gear's positions are lib/layout.py (dimensions in params "gear", "wheel", "body") and are
explained in docs/model-notes.md and design/decisions/0005-cad-level-chariot.md.
Blender frame: +X forward, +Y left, +Z up, 1 unit = 1 chi; the glTF exporter turns it
into Y-up with -Z = left.
"""

import math
import os
import sys
import time

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from lib import layout as lay  # noqa: E402
from lib.mesh import MB, empty, set_lift, set_rotate, set_teach  # noqa: E402

ASSETS = os.path.join(lay.ROOT, "assets")

BOARD_T = 0.08
POLE_Z = 3.35          # the pole lies over the axle (輈當兔) and under the box floor
SILL_Y = (1.62, 1.97)  # the two sills (軫) under the body, inside the hubs
SILL_Z = (3.5, 3.85)

SHELL_EXPLODE = {
    "body.side.L": (0, 5.5, 0), "body.side.R": (0, -5.5, 0),
    "body.end.F": (4.0, 0, 0), "body.end.B": (-4.0, 0, 0),
    "body.deck": (0, 0, 4.5), "body.tier": (0, 0, 5.5), "body.top": (0, 0, 6.5),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "NONE"
    return sc


def W(L, key):
    return L.raw["wheel"][key]["v"]


def B(L, key):
    return L.raw["body"][key]["v"]


def G(L, key):
    return L.raw["gear"][key]["v"]


# --------------------------------------------------------------------------- gears


def tooth_block(mb, g, k, mat):
    """One block tooth of gear g: a bar of the tooth's section, tapered towards the tip."""
    t = g.tooth
    p0, p1 = g.teeth()[k]
    ang = g.phase + k * g.pitch
    if g.kind == "radial":
        # straight through the rim, then tapered beyond it
        pr = g.point(ang, g.rim_outer)
        mb.bar(p0, (t.root_w, t.thick), pr, (t.root_w, t.thick), mat, up=g.axis)
        mb.bar(pr, (t.root_w, t.thick), p1, (t.tip_w, t.thick * 0.85), mat, up=g.axis)
    else:
        if abs(g.h0 + t.add) < 1e-9:   # the tip is at h0 (teeth pointing to -axis): taper the other way
            p0, p1 = p1, p0
        mb.bar(p0, (t.root_w, t.thick), p1, (t.tip_w, t.thick * 0.8), mat, up=g.dir(ang))


def rim(mb, g, t, mat, segments, hole=None):
    """A gear's rim (or a solid disc, hole=None and rim_inner ignored): segments joints."""
    r_in = g.rim_inner if hole is None else hole
    prof = [(r_in, -t / 2), (g.rim_outer, -t / 2), (g.rim_outer, t / 2), (r_in, t / 2)]
    n = max(24, min(72, g.n * 2))
    n -= n % segments
    mb.revolve(g.center, g.axis, prof, mat, n=n, ref=g.u, phase=g.phase + g.pitch / 2, seam_every=n // segments, seam=0.004)


def arms(mb, g, k, r0, r1, w, t, mat, through=False):
    """k spokes (or k through-spokes, 2k arms) from radius r0 to r1 in the gear plane."""
    for i in range(k):
        ang = g.phase + g.pitch / 2 + 2 * math.pi * i / (k if not through else 2 * k)
        p1 = g.point(ang, r1)
        p0 = g.point(ang + math.pi, r1) if through else g.point(ang, r0)
        mb.bar(p0, (w, t), p1, (w, t), mat, up=g.axis)


def gear_node(g, parent, label, explode, body, extra=None):
    """A gear node at g.center: `body(mb)` builds the wheel, then the teeth; tooth 0 is the red marker child."""
    mb = MB()
    body(mb)
    if extra:
        extra(mb)
    marker = MB()
    for k in range(g.n):
        tooth_block(marker if k == 0 else mb, g, k, "marker" if k == 0 else "peg")
    obj = mb.build(g.name, g.center, parent)
    set_teach(obj, "gear", label, explode, g.n)
    m = marker.build(g.name + ".marker", g.center, obj)
    set_teach(m, "gear", label + "上的记号")
    return obj


def spoked_wheel(L, g, mat, k_arms, hub_r, hub_t, segments, through=False):
    """Rim, arms and a round hub: the foot gears and crown wheels."""
    t = L.rim_t

    def body(mb):
        rim(mb, g, t, mat, segments)
        arms(mb, g, k_arms, hub_r - 0.02, g.rim_inner + 0.03, 0.14, t, mat, through)
        mb.revolve(g.center, g.axis, [(hub_r - 0.12, -hub_t / 2), (hub_r, -hub_t / 2), (hub_r, hub_t / 2), (hub_r - 0.12, hub_t / 2)], "wood_dark", n=14, ref=g.u)

    return body


def flat_wheel(L, g, mat, hub_sq, hub_t, segments):
    """A big horizontal wheel: rim in segments, through-spokes, a square hub round the squared shaft."""
    t = L.rim_t

    def body(mb):
        rim(mb, g, t, mat, segments)
        arms(mb, g, G(L, "bigSpokes"), 0, g.rim_inner + 0.03, 0.18, t, mat, through=True)
        c = g.center
        h = hub_sq / 2
        mb.box((c[0] - h, c[1] - h, c[2] - hub_t / 2), (c[0] + h, c[1] + h, c[2] + hub_t / 2), "wood_dark")

    return body


def disc_wheel(L, g, mat, t, hole):
    """A thick plank disc (the small flat wheels, the right crown and side gears)."""

    def body(mb):
        rim(mb, g, t, mat, 1, hole=hole)

    return body


# --------------------------------------------------------------------------- wheels and axle


def wheel(L, side, parent):
    """A road wheel: 30 spokes in two parts, a felloe of hollow section in 15 joints, a long
    waisted hub with iron bands and bore sleeves. Red lacquer (赤質); spoke 0 is the marker."""
    sy = 1 if side == "L" else -1
    R = L.wheel_r
    c = (0.0, sy * L.felloe_y, L.axle_z)       # the felloe's middle plane
    ax = (0.0, sy, 0.0)
    mb = MB()
    # felloe: hollow (腰鼓) section, inner face narrow, waist widest, tread narrower again
    fh, wi, wm, wt = W(L, "felloeHeight"), W(L, "felloeInnerWidth"), W(L, "felloeMidWidth"), W(L, "felloeTreadWidth")
    prof = [(R - fh, -wi / 2), (R - fh * 0.66, -wm / 2), (R - fh * 0.33, -wm / 2), (R, -wt / 2),
            (R, wt / 2), (R - fh * 0.33, wm / 2), (R - fh * 0.66, wm / 2), (R - fh, wi / 2)]
    segs = W(L, "felloeSegments")
    n = 4 * segs
    mb.revolve(c, ax, prof, "wheel", n=n, ref=(0, 0, 1), phase=-math.pi / segs / 2, seam_every=n // segs, seam=0.004)
    # hub: waisted, thickest at the spoke ring, on the hub's own axis; ends and bore from params
    hub = MB()
    d_max, d_in, d_out = W(L, "hubDiameterMax"), W(L, "hubDiameterInner"), W(L, "hubDiameterOuter")
    a0, a1 = L.hub_y0 - L.felloe_y, L.hub_y1 - L.felloe_y     # along the axis from c (outward positive)
    s = L.spoke_y - L.felloe_y
    r_out = [(d_in / 2, a0), (d_max / 2 * 0.98, (a0 + s) / 2), (d_max / 2, s), (d_max / 2 * 0.94, s + 0.36),
             (d_max / 2 * 0.82, s + 0.76), (d_max / 2 * 0.66, s + 1.16), (d_out / 2, a1)]
    bore = [(L.bore_out, a1), (L.bore_in, a0)]
    hub.revolve(c, ax, r_out + bore, "wood_dark", n=16, ref=(0, 0, 1))
    # iron bands either side of the spokes (圈以鐵) and raised rings (篆) on the outer part
    half_w = W(L, "spokeStockWidth") / 2
    for a, r in ((s - half_w - 0.1, d_max / 2 * 0.985), (s + half_w + 0.1, d_max / 2 * 0.98)):
        hub.revolve(c, ax, [(r - 0.05, a - 0.045), (r + 0.02, a - 0.045), (r + 0.02, a + 0.045), (r - 0.05, a + 0.045)], "iron", n=16, ref=(0, 0, 1))
    for i in range(W(L, "hubRidges")):
        a = s + 0.55 + 0.33 * i
        r = d_max / 2 * (0.9 - 0.11 * i)
        hub.revolve(c, ax, [(r - 0.04, a - 0.035), (r + 0.015, a - 0.035), (r + 0.015, a + 0.035), (r - 0.04, a + 0.035)], "wood_dark", n=16, ref=(0, 0, 1))
    # bore sleeves (釭) showing at both ends
    hub.revolve(c, ax, [(L.bore_in - 0.01, a0 - 0.03), (L.bore_in + 0.08, a0 - 0.03), (L.bore_in + 0.08, a0 + 0.04), (L.bore_in - 0.01, a0 + 0.04)], "iron", n=12, ref=(0, 0, 1))
    hub.revolve(c, ax, [(L.bore_out - 0.01, a1 - 0.04), (L.bore_out + 0.07, a1 - 0.04), (L.bore_out + 0.07, a1 + 0.03), (L.bore_out - 0.01, a1 + 0.03)], "iron", n=12, ref=(0, 0, 1))
    # spokes: the stock (股) flat and wide, the shank (骹) round; they lean outward by the dish
    n_sp = W(L, "spokes")
    sw0, sw1, st, shd = W(L, "spokeStockWidth"), W(L, "spokeStockWidthOuter"), W(L, "spokeStockThick"), W(L, "spokeShankDiameter")
    frac = W(L, "spokeStockFraction")
    r_hub = d_max / 2 - 0.08          # the tenon (菑) starts inside the hub
    r_tip = R - fh + 0.06             # the tenon (蚤) ends inside the felloe
    marker = MB()
    for k in range(n_sp):
        a = 2 * math.pi * k / n_sp
        d = (math.sin(a), 0.0, math.cos(a))

        def at(r, y):
            return (c[0] + d[0] * r, y, c[2] + d[2] * r)

        y_in, y_out = c[1] - sy * L.dish, c[1]
        yy = lambda r: y_in + (y_out - y_in) * (r - r_hub) / (r_tip - r_hub)  # noqa: E731
        r_mid = r_hub + (r_tip - r_hub) * frac
        tgt = marker if k == 0 else mb
        mat = "mark" if k == 0 else "wheel"
        tgt.bar(at(r_hub, yy(r_hub)), (sw0, st), at(r_mid, yy(r_mid)), (sw1, st), mat, up=d, chamfer=0.02)
        tgt.bar(at(r_mid, yy(r_mid)), (sw1, st), at(r_mid + 0.12, yy(r_mid + 0.12)), (shd, shd), mat, up=d, chamfer=0.03)
        tgt.bar(at(r_mid + 0.12, yy(r_mid + 0.12)), (shd, shd), at(r_tip, yy(r_tip)), (shd * 0.9, shd * 0.9), mat, up=d, chamfer=0.045)
    # the hub goes in the same node (it turns with the wheel)
    base = len(mb.verts)
    mb.verts += hub.verts
    for f, m in zip(hub.faces, hub.fmat):
        mb.faces.append([base + i for i in f])
        mb.fmat.append(mb._mi(hub.mats[m]))
    obj = mb.build(f"wheel.{side}", c, parent)
    set_rotate(obj, f"wheel{side}", (0, 1, 0))
    set_teach(obj, "wheel", "左车轮" if side == "L" else "右车轮", (0, sy * 3.4, 0))
    m = marker.build(f"wheel.{side}.marker", c, obj)
    set_teach(m, "wheel", ("左车轮" if side == "L" else "右车轮") + "的记号辐条")
    return obj


def axle_end(mb, L, sy, y_from):
    """The axle from y_from outward: tapering inside the hub, then the cap (軎) and linchpin (辖)."""
    z = L.axle_z
    ax = (0.0, sy, 0.0)
    c = (0.0, 0.0, z)
    # tapered arm inside the hub (bore_in -> bore_out), on the hub's axis
    mb.revolve(c, ax, [(0.02, abs(y_from)), (L.bore_in - 0.005, abs(y_from)), (L.bore_out - 0.005, L.hub_y1 + 0.005), (0.02, L.hub_y1 + 0.005)], "wood_dark", n=12, ref=(0, 0, 1))
    cb, cs, cl = W(L, "capDiameterBig") / 2, W(L, "capDiameterSmall") / 2, L.cap_len
    a0 = L.hub_y1 + 0.01
    prof = [(0.02, a0), (cb, a0), (cb * 0.9, a0 + cl * 0.4), (cs, a0 + cl), (0.02, a0 + cl)]
    mb.revolve(c, ax, prof, "iron", n=14, ref=(0, 0, 1))
    for i in range(3):   # the cap's raised rings (弦纹)
        a = a0 + cl * (0.15 + 0.22 * i)
        r = cb - (cb - cs) * (a - a0) / cl + 0.012
        mb.revolve(c, ax, [(r - 0.03, a - 0.012), (r, a - 0.012), (r, a + 0.012), (r - 0.03, a + 0.012)], "iron", n=14, ref=(0, 0, 1))
    ll, lw, lt = W(L, "linchpinLength"), W(L, "linchpinWidth"), W(L, "linchpinThick")
    yl = sy * (a0 + cl * 0.75)
    mb.box((-lt / 2, min(yl - lw / 2, yl + lw / 2), z - ll / 2), (lt / 2, max(yl - lw / 2, yl + lw / 2), z + ll * 0.42), "iron")
    mb.box((-lt, min(yl - lw / 2, yl + lw / 2) - 0.0, z + ll * 0.42), (lt, max(yl - lw / 2, yl + lw / 2), z + ll / 2), "iron")  # head


def futu(fr, L, sy):
    """伏兔: a block astride the axle under each sill, a half-round seat cut for the axle."""
    fl, fh, fw = W(L, "futuLength"), W(L, "futuHeight"), W(L, "futuWidth")
    y0, y1 = sorted((sy * (SILL_Y[1] - fw), sy * SILL_Y[1]))
    z0, z1 = SILL_Z[0] - fh, SILL_Z[0]
    gap = L.axle_r + 0.02
    fr.box((-fl / 2, y0, z0), (-gap, y1, z1), "wood")
    fr.box((gap, y0, z0), (fl / 2, y1, z1), "wood")
    fr.box((-gap, y0, L.axle_z + gap), (gap, y1, z1), "wood")
    # an iron strap over the axle seat
    fr.box((-gap - 0.1, y0 - 0.02, z0 + 0.1), (-gap, y1 + 0.02, z1), "iron")
    fr.box((gap, y0 - 0.02, z0 + 0.1), (gap + 0.1, y1 + 0.02, z1), "iron")


# --------------------------------------------------------------------------- body


def board_rects(u0, u1, w0, w1, holes):
    """Split rectangle [u0,u1]x[w0,w1] minus rectangular holes into rectangles."""
    us = sorted({u0, u1, *[min(max(h[i], u0), u1) for h in holes for i in (0, 1)]})
    ws = sorted({w0, w1, *[min(max(h[i], w0), w1) for h in holes for i in (2, 3)]})
    out = []
    for j in range(len(ws) - 1):
        run = None
        for i in range(len(us) - 1):
            cu, cw = (us[i] + us[i + 1]) / 2, (ws[j] + ws[j + 1]) / 2
            inside = any(h[0] < cu < h[1] and h[2] < cw < h[3] for h in holes)
            if inside:
                if run:
                    out.append(run)
                run = None
            elif run is None:
                run = [us[i], us[i + 1], ws[j], ws[j + 1]]
            else:
                run[1] = us[i + 1]
        if run:
            out.append(run)
    return out


def railing(mb, x0, x1, y0, y1, z0, h, step=0.9, post=0.08, mat="lacquer"):
    """勾闌: posts round a rectangle with a top and a middle rail."""
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    for i in range(4):
        (ax, ay), (bx, by) = corners[i], corners[(i + 1) % 4]
        length = math.hypot(bx - ax, by - ay)
        n = max(1, round(length / step))
        for k in range(n):
            t = k / n
            px, py = ax + (bx - ax) * t, ay + (by - ay) * t
            mb.box((px - post / 2, py - post / 2, z0), (px + post / 2, py + post / 2, z0 + h), mat)
        for zr, s in ((z0 + h - 0.035, 0.07), (z0 + h * 0.5, 0.05)):
            mb.beam((ax, ay, zr), (bx, by, zr), s, s, mat)


def lattice(mb, axis, u0, u1, w0, w1, depth0, depth1, step=0.85, bar=0.07, mat="eave"):
    """The painted grid of squares on a red panel (卤簿图): thin strips on the panel's face.
    axis 'y': panel in an x-z plane (u = x, w = z); 'x': panel in a y-z plane (u = y, w = z)."""
    nu, nw = max(1, round((u1 - u0) / step)), max(1, round((w1 - w0) / step))
    for i in range(nu + 1):
        u = u0 + (u1 - u0) * i / nu
        lo, hi = (u - bar / 2, w0), (u + bar / 2, w1)
        if axis == "y":
            mb.box((lo[0], depth0, lo[1]), (hi[0], depth1, hi[1]), mat)
        else:
            mb.box((depth0, lo[0], lo[1]), (depth1, hi[0], hi[1]), mat)
    for j in range(nw + 1):
        w = w0 + (w1 - w0) * j / nw
        if axis == "y":
            mb.box((u0, depth0, w - bar / 2), (u1, depth1, w + bar / 2), mat)
        else:
            mb.box((depth0, u0, w - bar / 2), (depth1, u1, w + bar / 2), mat)


def body(L, root, x0, x1, bx0, bx1, board_z0, side_holes, floor_holes, mid_posts, extra_frame=None):
    """Chassis and shell. x0..x1: the gear room between the wheels (half width L.gear_room_y);
    bx0..bx1: the red box over the wheels (half width boxWidth/2), from boxBottom up; the
    second tier (重台) with its pierced bracket band (鏤拱) and eaves, and the top platform
    with its railing (勾闌) and hanging pouches (香囊) round the figure's shaft."""
    s = L.shaft_x
    deck = L.deck_z
    gy = L.gear_room_y
    by = B(L, "boxWidth") / 2
    bz0, bz1 = B(L, "boxBottom"), B(L, "boxTop")
    # chassis frame: 伏兔 on the axle, two sills, cross members, posts, deck beams
    fr = MB()
    sy0, sy1 = SILL_Y
    sz0, sz1 = SILL_Z
    for sy in (1, -1):
        futu(fr, L, sy)
        fr.box((x0, min(sy * sy0, sy * sy1), sz0), (x1, max(sy * sy0, sy * sy1), sz1), "wood")
        fr.box((x0, min(sy * (gy - 0.2), sy * (gy - BOARD_T)), deck - 0.15), (x1, max(sy * (gy - 0.2), sy * (gy - BOARD_T)), deck), "wood")
        for px in (x0 + 0.1, x1 - 0.1, *mid_posts):
            yc = sy * (gy - 0.08 - BOARD_T)
            fr.box((px - 0.08, yc - 0.08, board_z0), (px + 0.08, yc + 0.08, deck - 0.15), "wood")
    for px0, px1 in ((x0, x0 + 0.25), (x1 - 0.25, x1)):
        fr.box((px0, -gy + BOARD_T, deck - 0.15), (px1, gy - BOARD_T, deck), "wood")
        fr.box((px0, -sy1, sz0), (px1, sy1, sz1), "wood")
    if extra_frame:
        extra_frame(fr)
    o = fr.build("body.frame", (0, 0, 0), root)
    set_teach(o, "chassis", "车架")

    # shell: the gear room's boards and, over the wheels, the red box
    for side, sy in (("L", 1), ("R", -1)):
        mb = MB()
        yb0, yb1 = sorted((sy * (gy - BOARD_T), sy * gy))
        for u0, u1, w0, w1 in board_rects(x0, x1, board_z0, bz0, side_holes):
            mb.box((u0, yb0, w0), (u1, yb1, w1), "wood")
        # the box wall, its floor strip over the wheel and the painted grid
        yw0, yw1 = sorted((sy * (by - BOARD_T), sy * by))
        mb.box((bx0, yw0, bz0), (bx1, yw1, bz1), "lacquer")
        yf0, yf1 = sorted((sy * gy, sy * (by - BOARD_T)))
        wheel_slot = (-L.wheel_r - 0.1, L.wheel_r + 0.1, L.felloe_y - 0.22, L.felloe_y + 0.22)
        holes = [(h[0], h[1], *tuple(sorted((sy * h[2], sy * h[3])))) for h in [*floor_holes, wheel_slot]]
        for u0, u1, w0, w1 in board_rects(bx0, bx1, yf0, yf1, holes):
            mb.box((u0, w0, bz0), (u1, w1, bz0 + 0.1), "wood")
        lattice(mb, "y", bx0 + 0.25, bx1 - 0.25, bz0 + 0.25, bz1 - 0.25, *sorted((sy * by, sy * (by + 0.05))))
        o = mb.build(f"body.side.{side}", (0, 0, 0), root)
        set_teach(o, "shell", "左侧车厢板" if side == "L" else "右侧车厢板", SHELL_EXPLODE[f"body.side.{side}"])
    pole_hole = [(-0.25, 0.25, POLE_Z - 0.22, POLE_Z + 0.22)]
    for name, xa, xb, bxa, bxb, holes, label in (("body.end.F", x1 - BOARD_T, x1, bx1 - BOARD_T, bx1, pole_hole, "前车厢板"),
                                                 ("body.end.B", x0, x0 + BOARD_T, bx0, bx0 + BOARD_T, [], "后车厢板")):
        mb = MB()
        for u0, u1, w0, w1 in board_rects(-gy, gy, board_z0, bz0, holes):
            mb.box((xa, u0, w0), (xb, u1, w1), "wood")
        mb.box((bxa, -by, bz0), (bxb, by, bz1), "lacquer")
        face = (bxb, bxb + 0.05) if name == "body.end.F" else (bxa - 0.05, bxa)
        lattice(mb, "x", -by + 0.25, by - 0.25, bz0 + 0.25, bz1 - 0.25, *face)
        for py in (-by, by):   # corner posts
            mb.box((min(bxa, bxb) - 0.06, py - 0.1, bz0 - 0.05), (max(bxa, bxb) + 0.06, py + 0.1, bz1), "lacquer")
        o = mb.build(name, (0, 0, 0), root)
        set_teach(o, "shell", label, SHELL_EXPLODE[name])

    # the gear room's ceiling: a plank deck inside the box
    mb = MB()
    for u0, u1, w0, w1 in board_rects(x0 - 0.05, x1 + 0.05, -gy - 0.05, gy + 0.05, [(s - 0.3, s + 0.3, -0.3, 0.3)]):
        mb.box((u0, w0, deck), (u1, w1, deck + 0.1), "wood")
    o = mb.build("body.deck", (0, 0, deck), root)
    set_teach(o, "shell", "齿轮室的顶板", SHELL_EXPLODE["body.deck"])

    # first eave, the second tier (重台) with a painted grid, the pierced bracket band (鏤拱), second eave
    e1 = 0.35
    tx0, tx1, ty = bx0 + 0.6, bx1 - 0.6, by - 0.65
    tz0, tz1 = bz1 + 0.3, bz1 + 2.7
    band0, band1 = tz1, tz1 + 0.5
    mb = MB()
    mb.frustum([(bx0 - e1, -by - e1, bz1), (bx1 + e1, -by - e1, bz1), (bx1 + e1, by + e1, bz1), (bx0 - e1, by + e1, bz1)],
               [(bx0 - 0.1, -by - 0.1, bz1 + 0.3), (bx1 + 0.1, -by - 0.1, bz1 + 0.3), (bx1 + 0.1, by + 0.1, bz1 + 0.3), (bx0 - 0.1, by + 0.1, bz1 + 0.3)], "eave")
    mb.box((tx0, -ty, tz0), (tx1, ty, tz1), "lacquer")
    for sy in (1, -1):
        lattice(mb, "y", tx0 + 0.25, tx1 - 0.25, tz0 + 0.25, tz1 - 0.25, *sorted((sy * ty, sy * (ty + 0.05))), step=0.75)
    lattice(mb, "x", -ty + 0.25, ty - 0.25, tz0 + 0.25, tz1 - 0.25, tx1, tx1 + 0.05, step=0.75)
    lattice(mb, "x", -ty + 0.25, ty - 0.25, tz0 + 0.25, tz1 - 0.25, tx0 - 0.05, tx0, step=0.75)
    # 鏤拱: a band of bracket blocks with openings between them, all round
    step = 0.6
    for sy in (1, -1):
        n = round((tx1 - tx0) / step)
        for i in range(n):
            x = tx0 + (tx1 - tx0) * (i + 0.5) / n
            mb.box((x - 0.14, min(sy * (ty - 0.1), sy * (ty + 0.25)), band0), (x + 0.14, max(sy * (ty - 0.1), sy * (ty + 0.25)), band1), "wood")
            mb.box((x - 0.24, min(sy * (ty - 0.1), sy * (ty + 0.3)), band1 - 0.14), (x + 0.24, max(sy * (ty - 0.1), sy * (ty + 0.3)), band1), "peg")
    for sx, x in ((1, tx1), (-1, tx0)):
        n = round(2 * ty / step)
        for i in range(n):
            y = -ty + 2 * ty * (i + 0.5) / n
            mb.box((min(x - sx * 0.1, x + sx * 0.25), y - 0.14, band0), (max(x - sx * 0.1, x + sx * 0.25), y + 0.14, band1), "wood")
            mb.box((min(x - sx * 0.1, x + sx * 0.3), y - 0.24, band1 - 0.14), (max(x - sx * 0.1, x + sx * 0.3), y + 0.24, band1), "peg")
    mb.box((tx0 - 0.1, -ty - 0.1, band0), (tx1 + 0.1, ty + 0.1, band0 + 0.08), "eave")   # the band's sill
    e2 = 0.45
    mb.frustum([(tx0 - e2, -ty - e2, band1), (tx1 + e2, -ty - e2, band1), (tx1 + e2, ty + e2, band1), (tx0 - e2, ty + e2, band1)],
               [(tx0 - 0.15, -ty - 0.15, band1 + 0.3), (tx1 + 0.15, -ty - 0.15, band1 + 0.3), (tx1 + 0.15, ty + 0.15, band1 + 0.3), (tx0 - 0.15, ty + 0.15, band1 + 0.3)], "eave")
    o = mb.build("body.tier", (s, 0, tz0), root)
    set_teach(o, "shell", "重台（上层箱体和镂拱）", SHELL_EXPLODE["body.tier"])

    # the top: a platform with its railing round the figure's shaft, pouches hung from the corners
    pz = band1 + 0.3
    mb = MB()
    px0, px1, py = tx0 - 0.15, tx1 + 0.15, ty + 0.15
    for u0, u1, w0, w1 in board_rects(px0, px1, -py, py, [(s - 0.3, s + 0.3, -0.3, 0.3)]):
        mb.box((u0, w0, pz), (u1, w1, pz + 0.1), "wood")
    railing(mb, px0 + 0.05, px1 - 0.05, -py + 0.05, py - 0.05, pz + 0.1, 0.7, step=0.7)
    for cx in (px0 + 0.1, px1 - 0.1):
        for cy in (-py + 0.1, py - 0.1):
            ox, oy = (1 if cx > s else -1), (1 if cy > 0 else -1)
            tip = (cx + ox * 0.55, cy + oy * 0.55, pz + 0.95)
            mb.cyl((cx, cy, pz + 0.1), tip, 0.03, "lacquer", n=6)
            mb.cyl(tip, (tip[0], tip[1], tip[2] - 0.28), 0.012, "rope", n=4)
            mb.ellipsoid((tip[0], tip[1], tip[2] - 0.42), (0.13, 0.13, 0.15), "robe", n=10, m=6)
            mb.cyl((tip[0], tip[1], tip[2] - 0.57), (tip[0], tip[1], tip[2] - 0.85), 0.035, "gold", n=6)
    o = mb.build("body.top", (s, 0, pz), root)
    set_teach(o, "shell", "顶上的平台和勾阑（仙人站在这里）", SHELL_EXPLODE["body.top"])
    return bz0


def pole(L, root, x_rear, x_box_front, crossbars):
    """The single pole (一轅): thick at the back, thinner at the neck, rising a little once it
    leaves the body; the yoke bar (衡, 轅端橫木) and a phoenix head (鳳首) at its end."""
    length = B(L, "poleLength")
    d0, d1 = B(L, "poleDiameterRear"), B(L, "poleDiameterNeck")
    rise = math.radians(B(L, "poleRise"))
    mb = MB()
    flat = x_box_front - x_rear
    front = length - flat
    x_end, z_end = x_box_front + front * math.cos(rise), POLE_Z + front * math.sin(rise)
    mb.bar((x_rear, 0, POLE_Z), (d0, d0), (x_box_front, 0, POLE_Z), (d0 * 0.86, d0 * 0.86), "wood", chamfer=0.06)
    mb.bar((x_box_front, 0, POLE_Z), (d0 * 0.86, d0 * 0.86), (x_end, 0, z_end), (d1, d1), "wood", chamfer=0.05)
    # the yoke bar across the pole's end, lashed on
    half = B(L, "crossbarLength") / 2
    rc = B(L, "crossbarDiameter") / 2
    xb = x_end - 0.45
    zb = z_end - (x_end - xb) * math.tan(rise) + d1 / 2 + rc * 0.8
    mb.cyl((xb, -half, zb), (xb, half, zb), rc, "wood", n=10, phase=math.pi / 10)
    mb.cyl((xb, -0.22, zb + 0.02), (xb, 0.22, zb + 0.02), rc + 0.03, "rope", n=10)
    for y in (-half + 0.3, half - 0.3):   # yoke pins
        mb.cyl((xb, y, zb - 0.6), (xb, y, zb + 0.25), 0.05, "wood_dark", n=6)
    # phoenix head: neck up and forward, head, beak, crest
    neck0 = (x_end - 0.1, 0, z_end)
    neck1 = (x_end + 0.45, 0, z_end + 0.55)
    mb.bar(neck0, (d1, d1), neck1, (0.16, 0.16), "lacquer", chamfer=0.04)
    mb.ellipsoid((x_end + 0.55, 0, z_end + 0.6), (0.24, 0.16, 0.17), "lacquer", n=12, m=6)
    mb.frustum([(x_end + 0.7, -0.06, z_end + 0.52), (x_end + 0.7, 0.06, z_end + 0.52), (x_end + 0.7, 0.06, z_end + 0.64), (x_end + 0.7, -0.06, z_end + 0.64)],
               [(x_end + 1.05, 0, z_end + 0.5)], "gold")
    mb.frustum([(x_end + 0.42, -0.03, z_end + 0.7), (x_end + 0.6, -0.03, z_end + 0.74), (x_end + 0.6, 0.03, z_end + 0.74), (x_end + 0.42, 0.03, z_end + 0.7)],
               [(x_end + 0.3, 0, z_end + 1.0)], "gold")
    for x, half_c, z in crossbars:
        mb.beam((x, -half_c, z), (x, half_c, z), 0.14, 0.14, "wood")
        mb.box((x - 0.07, -0.07, POLE_Z), (x + 0.07, 0.07, z), "wood")
    o = mb.build("body.pole", (x_rear, 0, POLE_Z), root)
    set_teach(o, "chassis", "车辕")
    return x_end, z_end


# --------------------------------------------------------------------------- figure


def figure(L, root, lift):
    """lift: how far (chi) the shaft rises when taken apart; the figure rises
    one chi more, so it comes off the shaft but stays close to the gears."""
    s, z = L.shaft_x, L.shaft_top
    sh = MB()
    sq = G(L, "shaftSquare") / 2
    sh.cyl((s, 0, L.shaft_bottom + G(L, "shaftPointLength")), (s, 0, z), L.shaft_r, "gold", n=10)
    # squared where the central wheel is keyed on, an iron point below, an iron collar at the top
    zg = L.gear_square_z
    sh.box((s - sq, -sq, zg - 0.3), (s + sq, sq, zg + 0.3), "gold")
    sh.frustum([(s + L.shaft_r * 0.7 * math.cos(a), L.shaft_r * 0.7 * math.sin(a), L.shaft_bottom + G(L, "shaftPointLength")) for a in [i * math.pi / 4 for i in range(8)]],
               [(s, 0, L.shaft_bottom)], "iron")
    col = G(L, "shaftCollar")
    sh.cyl((s, 0, z - col - 0.45), (s, 0, z - 0.45), L.shaft_r + 0.02, "iron", n=10)
    # the figure's pedestal (莲座) on the shaft top
    sh.revolve((s, 0, z - 0.32), (0, 0, 1), [(0.05, 0.0), (0.22, 0.0), (0.38, 0.2), (0.3, 0.32), (0.05, 0.32)], "gold", n=12)
    shaft = sh.build("figure.shaft", (s, 0, L.shaft_bottom), root)
    set_rotate(shaft, "figure", (0, 0, 1))
    set_teach(shaft, "figure", "竖轴（木人站在顶上）", (0, 0, lift))

    mb = MB()
    c = (s, 0, z)

    def at(dx, dy, dz):
        return (s + dx, dy, z + dz)

    def ring(r, dz, n=16, ry=None):
        ry = r if ry is None else ry
        return [at(r * math.cos(math.pi / n + k * 2 * math.pi / n), ry * math.sin(math.pi / n + k * 2 * math.pi / n), dz) for k in range(n)]

    # Carved and lacquered, rounded like a turned wooden doll: a robe that
    # flares a little at the hem and rounds over the shoulders, an egg of a
    # head, a long sleeve to a slender hand that points along +X. Built smooth
    # (faces under 40° apart shade as one surface; hems, cuffs and caps stay crisp).
    mb.disc(at(0, 0, 0.07), (0, 0, 1), 0.32, 0.14, "gold", n=24)
    mb.frustum(ring(0.31, 0.14), ring(0.29, 0.22), "robe")             # hem
    mb.frustum(ring(0.29, 0.22), ring(0.19, 0.8), "robe")
    mb.frustum(ring(0.19, 0.8), ring(0.15, 0.9), "robe")               # shoulders
    mb.frustum(ring(0.15, 0.9), ring(0.08, 0.95), "robe")
    mb.frustum(ring(0.198, 0.5), ring(0.205, 0.58), "gold")             # belt
    mb.cyl(at(0.02, 0, 0.84), at(0.56, 0, 0.9), 0.07, "robe", n=12)    # pointing arm (+X), sleeve
    mb.disc(at(0.58, 0, 0.902), (1, 0, 0.11), 0.085, 0.05, "robe", n=12)  # cuff
    mb.ellipsoid(at(0.64, 0, 0.905), (0.055, 0.045, 0.045), "skin", n=10, m=6)  # hand
    mb.cyl(at(0.66, 0, 0.912), at(0.79, 0, 0.925), 0.018, "skin", n=8)  # finger
    mb.cyl(at(-0.02, 0.17, 0.86), at(0.05, 0.235, 0.5), 0.065, "robe", n=12)  # other arm, hanging
    mb.ellipsoid(at(0.055, 0.24, 0.46), (0.045, 0.04, 0.05), "skin", n=10, m=6)
    mb.cyl(at(0, 0, 0.93), at(0, 0, 1.01), 0.055, "skin", n=12)        # neck
    mb.ellipsoid(at(0, 0, 1.115), (0.122, 0.115, 0.135), "skin", n=20, m=10)  # head
    mb.ellipsoid(at(0.118, 0, 1.105), (0.022, 0.018, 0.026), "skin", n=8, m=5)  # nose
    for dy in (-0.048, 0.048):                                          # eyes and brows, facing +X
        mb.ellipsoid(at(0.109, dy, 1.128), (0.02, 0.017, 0.012), "hat", n=8, m=5)
        mb.beam(at(0.114, dy - 0.028, 1.152), at(0.114, dy + 0.028, 1.152), 0.014, 0.008, "hat")
    mb.beam(at(0.112, -0.028, 1.062), at(0.112, 0.028, 1.062), 0.012, 0.008, "robe")  # mouth
    # a rounded black cap with a band, its crown standing up at the back
    mb.ellipsoid(at(-0.01, 0, 1.23), (0.135, 0.13, 0.085), "hat", n=20, m=10)
    mb.ellipsoid(at(-0.035, 0, 1.31), (0.085, 0.085, 0.085), "hat", n=16, m=8)
    mb.frustum(ring(0.126, 1.175, 20, 0.12), ring(0.132, 1.2, 20, 0.126), "hat")
    fig = mb.build("figure", c, root, smooth=40)
    set_rotate(fig, "figure", (0, 0, 1))
    set_teach(fig, "figure", "木人", (0, 0, lift + 1.0))


# --------------------------------------------------------------------------- Song


def build_song(L, root):
    g = L.gears
    x0, x1 = -3.0, 5.0
    xs = L.shaft_x
    depth = B(L, "boxDepth")
    bx0 = xs - depth * 0.57
    bx1 = bx0 + depth
    L.gear_square_z = g["big"].center[2]

    def frame(fr):
        # the shaft's step bearing: a beam between the sills with an iron cup
        fr.box((xs - 0.25, -SILL_Y[0], SILL_Z[0]), (xs + 0.25, SILL_Y[0], L.shaft_bottom - 0.02), "wood")
        fr.cyl((xs, 0, L.shaft_bottom - 0.12), (xs, 0, L.shaft_bottom + 0.04), L.shaft_r + 0.06, "iron", n=10)

    foot = g["foot.L"]
    windows = [(-0.3, 0.3, L.axle_z - 0.28, L.axle_z + 0.28)]
    floor_holes = [(-foot.tip_r - 0.1, foot.tip_r + 0.1, L.foot_y - L.tooth.thick / 2 - 0.12, L.foot_y + L.tooth.thick / 2 + 0.12)]
    body(L, root, x0, x1, bx0, bx1, 1.05, windows, floor_holes, [-1.0], frame)
    pole(L, root, -1.0, bx1, [(4.35, 1.5, 3.95)])

    ax = MB()
    ax.cyl((0, -L.hub_y0, L.axle_z), (0, L.hub_y0, L.axle_z), L.axle_r, "wood_dark", n=12)
    for sy in (1, -1):
        axle_end(ax, L, sy, L.hub_y0)
    o = ax.build("body.axle", (0, 0, L.axle_z), root)
    set_teach(o, "chassis", "车轴")

    for side, sy in (("L", 1), ("R", -1)):
        wheel(L, side, root)
        side_cn = "左" if side == "L" else "右"
        ft = g["foot." + side]
        # the foot gear's collar sits round the hub's inner segment ("附足")
        o = gear_node(ft, root, f"{side_cn}立子轮", (0, sy * 1.4, 0), spoked_wheel(L, ft, "blue" if side == "L" else "orange", G(L, "footSpokes"), 0.64, 0.3, 4))
        set_rotate(o, "foot" + side, ft.axis)

        sm = g["small." + side]
        lift = MB()
        lift.cyl(lay.add(sm.center, (0, 0, -0.2)), lay.add(sm.center, (0, 0, 0.8)), 0.05, "iron", n=6)
        top = lay.add(sm.center, (0, 0, 0.8))
        drop = (4.55, sy * 1.35, top[2])  # clear of the big flat wheel (2.72 from its axis)
        lift.cyl(top, drop, 0.03, "rope", n=6)
        lift.cyl(drop, (4.55, sy * 1.35, 4.15), 0.03, "rope", n=6)
        lift.box((4.48, sy * 1.35 - 0.07, 3.98), (4.62, sy * 1.35 + 0.07, 4.15), "iron")
        lo = lift.build(f"song.smallLift.{side}", sm.center, root)
        set_lift(lo, f"clutch{side}", L.lift)
        set_teach(lo, "gear", f"{side_cn}小平轮的吊绳（拉起、放下小平轮）", (0, sy * 0.5, 1.0))
        so = gear_node(sm, lo, f"{side_cn}小平轮", (0, 0, 0), disc_wheel(L, sm, "blue" if side == "L" else "orange", L.disc_small, 0.1),
                       extra=lambda mb, sm=sm: mb.box((sm.center[0] - 0.1, sm.center[1] - 0.1, sm.center[2] - 0.14), (sm.center[0] + 0.1, sm.center[1] + 0.1, sm.center[2] + 0.14), "wood_dark"))
        set_rotate(so, "small" + side, sm.axis)

        rl = MB()
        rc = (4.35, sy * 1.1, 2.95)
        rl.disc(rc, (1, 0, 0), L.raw["song"]["poleRollerDiameter"]["v"] / 2, 0.08, "wood_dark", n=12)
        rl.cyl((4.31, rc[1], rc[2]), (4.39, rc[1], rc[2]), 0.03, "iron", n=6)
        rl.cyl(rc, (rc[0], rc[1], POLE_Z - 0.07), 0.025, "iron", n=6)
        ro = rl.build(f"song.roller.{side}", rc, root)
        set_lift(ro, f"clutch{side}", 0.2)
        set_teach(ro, "gear", f"车辕头上的{side_cn}小轮", (0, 0, 0.6))

    big = g["big"]
    o = gear_node(big, root, "大平轮", (0, 0, 2.0), flat_wheel(L, big, "gold", G(L, "shaftSquare") + 0.2, 0.4, 6))
    set_rotate(o, "bigFlat", big.axis)
    figure(L, root, 2.6)


# --------------------------------------------------------------------------- differential


def build_differential(L, root):
    g = L.gears
    x0, x1 = -4.0, 4.0
    depth = B(L, "boxDepth")
    bx0, bx1 = -depth / 2, depth / 2
    L.gear_square_z = (g["sideA"].center[2] + g["sideB"].center[2]) / 2

    def frame(fr):
        fr.box((-0.08, -L.gear_room_y + BOARD_T, 0.45), (0.08, L.gear_room_y - BOARD_T, L.shaft_bottom), "wood")    # step bearing under the shaft
        fr.cyl((0, 0, L.shaft_bottom - 0.1), (0, 0, L.shaft_bottom + 0.04), L.shaft_r + 0.06, "iron", n=10)

    body(L, root, x0, x1, bx0, bx1, 1.05, [(-0.3, 0.3, L.axle_z - 0.28, L.axle_z + 0.28)], [], [-2.6, 2.6], frame)
    pole(L, root, L.shaft_r + 0.15, bx1, [])

    for side, colour, sy, gname, label in (("L", "blue", 1, "crown.L", "左轮带的竖齿轮"),
                                           ("R", "orange", -1, "crown.R", "右轮带的竖齿轮")):
        wheel(L, side, root)
        cr = g[gname]

        def half_shaft(mb, cr=cr, sy=sy):
            # the half axle from the crown wheel into the hub, with the cap and linchpin at its end
            # it runs inboard through the 伏兔 (its bearing) and outboard into the hub
            mb.cyl((0, sy * min(cr.center[1] * sy, SILL_Y[0] - 0.25), L.axle_z), (0, sy * (L.hub_y0 + 0.02), L.axle_z), L.axle_r, "wood_dark", n=12)
            axle_end(mb, L, sy, L.hub_y0)

        if side == "L":
            o = gear_node(cr, root, label, (0, 1.4, 0), spoked_wheel(L, cr, colour, 4, 0.42, 0.16, 4), extra=half_shaft)
        else:
            o = gear_node(cr, root, label, (0, -1.4, 2.2), disc_wheel(L, cr, colour, L.rim_t, 0.22), extra=half_shaft)
        set_rotate(o, "wheel" + side, cr.axis)

    ringA, ringB = g["ringA"], g["ringB"]
    sA = g["sideA"]

    def side_a_extra(mb):
        mb.revolve(sA.center, sA.axis, [(ringA.r - 0.16, L.disc_t / 2), (ringA.r + 0.16, L.disc_t / 2), (ringA.r + 0.16, L.disc_t / 2 + 0.06), (ringA.r - 0.16, L.disc_t / 2 + 0.06)], "blue", n=16, ref=sA.u)
        for k in range(ringA.n):
            tooth_block(mb, ringA, k, "peg")

    o = gear_node(sA, root, "左边的平齿轮（下层）", (0, 0, 0), flat_wheel(L, sA, "blue", G(L, "shaftSquare") + 0.2, 0.3, 6), extra=side_a_extra)
    o["sideTeeth"] = ringA.n
    set_rotate(o, "sideA", sA.axis)

    sB = g["sideB"]

    def side_b_extra(mb):
        for k in range(ringB.n):
            tooth_block(mb, ringB, k, "peg")
        c = sB.center
        h = G(L, "shaftSquare") / 2 + 0.1
        mb.box((c[0] - h, c[1] - h, c[2] - 0.15), (c[0] + h, c[1] + h, c[2] + 0.2), "wood_dark")

    o = gear_node(sB, root, "右边的平齿轮（上层）", (0, 0, 2.2), disc_wheel(L, sB, "orange", L.disc_t, 0.25), extra=side_b_extra)
    o["sideTeeth"] = ringB.n
    set_rotate(o, "sideB", sB.axis)

    cm = MB()
    cc = (0.0, 0.0, L.z_pin)
    cm.cyl((0, 0, L.z_pin - 0.12), (0, 0, L.z_pin + 0.12), 0.21, "gold", n=10)
    for sx in (1, -1):
        cm.cyl((sx * 0.15, 0, L.z_pin), (sx * (L.r_side + 0.12), 0, L.z_pin), 0.05, "iron", n=6)
    carrier = cm.build("diff.carrier", cc, root)
    set_rotate(carrier, "carrier", (0, 0, 1))
    set_teach(carrier, "gear", "架子（木人就站在它上面）", (0, 0, 1.1))
    for k in (0, 1):
        p = g[f"pinion.{k}"]
        o = gear_node(p, carrier, "小齿轮", (0, 0, 0), disc_wheel(L, p, "gold", 0.08, 0.07))
        set_rotate(o, "pinion", p.axis)
    figure(L, root, 1.7)


# --------------------------------------------------------------------------- main


def build(mechanism):
    reset()
    L = lay.layout(mechanism)
    root = empty("chariot", (0, 0, 0))
    root["mechanism"] = mechanism
    root["label"] = "宋史式：燕肃的车" if mechanism == "song" else "差动式：现代人猜的"
    (build_song if mechanism == "song" else build_differential)(L, root)
    return L


def export(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_extras=True,
                              export_apply=False, export_cameras=False, export_lights=False)


# --------------------------------------------------------------------------- occlusion atlas
#
# The weathering is baked, not shaded at run time (design/decisions/0004): every mesh is
# unwrapped into one atlas (TEXCOORD_0 in the GLB; the page keeps it as uv1 and lays its
# own planar grain UVs over uv), and Cycles bakes ambient occlusion times a little dust
# on upward faces into it. materials.js reads it as the aoMap of the wooden, lacquered
# and iron parts (not the blue/orange/marker ones: those must stay clean colours).


def meshes():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def unwrap():
    """One UV atlas over every mesh, deterministic (so the GLB stays reproducible)."""
    objs = meshes()
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.5, island_margin=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.002, rotate=True, scale=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")


def bake(mechanism, size=1024, samples=32):
    """Cycles bake of AO x dust into assets/photo/chariot-<m>-ao-{1024,512}.webp. Call after export:
    it rewires every material to an emission shader."""
    img = bpy.data.images.new("atlas", size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.nodes.active = tex
        ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao.inputs["Distance"].default_value = 1.2
        ao.samples = 8
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
        # dust: faces turned up (blender z) a little darker, as a matt film of it
        dust = nt.nodes.new("ShaderNodeMapRange")
        dust.inputs["From Min"].default_value = 0.3
        dust.inputs["From Max"].default_value = 1.0
        dust.inputs["To Min"].default_value = 1.0
        dust.inputs["To Max"].default_value = 0.84
        nt.links.new(sep.outputs["Z"], dust.inputs["Value"])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        nt.links.new(ao.outputs["AO"], mul.inputs[0])
        nt.links.new(dust.outputs["Result"], mul.inputs[1])
        emit = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(mul.outputs["Value"], emit.inputs["Color"])
        nt.links.new(emit.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.seed = 7
    sc.cycles.use_denoising = False
    sc.render.bake.use_selected_to_active = False
    sc.render.bake.margin = 12
    if sc.world is None:
        sc.world = bpy.data.worlds.new("sky")
    sc.world.use_nodes = True
    sc.world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    objs = meshes()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type="EMIT")
    img.file_format = "WEBP"
    out = []
    for s in (size, size // 2):
        if s != size:
            img.scale(s, s)
        path = os.path.join(ASSETS, "photo", f"chariot-{mechanism}-ao-{s}.webp")
        img.filepath_raw = path
        img.save()
        out.append((path, os.path.getsize(path)))
    return out


def triangles():
    return sum(sum(len(f.vertices) - 2 for f in o.data.polygons) for o in bpy.data.objects if o.type == "MESH")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    mech = argv[argv.index("--mechanism") + 1] if "--mechanism" in argv else "all"
    mechs = ["differential", "song"] if mech == "all" else [mech]
    for m in mechs:
        out = argv[argv.index("--out") + 1] if "--out" in argv and len(mechs) == 1 else os.path.join(ASSETS, f"chariot-{m}.glb")
        build(m)
        unwrap()
        export(out)
        if "--blend" in argv:
            bpy.ops.wm.save_as_mainfile(filepath=argv[argv.index("--blend") + 1])
        print(f"BUILD_OK mechanism={m} out={out} objects={len(bpy.data.objects)} triangles={triangles()} bytes={os.path.getsize(out)}")
        if "--no-bake" not in argv:
            t0 = time.time()
            for path, size in bake(m):
                print(f"BAKE_OK mechanism={m} out={path} bytes={size} seconds={time.time() - t0:.0f}")


if __name__ == "__main__":
    main()

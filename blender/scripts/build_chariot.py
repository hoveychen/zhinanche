"""Build the south-pointing chariot GLBs from params/chariot.json.

  blender --background --factory-startup --python-exit-code 1 --python build_chariot.py -- \
      [--mechanism differential|song|all] [--out PATH] [--blend PATH]

Without --mechanism (or with "all") both files are written to assets/chariot-<m>.glb.
Node names and extras follow docs/model-contract.md; the gear layout is lib/layout.py and
is explained in docs/model-notes.md. Blender frame: +X forward, +Y left, +Z up, 1 unit =
1 chi; the glTF exporter turns it into Y-up with -Z = left.
"""

import math
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from lib import layout as lay  # noqa: E402
from lib.mesh import MB, empty, set_lift, set_rotate, set_teach  # noqa: E402

ASSETS = os.path.join(lay.ROOT, "assets")

# Body shape (design only, see params "body"): gear room under a deck, a smaller upper
# tier (重台) with railings (勾闌), pillars and a hip roof; the figure stands on the shaft.
BOARD_Y = 2.3      # outer face of the side boards (body.widthBetweenWheels / 2)
BOARD_T = 0.08
SILL = (2.3, 2.45, 2.85, 3.15)   # y0, y1, z0, z1 of the two sills that carry the axle
POLE_Z = 3.45

SHELL_EXPLODE = {
    "body.side.L": (0, 3.5, 0), "body.side.R": (0, -3.5, 0),
    "body.end.F": (3.0, 0, 0), "body.end.B": (-3.0, 0, 0),
    "body.deck": (0, 0, 4.5), "body.tier": (0, 0, 5.5), "body.roof": (0, 0, 6.5),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "NONE"
    return sc


# --------------------------------------------------------------------------- gears


def peg_wheel(g, colour, parent, label, r_out, explode=(0, 0, 0), disc="ring", t=0.1, hub=(0.26, 0.24), spokes=6,
              ring_w=0.34, extra=None):
    """A gear node at g.center: disc (radius r_out) or spoked ring, hub, pegs; peg 0 is the red marker child."""
    mb = MB()
    a = g.axis
    if disc == "ring":
        r_in = r_out - ring_w
        mb.ring(g.center, a, r_in, r_out, t, colour, n=max(16, min(40, g.n)), ref=g.u)
        for k in range(spokes):
            ang = g.phase + math.pi / g.n + 2 * math.pi * k / spokes
            mb.beam(g.point(ang, hub[0] * 0.8), g.point(ang, r_in + 0.04), 0.13, t * 0.8, colour, up=a)
    elif disc == "solid":
        mb.disc(g.center, a, r_out, t, colour, n=max(12, min(24, g.n)), phase=g.phase + math.pi / g.n, ref=g.u)
    hr, hl = hub
    mb.cyl(lay.add(g.center, lay.mul(a, -hl / 2)), lay.add(g.center, lay.mul(a, hl / 2)), hr, "wood_dark", n=10)
    if extra:
        extra(mb)
    marker = MB()
    for k, (p0, p1) in enumerate(g.pegs()):
        (marker if k == 0 else mb).cyl(p0, p1, g.peg_d / 2 * (1.15 if k == 0 else 1.0), "marker" if k == 0 else "peg", n=8)
    obj = mb.build(g.name, g.center, parent)
    set_teach(obj, "gear", label, explode, g.n)
    m = marker.build(g.name + ".marker", g.center, obj)
    set_teach(m, "gear", label + "上的记号")
    return obj


def axial_pegs(mb, g):
    for p0, p1 in g.pegs():
        mb.cyl(p0, p1, g.peg_d / 2, "peg", n=8)


# --------------------------------------------------------------------------- wheels


def wheel(L, side, colour, parent, hub_y=(2.75, 3.3)):
    sy = 1 if side == "L" else -1
    c = (0.0, sy * L.track / 2, L.axle_z)
    R = L.wheel_r
    mb = MB()
    mb.ring(c, (0, 1, 0), R - 0.28, R, 0.22, colour, n=32, ref=(0, 0, 1))
    mb.cyl((0, sy * hub_y[0], L.axle_z), (0, sy * hub_y[1], L.axle_z), 0.3, "wood_dark", n=12)
    marker = MB()
    n = 16
    for k in range(n):
        a = 2 * math.pi * k / n
        d = (math.sin(a), 0.0, math.cos(a))
        p0 = lay.add(c, lay.mul(d, 0.25))
        p1 = lay.add(c, lay.mul(d, R - 0.24))
        (marker if k == 0 else mb).beam(p0, p1, 0.1, 0.08, "marker" if k == 0 else "wood_dark", up=(0, 1, 0))
    obj = mb.build(f"wheel.{side}", c, parent)
    set_rotate(obj, f"wheel{side}", (0, 1, 0))
    set_teach(obj, "wheel", "左车轮" if side == "L" else "右车轮", (0, sy * 2.8, 0))
    m = marker.build(f"wheel.{side}.marker", c, obj)
    set_teach(m, "wheel", ("左车轮" if side == "L" else "右车轮") + "的记号辐条")
    return obj


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


def railing(mb, x0, x1, y0, y1, z0, h, step=0.9, post=0.08):
    """勾闌: posts round a rectangle with a top and a middle rail."""
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    for i in range(4):
        (ax, ay), (bx, by) = corners[i], corners[(i + 1) % 4]
        length = math.hypot(bx - ax, by - ay)
        n = max(1, round(length / step))
        for k in range(n):
            t = k / n
            px, py = ax + (bx - ax) * t, ay + (by - ay) * t
            mb.box((px - post / 2, py - post / 2, z0), (px + post / 2, py + post / 2, z0 + h), "lacquer")
        for zr, s in ((z0 + h - 0.035, 0.07), (z0 + h * 0.5, 0.05)):
            mb.beam((ax, ay, zr), (bx, by, zr), s, s, "lacquer")


def body(L, root, x0, x1, board_z0, side_holes, extra_frame=None):
    s = L.shaft_x
    deck = L.deck_z
    # chassis frame: sills, corner posts, deck beams
    fr = MB()
    y0, y1, z0, z1 = SILL
    for sy in (1, -1):
        fr.box((x0, min(sy * y0, sy * y1), z0), (x1, max(sy * y0, sy * y1), z1), "wood")
        fr.box((x0, min(sy * 2.15, sy * 2.45), deck - 0.15), (x1, max(sy * 2.15, sy * 2.45), deck), "wood")
        for px in (x0 + 0.1, x1 - 0.1):
            yc = sy * 2.375
            fr.box((px - 0.08, yc - 0.08, z1), (px + 0.08, yc + 0.08, deck - 0.15), "wood")
    for px0, px1 in ((x0, x0 + 0.2), (x1 - 0.2, x1)):
        fr.box((px0, -2.45, deck - 0.15), (px1, 2.45, deck), "wood")
        fr.box((px0, -2.3, z0), (px1, 2.3, z1), "wood")
    if extra_frame:
        extra_frame(fr)
    o = fr.build("body.frame", (0, 0, 0), root)
    set_teach(o, "chassis", "车架")

    # shell: side and end boards, deck with railing, upper tier, roof
    for side, sy in (("L", 1), ("R", -1)):
        mb = MB()
        yb0, yb1 = sorted((sy * (BOARD_Y - BOARD_T), sy * BOARD_Y))
        for u0, u1, w0, w1 in board_rects(x0, x1, board_z0, deck - 0.15, side_holes):
            mb.box((u0, yb0, w0), (u1, yb1, w1), "wood")
        o = mb.build(f"body.side.{side}", (0, 0, 0), root)
        set_teach(o, "shell", "左侧车厢板" if side == "L" else "右侧车厢板", SHELL_EXPLODE[f"body.side.{side}"])
    pole_hole = [(-0.22, 0.22, POLE_Z - 0.2, POLE_Z + 0.2)]
    for name, xa, xb, holes, label in (("body.end.F", x1 - BOARD_T, x1, pole_hole, "前车厢板"),
                                       ("body.end.B", x0, x0 + BOARD_T, [], "后车厢板")):
        mb = MB()
        for u0, u1, w0, w1 in board_rects(-BOARD_Y, BOARD_Y, board_z0, deck - 0.15, holes):
            mb.box((xa, u0, w0), (xb, u1, w1), "wood")
        o = mb.build(name, (0, 0, 0), root)
        set_teach(o, "shell", label, SHELL_EXPLODE[name])

    mb = MB()
    mb.box((x0 - 0.05, -2.5, deck), (x1 + 0.05, 2.5, deck + 0.12), "wood")
    railing(mb, x0 + 0.02, x1 - 0.02, -2.43, 2.43, deck + 0.12, 0.7)
    o = mb.build("body.deck", (0, 0, deck), root)
    set_teach(o, "shell", "下层平台和栏杆", SHELL_EXPLODE["body.deck"])

    tz0, tz1, top = deck + 0.12, deck + 0.9, 9.0
    mb = MB()
    mb.box((s - 1.9, -1.7, tz0), (s + 1.9, 1.7, tz1), "wood")
    mb.box((s - 2.0, -1.8, tz1 - 0.08), (s + 2.0, 1.8, tz1), "lacquer")
    railing(mb, s - 1.85, s + 1.85, -1.65, 1.65, tz1, 0.5, step=0.75)
    for px in (s - 1.6, s + 1.6):
        for py in (-1.4, 1.4):
            mb.cyl((px, py, tz1), (px, py, top), 0.1, "lacquer", n=8)
    o = mb.build("body.tier", (s, 0, tz0), root)
    set_teach(o, "shell", "上层平台", SHELL_EXPLODE["body.tier"])

    mb = MB()
    mb.box((s - 2.35, -2.15, top), (s + 2.35, 2.15, top + 0.12), "eave")

    def rect(hx, hy, z):
        return [(s - hx, -hy, z), (s + hx, -hy, z), (s + hx, hy, z), (s - hx, hy, z)]

    mb.frustum(rect(2.25, 2.05, top + 0.12), rect(1.15, 0.95, top + 0.75), "roof")
    mb.frustum(rect(1.15, 0.95, top + 0.75), [(s, 0, top + 1.4)], "roof")
    o = mb.build("body.roof", (s, 0, top), root)
    set_teach(o, "shell", "屋顶", SHELL_EXPLODE["body.roof"])


def pole(root, x_rear, length, crossbars):
    mb = MB()
    mb.cyl((x_rear, 0, POLE_Z), (x_rear + length, 0, POLE_Z), 0.14, "wood", n=8, phase=math.pi / 8)
    xf = x_rear + length - 0.3
    mb.beam((xf, -1.6, POLE_Z + 0.02), (xf, 1.6, POLE_Z + 0.02), 0.12, 0.12, "wood")
    for x, half in crossbars:
        mb.beam((x, -half, POLE_Z), (x, half, POLE_Z), 0.14, 0.14, "wood")
    o = mb.build("body.pole", (x_rear, 0, POLE_Z), root)
    set_teach(o, "chassis", "车辕")


# --------------------------------------------------------------------------- figure


def figure(L, root, lift):
    """lift: how far (chi) the shaft rises when taken apart; the figure rises
    one chi more, so it comes off the shaft but stays close to the gears."""
    s, z = L.shaft_x, L.shaft_top
    sh = MB()
    sh.cyl((s, 0, L.shaft_bottom), (s, 0, z), L.shaft_r, "gold", n=10)
    shaft = sh.build("figure.shaft", (s, 0, L.shaft_bottom), root)
    set_rotate(shaft, "figure", (0, 0, 1))
    set_teach(shaft, "figure", "竖轴（木人站在顶上）", (0, 0, lift))

    mb = MB()
    c = (s, 0, z)

    def at(dx, dy, dz):
        return (s + dx, dy, z + dz)

    def octo(r, dz):
        return [at(r * math.cos(math.pi / 8 + k * math.pi / 4), r * math.sin(math.pi / 8 + k * math.pi / 4), dz) for k in range(8)]

    mb.disc(at(0, 0, 0.07), (0, 0, 1), 0.32, 0.14, "gold", n=12)
    mb.frustum(octo(0.3, 0.14), octo(0.17, 0.95), "robe")
    mb.frustum(octo(0.19, 0.5), octo(0.2, 0.58), "gold")             # belt
    mb.cyl(at(0.02, 0, 0.84), at(0.72, 0, 0.9), 0.065, "robe", n=8)    # pointing arm (+X)
    mb.cyl(at(0.72, 0, 0.9), at(0.93, 0, 0.92), 0.04, "skin", n=6)    # hand, finger
    mb.cyl(at(-0.02, 0.17, 0.86), at(0.06, 0.24, 0.45), 0.06, "robe", n=8)
    mb.cyl(at(0, 0, 0.94), at(0, 0, 1.02), 0.06, "skin", n=8)
    mb.frustum(octo(0.11, 1.0), octo(0.14, 1.12), "skin")
    mb.frustum(octo(0.14, 1.12), octo(0.11, 1.25), "skin")
    mb.disc(at(0, 0, 1.25), (0, 0, 1), 0.2, 0.03, "hat", n=12)
    mb.frustum(octo(0.12, 1.26), octo(0.08, 1.43), "hat")
    for dy in (-0.05, 0.05):                                           # eyes, facing +X
        mb.box(at(0.125, dy - 0.015, 1.15), at(0.145, dy + 0.015, 1.18), "hat")
    fig = mb.build("figure", c, root)
    set_rotate(fig, "figure", (0, 0, 1))
    set_teach(fig, "figure", "木人", (0, 0, lift + 1.0))


# --------------------------------------------------------------------------- Song


def build_song(L, root):
    g = L.gears
    x0, x1 = -3.0, 5.0
    xs = L.shaft_x

    def frame(fr):
        fr.box((xs - 0.09, -2.3, L.shaft_bottom - 0.12), (xs + 0.09, 2.3, L.shaft_bottom), "wood")  # step bearing

    # windows for the small wheels and the axle, and a slot where the big flat wheel's rim
    # (r = 2.51 with its pegs) passes the side boards (half width 2.3)
    windows = [(-0.95, 0.95, L.mesh_z - 0.35, L.mesh_z + 0.9), (-0.3, 0.3, 2.6, 3.35),
               (xs - 1.4, xs + 1.4, L.mesh_z - 0.17, L.mesh_z + 0.17)]
    body(L, root, x0, x1, 2.7, windows, frame)
    pole(root, 4.2, lay.pv(L.raw, "body.poleLength"), [(4.35, 1.4)])

    ax = MB()
    ax.cyl((0, -3.35, L.axle_z), (0, 3.35, L.axle_z), 0.14, "wood_dark", n=10)
    o = ax.build("body.axle", (0, 0, L.axle_z), root)
    set_teach(o, "chassis", "车轴")

    for side, colour, sy in (("L", "blue", 1), ("R", "orange", -1)):
        wheel(L, side, colour, root)
        side_cn = "左" if side == "L" else "右"
        foot = g["foot." + side]

        def foot_hub(mb, sy=sy):
            mb.cyl((0, sy * 2.55, L.axle_z), (0, sy * 2.8, L.axle_z), 0.26, "wood_dark", n=10)

        o = peg_wheel(foot, colour, root, f"{side_cn}立子轮", foot.r - L.ded, (0, sy * 1.4, 0), disc="ring", hub=(0.26, 0.1),
                      spokes=4, ring_w=0.28, extra=foot_hub)
        set_rotate(o, "foot" + side, foot.axis)

        sm = g["small." + side]
        lift = MB()
        lift.cyl(lay.add(sm.center, (0, 0, -0.25)), lay.add(sm.center, (0, 0, 0.8)), 0.05, "iron", n=6)
        top = lay.add(sm.center, (0, 0, 0.8))
        drop = (4.55, sy * 1.35, top[2])  # clear of the big flat wheel (2.7 from its axis)
        lift.cyl(top, drop, 0.03, "rope", n=6)
        lift.cyl(drop, (4.55, sy * 1.35, 3.8), 0.03, "rope", n=6)
        lift.box((4.48, sy * 1.35 - 0.07, 3.62), (4.62, sy * 1.35 + 0.07, 3.8), "iron")
        lo = lift.build(f"song.smallLift.{side}", sm.center, root)
        set_lift(lo, f"clutch{side}", L.lift)
        set_teach(lo, "gear", f"{side_cn}小平轮的吊绳（拉起、放下小平轮）", (0, sy * 0.5, 1.0))
        so = peg_wheel(sm, colour, lo, f"{side_cn}小平轮", sm.r - L.ded, disc="solid", t=0.12, hub=(0.12, 0.22))
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
    o = peg_wheel(big, "gold", root, "大平轮", big.r - L.ded, (0, 0, 2.0), disc="ring", t=0.12, hub=(0.3, 0.26), spokes=6, ring_w=0.34)
    set_rotate(o, "bigFlat", big.axis)
    figure(L, root, 2.6)


# --------------------------------------------------------------------------- differential


def build_differential(L, root):
    g = L.gears
    x0, x1 = -4.0, 4.0

    def frame(fr):
        for sy in (1, -1):
            fr.box((-0.08, sy * 2.3 if sy > 0 else -2.45, 0.45), (0.08, 2.45 if sy > 0 else -2.3, SILL[2]), "wood")
        fr.box((-0.08, -2.45, 0.45), (0.08, 2.45, L.shaft_bottom), "wood")    # step bearing under the shaft
        fr.box((3.32, -2.3, SILL[3]), (3.48, 2.3, POLE_Z - 0.14), "wood")    # pole rest

    body(L, root, x0, x1, 1.1, [(-0.3, 0.3, 2.65, 3.35)], frame)
    pole(root, 3.3, lay.pv(L.raw, "body.poleLength"), [])

    for side, colour, sy, gname, label in (("L", "blue", 1, "crown.L", "左轮带的竖齿轮"),
                                           ("R", "orange", -1, "crown.R", "右轮带的竖齿轮")):
        wheel(L, side, colour, root)
        cr = g[gname]

        def half_shaft(mb, cr=cr, sy=sy):
            mb.cyl(cr.center, (0, sy * 3.3, L.axle_z), 0.16, "wood_dark", n=10)

        if side == "L":
            o = peg_wheel(cr, colour, root, label, cr.r - L.ded, (0, 1.4, 0), disc="ring", hub=(0.28, 0.14), extra=half_shaft)
        else:
            o = peg_wheel(cr, colour, root, label, cr.r - L.ded, (0, -1.4, 2.2), disc="solid", hub=(0.24, 0.14), extra=half_shaft)
        set_rotate(o, "wheel" + side, cr.axis)

    ringA, ringB = g["ringA"], g["ringB"]
    sA = g["sideA"]

    def side_a_extra(mb):
        mb.ring(sA.center, sA.axis, ringA.r - 0.12, ringA.r + 0.12, L.disc_t, "blue", n=16, ref=sA.u)
        axial_pegs(mb, ringA)

    o = peg_wheel(sA, "blue", root, "左边的平齿轮（下层）", sA.r - L.ded, (0, 0, 0), disc="ring", t=L.disc_t, hub=(0.28, 0.2),
                  ring_w=0.39, extra=side_a_extra)
    o["sideTeeth"] = ringA.n
    set_rotate(o, "sideA", sA.axis)

    sB = g["sideB"]

    def side_b_extra(mb):
        axial_pegs(mb, ringB)

    o = peg_wheel(sB, "orange", root, "右边的平齿轮（上层）", sB.r - L.ded, (0, 0, 2.2), disc="solid", t=L.disc_t, hub=(0.24, 0.24),
                  extra=side_b_extra)
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
        o = peg_wheel(p, "gold", carrier, "小齿轮", L.pin_disc_r, disc="solid", t=0.08, hub=(0.08, 0.12))
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


def triangles():
    return sum(sum(len(f.vertices) - 2 for f in o.data.polygons) for o in bpy.data.objects if o.type == "MESH")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    mech = argv[argv.index("--mechanism") + 1] if "--mechanism" in argv else "all"
    mechs = ["differential", "song"] if mech == "all" else [mech]
    for m in mechs:
        out = argv[argv.index("--out") + 1] if "--out" in argv and len(mechs) == 1 else os.path.join(ASSETS, f"chariot-{m}.glb")
        build(m)
        export(out)
        if "--blend" in argv:
            bpy.ops.wm.save_as_mainfile(filepath=argv[argv.index("--blend") + 1])
        print(f"BUILD_OK mechanism={m} out={out} objects={len(bpy.data.objects)} triangles={triangles()} bytes={os.path.getsize(out)}")


if __name__ == "__main__":
    main()

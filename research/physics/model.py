"""Build a MuJoCo model of either chariot's gear train from a checkout's layout.

The gear geometry (centres, axes, pitch radii, tooth counts, rest phases, which gears mesh)
comes from `blender/scripts/lib/layout.py` of the checkout given as `root`, which reads that
checkout's `params/chariot.json`. Nothing here repeats those numbers, so the same script
runs on main or on the CAD branch.

Teeth are the radial square-section wooden blocks of the CAD research (REPORT §6.3):
tangential width w = (p - backlash) / 2, radial length h = 1.0 p with the pitch circle at
mid-height, axial thickness t = min(0.2 chi, 2/3 p). If the checkout's params carry
`model.toothWidth` / `model.toothHeight` / `model.toothThickness` (chi, at the Song pitch)
those win and scale with each gear's pitch. Each tooth is a box (or, with a chamfer, a
convex mesh: tip edges and the four long edges cut at 45 deg). Each radial gear also gets
its rim disc at the tooth root, so a tooth tip that reaches the other gear's rim touches it.

Frame (layout's, the Blender frame): +X forward, +Y left, +Z up, origin on the ground
midway between the wheel contacts. MuJoCo lengths are metres (chi x 0.31) so gravity and
masses are physical. The chassis turns about the vertical through the origin with the
chariot's heading; the road wheels turn about their axle. Both are prescribed (driven
kinematically by sim.py). Every other gear turns only because teeth push it.
"""

import importlib.util
import math
import os
import sys

CHI = 0.31  # m, params units.chiInMeters (Song chi ~ 30.7-31.6 cm)
WOOD = 700.0  # kg/m^3, hardwood (jujube / oak)


def load_layout(root, mechanism):
    path = os.path.join(root, "blender", "scripts", "lib", "layout.py")
    name = f"_layout_{abs(hash(os.path.abspath(path)))}"
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[name] = mod
        spec.loader.exec_module(mod)
    return sys.modules[name].layout(mechanism)


def _pv(raw, path, default=None):
    node = raw
    for k in path.split("."):
        if not isinstance(node, dict) or k not in node:
            return default
        node = node[k]
    return node["v"] if isinstance(node, dict) and "v" in node else node


# Tooth designs tried. "s63" is REPORT §6.3 as written; A keeps its height and thins the
# teeth until they clear; B shortens them (and thins them less). Backlash values are the
# clearance sweep's minimum (clearance.py --sweep) plus about 0.04 p.
DESIGNS = {
    "s63": dict(),
    "A": dict(height=1.0, thickness=0.2, tip_clear=0.03,
              backlash={"default": 0.54, "crown.L": 0.36, "sideA": 0.36, "crown.R": 0.44, "sideB": 0.44,
                        "ringA": 0.70, "ringB": 0.70, "pinion.0": 0.70, "pinion.1": 0.70}),
    "B": dict(height=0.64, thickness=0.15, tip_clear=0.03,
              backlash={"default": 0.32, "crown.L": 0.30, "sideA": 0.30, "crown.R": 0.30, "sideB": 0.30,
                        "ringA": 0.44, "ringB": 0.44, "pinion.0": 0.44, "pinion.1": 0.44}),
}


def design(name, **kw):
    d = dict(DESIGNS[name])
    d.update(kw)
    return Opts(**d)


def _f(*xs):
    return " ".join(f"{x:.6g}" for x in xs)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _m(v):
    return tuple(x * CHI for x in v)


class Opts:
    """Physics and tooth settings. Lengths in chi unless noted."""

    def __init__(self, **kw):
        # fraction of pitch at the pitch circle (float, or {gear key: fraction, "default": fraction});
        # None = §6.3 width 0.15 chi at the Song pitch
        self.backlash = None
        self.height = None  # fraction of pitch, tooth radial length; None = §6.3 (1.0 p)
        self.thickness = None  # chi at the Song pitch, axial thickness; None = §6.3 (0.2)
        self.chamfer = 0.0  # chi, 45 deg cut on tip and long edges (0 = plain box)
        self.tip_clear = 0.0  # chi, extra depth of the rim below the tooth root (§6.3: teeth stick out 0.3 = 1 p, rim at r - p/2)
        self.friction = 0.4  # wood on wood, sliding
        self.timestep = 0.0005  # s
        self.solref = 0.002  # s, contact time constant
        self.figure_friction = 0.5  # N m, Coulomb friction of the figure's shaft in its iron cup and collar
        self.figure_damping = 0.5  # N m s / rad
        self.free_friction = 0.05  # N m, other free gears (small flat wheels, side gears, pinions)
        self.clutch_push = 50.0  # N, the pole's push lowering a small flat wheel (plus its own weight)
        for k, v in kw.items():
            if not hasattr(self, k):
                raise KeyError(k)
            setattr(self, k, v)

    def as_dict(self):
        return dict(self.__dict__)


class Tooth:
    def __init__(self, raw, pitch_len, song_pitch, opts, key=""):
        s = pitch_len / song_pitch  # scale of §6.3 proportions to this gear's pitch
        tw = _pv(raw, "model.toothWidth")
        th = _pv(raw, "model.toothHeight")
        tt = _pv(raw, "model.toothThickness")
        if opts.height is not None:
            self.h = opts.height * pitch_len
        else:
            self.h = (th * s) if th else pitch_len
        tt = opts.thickness if opts.thickness is not None else tt
        self.t = (tt * s) if tt else min(0.2, pitch_len * 2 / 3)
        b = opts.backlash
        if isinstance(b, dict):
            b = b.get(key, b.get("default"))
        if b is not None:
            self.w = pitch_len * (1 - b) / 2
        else:
            self.w = (tw if tw else 0.15) * s
        self.backlash = pitch_len - 2 * self.w
        self.c = min(opts.chamfer, 0.45 * self.w, 0.45 * self.t)


def _tooth_mesh(name, L, w, t, c):
    """Convex block, long axis local x (root at -L/2, tip at +L/2), width y, thickness z."""
    hw, ht = w / 2, t / 2
    pts = []
    for x in (-L / 2, L / 2 - c):
        for sy in (-1, 1):
            for sz in (-1, 1):
                pts += [(x, sy * hw, sz * (ht - c)), (x, sy * (hw - c), sz * ht)]
    for sy in (-1, 1):
        for sz in (-1, 1):
            pts.append((L / 2, sy * (hw - c), sz * (ht - c)))
    verts = " ".join(_f(*_m(p)) for p in pts)
    return f'<mesh name="{name}" vertex="{verts}"/>'


# Which gears are rigidly fixed to which moving part.
SONG_BODIES = {
    "wheel.L": ["foot.L"], "wheel.R": ["foot.R"],
    "small.L": ["small.L"], "small.R": ["small.R"],
    "big": ["big"],
}
DIFF_BODIES = {
    "wheel.L": ["crown.L"], "wheel.R": ["crown.R"],
    "sideA": ["sideA", "ringA"], "sideB": ["sideB", "ringB"],
    "pinion.0": ["pinion.0"], "pinion.1": ["pinion.1"],
}


def build(root, mechanism, opts=None):
    """Return (xml, info). info names bodies/joints and the meshing pairs for sim.py."""
    opts = opts or Opts()
    L = load_layout(root, mechanism)
    raw = L.raw
    song_pitch = L.pitch
    G = L.gears
    assets, bodies_xml = [], {}
    tooth_info = {}

    def gear_geoms(key, body_center):
        g = G[key]
        p = g.r * g.pitch
        T = Tooth(raw, p, song_pitch, opts, key)
        tooth_info[key] = dict(n=g.n, r=g.r, pitch_len=p, w=T.w, h=T.h, t=T.t, backlash=T.backlash, chamfer=T.c,
                               kind=g.kind)
        out = []
        mesh_name = None
        if T.c > 0:
            mesh_name = f"tooth_{mechanism}_{key}"
            if g.kind == "radial":
                assets.append(_tooth_mesh(mesh_name, T.h, T.w, T.t, T.c))
            else:
                ln = T.h / 2 - g.h0
                assets.append(_tooth_mesh(mesh_name, ln, T.w, T.t, T.c))
        off = _sub(g.center, body_center)
        for k in range(g.n):
            a = g.phase + k * g.pitch
            d = g.dir(a)
            tan = _cross(g.axis, d)
            if g.kind == "radial":
                c = tuple(o + di * g.r for o, di in zip(off, d))
                xa, ya = d, tan
                half = (T.h / 2, T.w / 2, T.t / 2)
            else:  # axial pegs: from the disc face (h0) to h/2 above the pitch plane
                lo, hi = g.h0, T.h / 2
                mid = (lo + hi) / 2
                c = tuple(o + di * g.r + ax * mid for o, di, ax in zip(off, d, g.axis))
                xa, ya = g.axis, tan
                half = ((hi - lo) / 2, T.w / 2, T.t / 2)
            cls = f'name="{key}.t{k}" class="tooth" pos="{_f(*_m(c))}" xyaxes="{_f(*xa, *ya)}"'
            if mesh_name:
                out.append(f'<geom {cls} type="mesh" mesh="{mesh_name}"/>')
            else:
                out.append(f'<geom {cls} type="box" size="{_f(*_m(half))}"/>')
        if g.kind == "radial":
            rim = g.r - T.h / 2 - opts.tip_clear
            za = g.axis
            # zaxis via xyaxes: any u perpendicular to the axis
            out.append(f'<geom name="{key}.rim" class="rim" type="cylinder" pos="{_f(*_m(off))}" '
                       f'xyaxes="{_f(*g.u, *g.v)}" size="{_f(rim * CHI, T.t / 2 * CHI)}"/>')
        return out

    def inertial(mass, r_gyr, axis):
        # A wheel-like body: I about its axis = m k^2, about the others half that.
        i_ax = mass * (r_gyr * CHI) ** 2
        i_o = i_ax / 2 + 1e-3
        diag = [i_o, i_o, i_o]
        idx = max(range(3), key=lambda j: abs(axis[j]))
        diag[idx] = i_ax
        return f'<inertial pos="0 0 0" mass="{mass:.4g}" diaginertia="{_f(*diag)}"/>'

    def ring_mass(r, t, width=0.3):
        """Mass and radius of gyration of a rim of radial width `width` plus 4 spokes (chi)."""
        rim = 2 * math.pi * r * width * t * CHI ** 3 * WOOD
        spokes = 4 * r * 0.2 * t * CHI ** 3 * WOOD
        m = rim + spokes
        k2 = (rim * r ** 2 + spokes * r ** 2 / 3) / m
        return m, math.sqrt(k2)

    body_map = SONG_BODIES if mechanism == "song" else DIFF_BODIES
    info = dict(mechanism=mechanism, root=os.path.abspath(root), joints={}, teeth=tooth_info, opts=opts.as_dict())
    parts = []
    wheel_r = L.wheel_r
    track = L.track

    # Road wheels (prescribed). Body at the wheel centre; joint axis +Y: positive = rolling forward.
    for side, y in (("L", track / 2), ("R", -track / 2)):
        c = (0.0, y, L.axle_z)
        geoms = [x for key in body_map[f"wheel.{side}"] for x in gear_geoms(key, c)]
        parts.append(
            f'<body name="wheel.{side}" pos="{_f(*_m(c))}">{inertial(80, wheel_r * 0.8, (0, 1, 0))}'
            f'<joint name="wheel.{side}" type="hinge" axis="0 1 0" damping="0"/>' + "".join(geoms) + "</body>")
        info["joints"][f"wheel.{side}"] = f"wheel.{side}"

    if mechanism == "song":
        for side in ("L", "R"):
            g = G[f"small.{side}"]
            m, k = ring_mass(g.r, 0.2, width=g.r)  # a solid drum
            geoms = gear_geoms(f"small.{side}", g.center)
            parts.append(
                f'<body name="small.{side}" pos="{_f(*_m(g.center))}">{inertial(m, k, g.axis)}'
                f'<joint name="lift.{side}" type="slide" axis="0 0 1" range="0 {L.lift * CHI + 0.02:.4g}" limited="true" '
                f'damping="200"/>'
                f'<joint name="small.{side}" type="hinge" axis="{_f(*g.axis)}" frictionloss="{opts.free_friction}" damping="0.01"/>'
                + "".join(geoms) + "</body>")
            info["joints"][f"lift.{side}"] = f"lift.{side}"
            info["joints"][f"small.{side}"] = f"small.{side}"
        g = G["big"]
        m, k = ring_mass(g.r, 0.25, width=0.3)
        # the central shaft (8 chi, d 0.3) and the figure add mass but little inertia about the axis
        shaft_m = math.pi * (0.15 * CHI) ** 2 * 8 * CHI * WOOD + 15
        mt = m + shaft_m
        kt = math.sqrt((m * k ** 2 + shaft_m * 0.3 ** 2) / mt)
        info["figure_inertia"] = mt * (kt * CHI) ** 2
        info["figure_mass"] = mt
        parts.append(
            f'<body name="big" pos="{_f(*_m(g.center))}">{inertial(mt, kt, g.axis)}'
            f'<joint name="figure" type="hinge" axis="{_f(*g.axis)}" frictionloss="{opts.figure_friction}" '
            f'damping="{opts.figure_damping}"/>' + "".join(gear_geoms("big", g.center)) + "</body>")
        info["joints"]["figure"] = "figure"
        info["lift"] = L.lift * CHI
        info["mesh_pairs"] = [("wheel.R", "small.R"), ("wheel.L", "small.L"), ("small.R", "big"), ("small.L", "big")]
        info["ratio"] = dict(foot=G["foot.L"].n, small=G["small.L"].n, big=G["big"].n)
    else:
        gA, gB = G["sideA"], G["sideB"]
        for name, g, ring in (("sideA", gA, G["ringA"]), ("sideB", gB, G["ringB"])):
            m, k = ring_mass(g.r, 0.2)
            geoms = gear_geoms(name, g.center) + gear_geoms("ring" + name[-1], g.center)
            parts.append(
                f'<body name="{name}" pos="{_f(*_m(g.center))}">{inertial(m + 3, k, g.axis)}'
                f'<joint name="{name}" type="hinge" axis="{_f(*g.axis)}" frictionloss="{opts.free_friction}" damping="0.01"/>'
                + "".join(geoms) + "</body>")
            info["joints"][name] = name
        # Carrier: a frame turning about the central axis at the pinions' height; carries the figure.
        cc = (0.0, 0.0, L.z_pin)
        shaft_m = math.pi * (0.15 * CHI) ** 2 * 8 * CHI * WOOD + 15
        pin_xml = []
        for i in (0, 1):
            g = G[f"pinion.{i}"]
            m, k = ring_mass(g.r, 0.15, width=g.r)
            pin_xml.append(
                f'<body name="pinion.{i}" pos="{_f(*_m(_sub(g.center, cc)))}">{inertial(m + 0.5, k, g.axis)}'
                f'<joint name="pinion.{i}" type="hinge" axis="{_f(*g.axis)}" frictionloss="{opts.free_friction}" damping="0.01"/>'
                + "".join(gear_geoms(f"pinion.{i}", g.center)) + "</body>")
            info["joints"][f"pinion.{i}"] = f"pinion.{i}"
        carrier_m = shaft_m + 10
        info["figure_inertia"] = carrier_m * (0.4 * CHI) ** 2
        info["figure_mass"] = carrier_m
        parts.append(
            f'<body name="carrier" pos="{_f(*_m(cc))}">{inertial(carrier_m, 0.4, (0, 0, 1))}'
            f'<joint name="figure" type="hinge" axis="0 0 1" frictionloss="{opts.figure_friction}" '
            f'damping="{opts.figure_damping}"/>' + "".join(pin_xml) + "</body>")
        info["joints"]["figure"] = "figure"
        info["mesh_pairs"] = [("wheel.L", "sideA"), ("wheel.R", "sideB"), ("sideA", "pinion.0"), ("sideA", "pinion.1"),
                              ("sideB", "pinion.0"), ("sideB", "pinion.1")]
        info["inputRatio"] = _pv(raw, "differential.inputRatio", 1.0)

    info["wheel_r"] = wheel_r * CHI
    info["track"] = track * CHI
    dt = opts.timestep
    xml = f"""<mujoco model="zhinanche-{mechanism}">
  <compiler angle="radian" autolimits="true"/>
  <option timestep="{dt}" gravity="0 0 -9.81" integrator="implicitfast" cone="elliptic" impratio="1">
    <flag warmstart="enable"/>
  </option>
  <size memory="200M"/>
  <default>
    <geom contype="1" conaffinity="1" condim="3" friction="{opts.friction} 0.005 0.0001"
          solref="{opts.solref} 1" solimp="0.95 0.99 0.0005" density="0" margin="0" gap="0"/>
    <default class="tooth"><geom rgba="0.62 0.42 0.25 1"/></default>
    <default class="rim"><geom rgba="0.5 0.33 0.2 1"/></default>
  </default>
  <asset>
    {"".join(assets)}
  </asset>
  <worldbody>
    <light pos="0 0 6" dir="0 0 -1" directional="true"/>
    <body name="chassis" pos="0 0 0">
      <inertial pos="0 0 1" mass="600" diaginertia="400 400 400"/>
      <joint name="heading" type="hinge" axis="0 0 1"/>
      {"".join(parts)}
    </body>
  </worldbody>
</mujoco>
"""
    info["joints"]["heading"] = "heading"
    return xml, info


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.join(os.path.dirname(__file__), "..", ".."))
    ap.add_argument("--mechanism", default="song")
    ap.add_argument("--chamfer", type=float, default=0.0)
    ap.add_argument("--out")
    a = ap.parse_args()
    xml, info = build(a.root, a.mechanism, Opts(chamfer=a.chamfer))
    if a.out:
        open(a.out, "w").write(xml)
    import mujoco

    m = mujoco.MjModel.from_xml_string(xml)
    print(a.mechanism, "ngeom", m.ngeom, "nbody", m.nbody, "njnt", m.njnt)
    for k, t in info["teeth"].items():
        print(f"  {k:9s} n={t['n']:3d} r={t['r']:.3f} p={t['pitch_len']:.4f} w={t['w']:.4f} h={t['h']:.4f} "
              f"t={t['t']:.3f} backlash={t['backlash']:.4f} chi")

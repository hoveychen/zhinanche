"""Build a MuJoCo model of either chariot's gear train from a checkout's layout.

The gear geometry (centres, axes, pitch radii, tooth counts, rest phases, tooth sections,
rims, which gears mesh) comes from `blender/scripts/lib/layout.py` of the checkout given as
`root`, which reads that checkout's `params/chariot.json`:

- a layout with `--json` (prd/cad-chariot, af674e6 on) gives everything, including the
  tooth section (root width, tip width, thickness, addendum, dedendum) and the rim radii;
- an older layout (main at 16a1781) is imported and its gear objects read; it has peg teeth,
  so the tooth section comes from REPORT §6.3 of the CAD research instead (square block,
  width 0.15 = 0.5 p, length 1.0 p with the pitch circle at mid-length, thickness 0.2) or
  from the `Opts` overrides.

Nothing here repeats layout numbers. Each tooth is a convex prism (a box if its section is
square and uncut): long axis radial (or, on the differential's face rings, axial), tapering
from root width to tip width, constant thickness, optionally with its tip edges and long
edges cut at 45 deg (`Opts.chamfer`). Each radial gear also has its rim as a solid disc at
the tooth root, so a tooth tip that reaches the other gear's rim touches it.

Frame (layout's, the Blender frame): +X forward, +Y left, +Z up, origin on the ground
midway between the wheel contacts. MuJoCo lengths are metres (chi x 0.31) so gravity and
masses are physical. The chassis turns about the vertical through the origin with the
chariot's heading; the road wheels turn about their axle. Both are prescribed (driven
kinematically by sim.py). Every other gear turns only because teeth push it.
"""

import importlib.util
import json
import math
import os
import subprocess
import sys

CHI = 0.31  # m, params units.chiInMeters (Song chi ~ 30.7-31.6 cm)
WOOD = 700.0  # kg/m^3, hardwood (jujube / oak)

KEYS = {
    "song.foot.R": "foot.R", "song.foot.L": "foot.L", "song.small.R": "small.R", "song.small.L": "small.L",
    "song.bigFlat": "big",
    "diff.crown.L": "crown.L", "diff.crown.R": "crown.R", "diff.sideA": "sideA", "diff.sideB": "sideB",
    "diff.sideA.ring": "ringA", "diff.sideB.ring": "ringB", "diff.pinion.0": "pinion.0", "diff.pinion.1": "pinion.1",
}


class Opts:
    """Physics and tooth settings. Lengths in chi unless noted."""

    def __init__(self, **kw):
        # Tooth width at the pitch circle as a fraction of pitch left free: float, or
        # {gear key: fraction, "default": fraction}. None = the layout's teeth as they are
        # (§6.3 block for an old layout). Widths are shifted, keeping the taper.
        self.backlash = None
        self.height = None  # old layout only: tooth length as a fraction of pitch (§6.3: 1.0)
        self.thickness = None  # old layout only: thickness, chi at the Song pitch (§6.3: 0.2)
        self.tip_clear = 0.0  # old layout only: rim this far below the tooth root (chi)
        self.chamfer = 0.0  # chi, 45 deg cut on the tip edges and the long edges (capped at 0.45 x tip width)
        # gear keys whose teeth get a roof: the faces that meet when a small flat wheel drops
        # (top and bottom of a flat wheel's tooth) cut at 45 deg to a ridge along the tooth
        self.ridge = ()
        self.friction = 0.4  # wood on wood, sliding
        self.timestep = 0.0005  # s
        self.solref = 0.002  # s, contact time constant
        self.figure_friction = 0.5  # N m, Coulomb friction of the figure's shaft in its iron cup and collar
        self.figure_damping = 0.5  # N m s / rad
        self.free_friction = 0.05  # N m, other free gears (small flat wheels, side gears, pinions)
        self.clutch_push = 50.0  # N, the pole's push lowering a small flat wheel (plus its own weight)
        self.dwell_lower = None  # s the chariot waits after letting a wheel down (sim.DWELL: 0.5)
        self.latch = False  # once a lowered wheel is fully home, pin it there (a latch; sim.py holds the slide)
        for k, v in kw.items():
            if not hasattr(self, k):
                raise KeyError(k)
            setattr(self, k, v)

    def as_dict(self):
        return dict(self.__dict__)


# Tooth designs tried on main's (peg-tooth) layout. "s63" is REPORT §6.3 as written; A keeps
# its length and thins the teeth until they clear; B shortens them. Backlash values are the
# clearance sweep's minimum (clearance.py --sweep) plus about 0.04 p.
DESIGNS = {
    "layout": dict(),
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


# --------------------------------------------------------------------------- geometry


def _pv(raw, path, default=None):
    node = raw
    for k in path.split("."):
        if not isinstance(node, dict) or k not in node:
            return default
        node = node[k]
    return node["v"] if isinstance(node, dict) and "v" in node else node


def _import_layout(root):
    path = os.path.join(root, "blender", "scripts", "lib", "layout.py")
    name = f"_layout_{abs(hash(os.path.abspath(path)))}"
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[name] = mod
        spec.loader.exec_module(mod)
    return sys.modules[name]


_GEOM_CACHE = {}


def geometry(root, mechanism, opts):
    """Uniform gear description: {key: dict(center, axis, u, r, n, kind, phase, tooth, rim, h0, h1)}."""
    root = os.path.abspath(root)
    raw = json.load(open(os.path.join(root, "params", "chariot.json"), encoding="utf-8"))
    lay = os.path.join(root, "blender", "scripts", "lib", "layout.py")
    ck = (root, os.path.getmtime(lay))
    if ck not in _GEOM_CACHE:
        r = subprocess.run([sys.executable, lay, "--json"], capture_output=True, text=True)
        js = None
        if r.returncode == 0 and r.stdout.lstrip().startswith("{"):
            js = json.loads(r.stdout)
        _GEOM_CACHE[ck] = js
    js = _GEOM_CACHE[ck]
    out = dict(raw=raw, source=None, gears={}, meshes=[])
    if js is not None:
        L = js[mechanism]
        out.update(source="layout.py --json", wheel_r=L["wheelRadius"], track=L["track"], axle_z=L["axleZ"],
                   pitch=L["circularPitch"])
        for g in L["gears"]:
            t = g["tooth"]
            out["gears"][KEYS[g["name"]]] = dict(
                center=tuple(g["center"]), axis=tuple(g["axis"]), u=tuple(g["ref"]), r=g["pitchRadius"],
                n=g["teeth"], kind=g["kind"], phase=math.radians(g["phaseDeg"]),
                tooth=dict(root_w=t["rootWidth"], tip_w=t["tipWidth"], thick=t["thick"], add=t["addendum"],
                           ded=t["dedendum"], roof=t.get("roofDeg", 0.0), tip_chamfer=t.get("tipChamfer", 0.0)),
                rim=g.get("rimOuter"), h0=g.get("h0", 0.0), h1=g.get("h1", 0.0))
        out["meshes"] = [tuple(KEYS[n] for n in m["pair"]) for m in L["meshes"]]
    else:
        mod = _import_layout(root)
        L = mod.layout(mechanism, raw)
        out.update(source="layout.py (import; teeth from §6.3 / Opts)", wheel_r=L.wheel_r, track=L.track,
                   axle_z=L.axle_z, pitch=L.pitch)
        names = {g.name: k for k, g in L.gears.items()}
        for k, g in L.gears.items():
            key = KEYS[g.name]
            p = g.r * g.pitch
            s = p / L.pitch
            h = (opts.height if opts.height is not None else 1.0) * p
            th = opts.thickness * s if opts.thickness is not None else min(0.2, p * 2 / 3)
            w = 0.15 * s
            tooth = dict(root_w=w, tip_w=w, thick=th, add=h / 2, ded=h / 2)
            # face rings: pegs run from the disc face to h/2 past the pitch plane
            face = g.h0 if abs(g.h0) > abs(g.h1) else g.h1
            tip = -math.copysign(h / 2, face) if g.kind == "axial" else 0.0
            out["gears"][key] = dict(center=g.center, axis=g.axis, u=g.u, r=g.r, n=g.n, kind=g.kind, phase=g.phase,
                                     tooth=tooth, rim=g.r - h / 2 - opts.tip_clear, h0=face, h1=tip)
        out["meshes"] = [(KEYS[a], KEYS[b]) for (a, b) in L.contacts]
    out["lift"] = _pv(raw, "song.clutchLift", 0.4)
    # backlash override: shift both widths so the pitch-circle width leaves `b` of the pitch free
    for key, g in out["gears"].items():
        t = g["tooth"]
        p = 2 * math.pi * g["r"] / g["n"]
        if g["kind"] == "radial":
            length, at = t["add"] + t["ded"], t["ded"]
        else:
            lo, hi = sorted((g["h0"], g["h1"]), key=abs, reverse=True)  # root end = farther from the pitch plane
            length, at = abs(g["h1"] - g["h0"]), abs(lo)
        w_pitch = t["root_w"] + (t["tip_w"] - t["root_w"]) * at / length
        b = opts.backlash
        if isinstance(b, dict):
            b = b.get(key, b.get("default"))
        if b is not None:
            shift = p * (1 - b) / 2 - w_pitch
            t["root_w"] += shift
            t["tip_w"] += shift
            w_pitch += shift
        t.update(length=length, pitch_len=p, w_pitch=w_pitch, backlash=p - 2 * w_pitch)
    return out


# --------------------------------------------------------------------------- MJCF


def _f(*xs):
    return " ".join(f"{x:.6g}" for x in xs)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _norm(a):
    n = math.sqrt(sum(x * x for x in a))
    return tuple(x / n for x in a)


def _m(v):
    return tuple(x * CHI for x in v)


def _tooth_mesh(name, L, w_root, w_tip, t, c, ridge=False, roof=45.0):
    """Convex tooth, long axis local x (root at -L/2, tip at +L/2), width y (tapering), thickness z.
    ridge: the +-z faces become `roof`-degree roofs meeting at a ridge on the centre line; with
    c > 0 the tip end is then chamfered too (the last c of the tooth narrows by c on every side,
    layout.py's Song teeth); without a ridge c cuts the tip edges and the four long edges."""
    def hw(x):
        return (w_root + (w_tip - w_root) * (x + L / 2) / L) / 2

    ht = t / 2
    k = math.tan(math.radians(roof))
    pts = []
    if ridge:
        secs = [(x, hw(x), ht) for x in (-L / 2, L / 2 - c)]
        if c > 0:
            secs.append((L / 2, max(hw(L / 2) - c, 1e-3), ht - c))
        for x, h, top in secs:
            r = min(h * k, top * 0.9)
            for sz in (-1, 1):
                pts += [(x, -h, sz * (top - r)), (x, h, sz * (top - r)), (x, 0.0, sz * top)]
        verts = " ".join(_f(*_m(p)) for p in pts)
        return f'<mesh name="{name}" vertex="{verts}"/>'

    for x in (-L / 2, L / 2 - c):
        for sy in (-1, 1):
            for sz in (-1, 1):
                if c > 0:
                    pts += [(x, sy * hw(x), sz * (ht - c)), (x, sy * (hw(x) - c), sz * ht)]
                else:
                    pts.append((x, sy * hw(x), sz * ht))
    if c > 0:
        for sy in (-1, 1):
            for sz in (-1, 1):
                pts.append((L / 2, sy * max(hw(L / 2) - c, 1e-3), sz * (ht - c)))
    verts = " ".join(_f(*_m(p)) for p in pts)
    return f'<mesh name="{name}" vertex="{verts}"/>'


SONG_BODIES = {"wheel.L": ["foot.L"], "wheel.R": ["foot.R"], "small.L": ["small.L"], "small.R": ["small.R"], "big": ["big"]}
DIFF_BODIES = {"wheel.L": ["crown.L"], "wheel.R": ["crown.R"], "sideA": ["sideA", "ringA"], "sideB": ["sideB", "ringB"],
               "pinion.0": ["pinion.0"], "pinion.1": ["pinion.1"]}
BODY_OF = {g: b for m in (SONG_BODIES, DIFF_BODIES) for b, gs in m.items() for g in gs}


def build(root, mechanism, opts=None):
    """Return (xml, info). info names bodies/joints and the meshing pairs for sim.py."""
    opts = opts or Opts()
    geo = geometry(root, mechanism, opts)
    G = geo["gears"]
    assets = []
    tooth_info = {}

    def gear_geoms(key, body_center):
        g = G[key]
        t = g["tooth"]
        cap = min(0.45 * t["tip_w"], 0.45 * t["thick"])
        c = min(max(opts.chamfer, t.get("tip_chamfer", 0.0)), cap)
        ridge = key in opts.ridge or t.get("roof", 0.0) > 0
        if ridge:  # a ridged tooth's tip chamfer comes from the layout only (REPORT §5.4 ran ridge without it)
            c = min(t.get("tip_chamfer", 0.0), cap)
        tooth_info[key] = dict(n=g["n"], r=g["r"], pitch_len=t["pitch_len"], w_pitch=t["w_pitch"], root_w=t["root_w"],
                               tip_w=t["tip_w"], length=t["length"], thick=t["thick"], backlash=t["backlash"],
                               chamfer=c, ridge=ridge, kind=g["kind"], rim=g["rim"])
        box = c == 0 and not ridge and abs(t["root_w"] - t["tip_w"]) < 1e-9
        mesh_name = f"tooth_{mechanism}_{key}"
        if not box:
            assets.append(_tooth_mesh(mesh_name, t["length"], t["root_w"], t["tip_w"], t["thick"], c, ridge,
                                      t.get("roof") or 45.0))
        off = _sub(g["center"], body_center)
        u, ax = _norm(g["u"]), _norm(g["axis"])
        v = _cross(ax, u)
        out = []
        for k in range(g["n"]):
            a = g["phase"] + k * 2 * math.pi / g["n"]
            d = tuple(math.cos(a) * ui + math.sin(a) * vi for ui, vi in zip(u, v))
            tan = _cross(ax, d)
            if g["kind"] == "radial":
                mid = g["r"] - t["ded"] + t["length"] / 2
                cen = tuple(o + di * mid for o, di in zip(off, d))
                xa = d
            else:
                root_h, tip_h = sorted((g["h0"], g["h1"]), key=abs, reverse=True)
                mid = (g["h0"] + g["h1"]) / 2
                cen = tuple(o + di * g["r"] + a_ * mid for o, di, a_ in zip(off, d, ax))
                xa = ax if tip_h > root_h else tuple(-x for x in ax)  # local +x points root -> tip
            cls = f'name="{key}.t{k}" class="tooth" pos="{_f(*_m(cen))}" xyaxes="{_f(*xa, *tan)}"'
            if box:
                out.append(f'<geom {cls} type="box" size="{_f(*_m((t["length"] / 2, t["root_w"] / 2, t["thick"] / 2)))}"/>')
            else:
                out.append(f'<geom {cls} type="mesh" mesh="{mesh_name}"/>')
        if g["kind"] == "radial" and g["rim"]:
            out.append(f'<geom name="{key}.rim" class="rim" type="cylinder" pos="{_f(*_m(off))}" '
                       f'xyaxes="{_f(*u, *v)}" size="{_f(g["rim"] * CHI, t["thick"] / 2 * CHI)}"/>')
        return out

    def inertial(mass, r_gyr, axis):
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
    info = dict(mechanism=mechanism, root=os.path.abspath(root), source=geo["source"], joints={}, teeth=tooth_info,
                opts=opts.as_dict())
    parts = []
    wheel_r, track = geo["wheel_r"], geo["track"]
    shaft_m = math.pi * (0.15 * CHI) ** 2 * 8 * CHI * WOOD + 15  # central shaft (8 chi, d 0.3) + figure

    for side, y in (("L", track / 2), ("R", -track / 2)):
        c = (0.0, y, geo["axle_z"])
        geoms = [x for key in body_map[f"wheel.{side}"] for x in gear_geoms(key, c)]
        parts.append(
            f'<body name="wheel.{side}" pos="{_f(*_m(c))}">{inertial(80, wheel_r * 0.8, (0, 1, 0))}'
            f'<joint name="wheel.{side}" type="hinge" axis="0 1 0"/>' + "".join(geoms) + "</body>")

    if mechanism == "song":
        for side in ("L", "R"):
            g = G[f"small.{side}"]
            m, k = ring_mass(g["r"], 0.2, width=g["r"])  # a solid drum
            parts.append(
                f'<body name="small.{side}" pos="{_f(*_m(g["center"]))}">{inertial(m, k, g["axis"])}'
                f'<joint name="lift.{side}" type="slide" axis="0 0 1" range="0 {geo["lift"] * CHI + 0.02:.4g}" damping="200"/>'
                f'<joint name="small.{side}" type="hinge" axis="{_f(*g["axis"])}" frictionloss="{opts.free_friction}" damping="0.01"/>'
                + "".join(gear_geoms(f"small.{side}", g["center"])) + "</body>")
        g = G["big"]
        m, k = ring_mass(g["r"], 0.25, width=0.3)
        mt = m + shaft_m
        kt = math.sqrt((m * k ** 2 + shaft_m * 0.3 ** 2) / mt)
        info["figure_inertia"] = mt * (kt * CHI) ** 2
        parts.append(
            f'<body name="big" pos="{_f(*_m(g["center"]))}">{inertial(mt, kt, g["axis"])}'
            f'<joint name="figure" type="hinge" axis="{_f(*g["axis"])}" frictionloss="{opts.figure_friction}" '
            f'damping="{opts.figure_damping}"/>' + "".join(gear_geoms("big", g["center"])) + "</body>")
        info["lift"] = geo["lift"] * CHI
        info["ratio"] = dict(foot=G["foot.L"]["n"], small=G["small.L"]["n"], big=G["big"]["n"])
    else:
        for name, ring in (("sideA", "ringA"), ("sideB", "ringB")):
            g = G[name]
            m, k = ring_mass(g["r"], 0.2)
            geoms = gear_geoms(name, g["center"]) + gear_geoms(ring, g["center"])
            parts.append(
                f'<body name="{name}" pos="{_f(*_m(g["center"]))}">{inertial(m + 3, k, g["axis"])}'
                f'<joint name="{name}" type="hinge" axis="{_f(*g["axis"])}" frictionloss="{opts.free_friction}" damping="0.01"/>'
                + "".join(geoms) + "</body>")
        zp = G["pinion.0"]["center"][2]
        cc = (0.0, 0.0, zp)
        pin_xml = []
        for i in (0, 1):
            g = G[f"pinion.{i}"]
            m, k = ring_mass(g["r"], 0.15, width=g["r"])
            pin_xml.append(
                f'<body name="pinion.{i}" pos="{_f(*_m(_sub(g["center"], cc)))}">{inertial(m + 0.5, k, g["axis"])}'
                f'<joint name="pinion.{i}" type="hinge" axis="{_f(*g["axis"])}" frictionloss="{opts.free_friction}" damping="0.01"/>'
                + "".join(gear_geoms(f"pinion.{i}", g["center"])) + "</body>")
        carrier_m = shaft_m + 10
        info["figure_inertia"] = carrier_m * (0.4 * CHI) ** 2
        parts.append(
            f'<body name="carrier" pos="{_f(*_m(cc))}">{inertial(carrier_m, 0.4, (0, 0, 1))}'
            f'<joint name="figure" type="hinge" axis="0 0 1" frictionloss="{opts.figure_friction}" '
            f'damping="{opts.figure_damping}"/>' + "".join(pin_xml) + "</body>")
        # chariot.js: sideA = k wheelL, sideB = -k wheelR, k = crown teeth / flat teeth
        info["inputRatio"] = G["crown.L"]["n"] / G["sideA"]["n"]
        info["inputRatioR"] = G["crown.R"]["n"] / G["sideB"]["n"]

    info["mesh_pairs"] = sorted({tuple(sorted((BODY_OF[a], BODY_OF[b]))) for a, b in geo["meshes"]})
    info["wheel_r"] = wheel_r * CHI
    info["track"] = track * CHI
    xml = f"""<mujoco model="zhinanche-{mechanism}">
  <compiler angle="radian" autolimits="true"/>
  <option timestep="{opts.timestep}" gravity="0 0 -9.81" integrator="implicitfast" cone="elliptic" impratio="1"/>
  <size memory="200M"/>
  <default>
    <!-- margin and gap stay 0: with a margin the box-box collider hands the solver pairs that are
         several mm apart and they push (that made phantom jams) -->
    <geom contype="1" conaffinity="1" condim="3" friction="{opts.friction} 0.005 0.0001"
          solref="{opts.solref} 1" solimp="0.95 0.99 0.0005" density="0" margin="0" gap="0"/>
    <default class="tooth"><geom rgba="0.62 0.42 0.25 1"/></default>
    <default class="rim"><geom rgba="0.5 0.33 0.2 1"/></default>
  </default>
  <visual><global offwidth="1280" offheight="960"/></visual>
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
    return xml, info


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.join(os.path.dirname(__file__), "..", ".."))
    ap.add_argument("--mechanism", default="song")
    ap.add_argument("--design", default="layout")
    ap.add_argument("--chamfer", type=float, default=0.0)
    ap.add_argument("--out")
    a = ap.parse_args()
    xml, info = build(a.root, a.mechanism, design(a.design, chamfer=a.chamfer))
    if a.out:
        open(a.out, "w").write(xml)
    import mujoco

    m = mujoco.MjModel.from_xml_string(xml)
    print(a.mechanism, info["source"], "ngeom", m.ngeom, "nbody", m.nbody, "njnt", m.njnt, "meshes", info["mesh_pairs"])
    for k, t in info["teeth"].items():
        print(f"  {k:9s} n={t['n']:3d} r={t['r']:.3f} p={t['pitch_len']:.4f} root={t['root_w']:.4f} tip={t['tip_w']:.4f} "
              f"w@pitch={t['w_pitch']:.4f} len={t['length']:.3f} thick={t['thick']:.3f} backlash={t['backlash']:.4f} "
              f"({t['backlash'] / t['pitch_len']:.0%} p) rim={t['rim']}")

"""Gear and running-gear layout of both chariots (pure Python, no bpy).

Blender frame, lengths in chi: +X forward, +Y left, +Z up; origin on the ground midway
between the two wheel contact points. glTF (x, y, z) = Blender (x, z, -y).

Every gear is a wooden block-tooth wheel (params "gear"): radial teeth of trapezoid
section let through the rim. A gear's teeth are numbered from 0 (the marker tooth);
tooth k sits at angle phase + k * 2pi / n about the gear's rotation axis, measured from
its reference direction u (v = axis x u). A positive gear angle is a right-handed
rotation about `axis`, the same axis the scene uses (contract: extras.axis).

`mesh(g1, g2, contact, ratio)` places g2's teeth in the gaps of g1 at the contact point
and checks that the geometry turns g2 by `ratio` x g1's angle, the ratio js/sim/chariot.js
uses. A wrong sense or a wrong radius therefore fails the build, not the lesson.

Everything another tool needs to rebuild the mechanism (tooth sizes, pitch radii, centre
distances, axle and hub positions) is here or in params/chariot.json, not in the
modelling code: `layout(m).describe()` dumps it as JSON (python3 layout.py).
"""

import json
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PARAMS = os.path.join(ROOT, "params", "chariot.json")

X, Y, Z = (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def mul(a, s):
    return tuple(x * s for x in a)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a):
    n = math.sqrt(dot(a, a))
    return mul(a, 1.0 / n)


def dist(a, b):
    return math.sqrt(dot(sub(a, b), sub(a, b)))


def wrap(a, period):
    """Wrap a into [-period/2, period/2)."""
    return (a + period / 2) % period - period / 2


def load():
    with open(PARAMS, encoding="utf-8") as f:
        return json.load(f)


def pv(raw, path):
    node = raw
    for k in path.split("."):
        node = node[k]
    return node["v"]


class Tooth:
    """Block tooth dimensions: trapezoid in the gear plane (root_w at the rim, tip_w at
    the tip), `thick` along the axis; the tip stands `add` beyond the pitch circle, the
    rim's outer edge lies `ded` inside it, the root shows `tenon` inside the rim.
    `roof` > 0 (degrees): the two faces across `thick` are cut to a ridge along the tooth at
    that angle (a hexagonal section); `chamfer` (chi): the tip's edges cut at 45 deg, and on
    a tooth without a roof the four long edges too (research/physics/REPORT.md §5.4)."""

    def __init__(self, root_w, tip_w, thick, add, ded, tenon=0.0, roof=0.0, chamfer=0.0):
        self.root_w, self.tip_w, self.thick, self.add, self.ded, self.tenon = root_w, tip_w, thick, add, ded, tenon
        self.roof, self.chamfer = roof, chamfer
        assert chamfer < tip_w / 2, "tip chamfer wider than half the tip"

    def shaped(self, roof=None, chamfer=None):
        """A copy with another roof angle and/or tip chamfer."""
        return Tooth(self.root_w, self.tip_w, self.thick, self.add, self.ded, self.tenon,
                     self.roof if roof is None else roof, self.chamfer if chamfer is None else chamfer)

    def width_at(self, s):
        """Tangential width at a fraction s of the way from the rim (0) to the tip (1)."""
        return self.root_w + (self.tip_w - self.root_w) * s


class Gear:
    """A block-tooth wheel. kind 'radial': teeth lie in the gear plane from radius r0 to r1.
    kind 'axial': teeth stand parallel to the axis at the pitch radius, from h0 to h1."""

    def __init__(self, name, center, axis, u, r, n, kind, tooth, rim=0.0, r0=None, r1=None, h0=0.0, h1=0.0):
        self.name, self.center, self.axis, self.u = name, center, norm(axis), norm(u)
        assert abs(dot(self.axis, self.u)) < 1e-9, name
        self.v = cross(self.axis, self.u)
        self.r, self.n, self.kind, self.tooth, self.rim = r, n, kind, tooth, rim
        if kind == "radial":
            self.r0 = r - tooth.ded - rim - tooth.tenon if r0 is None else r0
            self.r1 = r + tooth.add if r1 is None else r1
        self.h0, self.h1 = h0, h1
        self.phase = 0.0
        self.pitch = 2 * math.pi / n

    @property
    def rim_outer(self):
        return self.r - self.tooth.ded

    @property
    def rim_inner(self):
        return self.r - self.tooth.ded - self.rim

    @property
    def tip_r(self):
        return self.r + self.tooth.add

    def dir(self, ang):
        return add(mul(self.u, math.cos(ang)), mul(self.v, math.sin(ang)))

    def tangent(self, ang):
        return add(mul(self.u, -math.sin(ang)), mul(self.v, math.cos(ang)))

    def point(self, ang, radius, h=0.0):
        return add(add(self.center, mul(self.dir(ang), radius)), mul(self.axis, h))

    def angle_of(self, p):
        d = sub(p, self.center)
        return math.atan2(dot(d, self.v), dot(d, self.u))

    def teeth(self):
        """[(p0, p1)] tooth root and tip points at rest, tooth 0 first."""
        out = []
        for k in range(self.n):
            a = self.phase + k * self.pitch
            if self.kind == "radial":
                out.append((self.point(a, self.r0), self.point(a, self.r1)))
            else:
                out.append((self.point(a, self.r, self.h0), self.point(a, self.r, self.h1)))
        return out

    def describe(self):
        t = self.tooth
        d = {"name": self.name, "kind": self.kind, "teeth": self.n, "pitchRadius": self.r, "center": self.center,
             "axis": self.axis, "ref": self.u, "phaseDeg": math.degrees(self.phase), "circularPitch": self.r * self.pitch,
             "tooth": {"rootWidth": t.root_w, "tipWidth": t.tip_w, "thick": t.thick, "addendum": t.add, "dedendum": t.ded, "tenon": t.tenon,
                       "roofDeg": t.roof, "tipChamfer": t.chamfer}}
        if self.kind == "radial":
            d.update(rimOuter=self.rim_outer, rimInner=self.rim_inner, tipRadius=self.tip_r, rootRadius=self.r0)
        else:
            d.update(h0=self.h0, h1=self.h1)
        return d


def mesh(g1, g2, contact, ratio):
    """Phase g2 so its teeth fill g1's gaps at `contact`; assert the kinematic ratio a2/a1."""
    d1 = norm(sub(contact, g1.center))
    d1 = norm(sub(d1, mul(g1.axis, dot(d1, g1.axis))))
    d2 = sub(contact, g2.center)
    d2 = norm(sub(d2, mul(g2.axis, dot(d2, g2.axis))))
    # The contact points must be at the pitch circles.
    r1 = math.sqrt(dot(sub(contact, g1.center), sub(contact, g1.center)) - dot(sub(contact, g1.center), g1.axis) ** 2)
    r2 = math.sqrt(dot(sub(contact, g2.center), sub(contact, g2.center)) - dot(sub(contact, g2.center), g2.axis) ** 2)
    assert abs(r1 - g1.r) < 1e-6 and abs(r2 - g2.r) < 1e-6, (g1.name, g2.name, r1, r2)
    t = cross(g1.axis, d1)  # where g1's contact point moves for a positive angle
    s2 = dot(cross(g2.axis, d2), t)
    assert abs(abs(s2) - 1.0) < 1e-6, f"{g1.name}/{g2.name}: contact is not tangent ({s2})"
    sigma2 = 1.0 if s2 > 0 else -1.0
    geom_ratio = sigma2 * g1.r / g2.r
    assert abs(geom_ratio - ratio) < 1e-9, f"{g1.name}->{g2.name}: geometry gives {geom_ratio}, sim wants {ratio}"
    assert abs(g1.r * g1.pitch - g2.r * g2.pitch) < 1e-9, f"{g1.name}/{g2.name}: tooth pitch differs"
    a1 = g1.angle_of(contact)
    delta1 = wrap(g1.phase - a1, g1.pitch)  # g1's nearest tooth, ahead of the contact
    gap2 = g2.angle_of(contact) + sigma2 * g1.r * delta1 / g2.r
    return (gap2 + g2.pitch / 2) % g2.pitch


def mesh_ok(g1, g2, contact, ratio):
    """True if g2's current phase already fills g1's gaps at contact (mod one pitch)."""
    want = mesh(g1, g2, contact, ratio)
    return abs(wrap(g2.phase - want, g2.pitch)) < 1e-9


# --------------------------------------------------------------------------- common


class Common:
    def __init__(self, raw, mech):
        s = raw["song"]
        self.raw = raw
        self.wheel_r = pv(raw, f"{mech}.wheelDiameter") / 2
        self.track = pv(raw, f"{mech}.track")
        self.axle_z = self.wheel_r
        # Tooth pitch from the documented Song gears: pi * 2.4 / 24 = 0.314 chi ("齒間相去三寸").
        self.pitch = math.pi * s["footGearDiameter"]["v"] / s["footGearTeeth"]["v"]
        g = raw["gear"]
        self.tooth = Tooth(g["toothRootWidth"]["v"], g["toothTipWidth"]["v"], g["toothThick"]["v"],
                           g["toothAddendum"]["v"], g["toothDedendum"]["v"], g["toothTenon"]["v"])
        self.tooth_small = Tooth(g["toothRootWidth"]["v"], g["toothTipWidth"]["v"], g["toothThickSmall"]["v"],
                                 g["toothAddendum"]["v"], g["toothDedendum"]["v"], g["toothTenon"]["v"])
        self.rim_big, self.rim_foot = g["rimWidthBig"]["v"], g["rimWidthFoot"]["v"]
        self.rim_t = g["rimThickBig"]["v"]
        self.disc_small = g["discThickSmall"]["v"]
        self.shaft_top = raw["model"]["shaftTopHeight"]["v"]
        self.shaft_r = pv(raw, "song.centralShaftDiameter") / 2
        self.deck_z = raw["model"]["deckHeight"]["v"]
        # The running gear: wheel planes, hub ends, axle (params "wheel").
        w = raw["wheel"]
        self.dish = w["dish"]["v"]
        self.hub_len = w["hubLength"]["v"]
        self.hub_in = w["hubInnerLength"]["v"]
        # The felloe's middle plane is the track plane; the spoke ring on the hub lies
        # `dish` inside it (the spokes lean outward, the wheel is a shallow dish).
        self.felloe_y = self.track / 2
        self.spoke_y = self.felloe_y - self.dish
        self.hub_y0 = self.spoke_y - self.hub_in                     # hub's inner end
        self.hub_y1 = self.spoke_y + (self.hub_len - self.hub_in)    # hub's outer end
        self.axle_r = w["axleDiameter"]["v"] / 2
        self.bore_in, self.bore_out = w["boreInner"]["v"] / 2, w["boreOuter"]["v"] / 2
        self.cap_len = w["capLength"]["v"]
        self.gear_room_y = raw["body"]["widthBetweenWheels"]["v"] / 2   # outer face of the lower side boards
        assert self.gear_room_y < self.hub_y0 - 0.02, "the gear room's boards must clear the hubs' inner ends"

    def radius(self, teeth):
        return teeth * self.pitch / (2 * math.pi)

    def radial(self, name, center, axis, u, teeth, rim, tooth=None, r=None):
        r = self.radius(teeth) if r is None else r
        return Gear(name, center, axis, u, r, teeth, "radial", tooth or self.tooth, rim)

    def describe(self):
        return {
            "mechanism": self.mechanism,
            "frame": "Blender: +X forward, +Y left, +Z up, chi; glTF (x, y, z) = (x, z, -y)",
            "wheelRadius": self.wheel_r, "track": self.track, "axleZ": self.axle_z,
            "wheel": {"felloeY": self.felloe_y, "spokeRingY": self.spoke_y, "hubInnerY": self.hub_y0, "hubOuterY": self.hub_y1,
                      "axleRadius": self.axle_r, "boreInnerRadius": self.bore_in, "boreOuterRadius": self.bore_out, "capLength": self.cap_len},
            "shaft": {"x": self.shaft_x, "radius": self.shaft_r, "bottomZ": self.shaft_bottom, "topZ": self.shaft_top},
            "circularPitch": self.pitch,
            "gears": [g.describe() for g in self.gears.values()],
            "meshes": [{"pair": list(k), "contact": c, "centreDistance": dist(self.gears_by_name[k[0]].center, self.gears_by_name[k[1]].center)}
                       for k, c in self.contacts.items()],
        }

    @property
    def gears_by_name(self):
        return {g.name: g for g in self.gears.values()}


# --------------------------------------------------------------------------- Song (Yan Su)


class SongLayout(Common):
    """Yan Su's clutch train. Turning left lowers the right small flat wheel onto the top of
    the right foot gear and the rim of the big flat wheel, and vice versa."""

    mechanism = "song"

    def __init__(self, raw):
        super().__init__(raw, "song")
        s = raw["song"]
        self.r_foot = s["footGearDiameter"]["v"] / 2
        self.r_small = s["smallFlatDiameter"]["v"] / 2
        self.r_big = s["bigFlatDiameter"]["v"] / 2
        n_foot, n_small, n_big = s["footGearTeeth"]["v"], s["smallFlatTeeth"]["v"], s["bigFlatTeeth"]["v"]
        # The clutch's teeth (research/physics/REPORT.md §5.4): every tooth's tip chamfered; the
        # flat wheels' teeth, which meet when a small wheel drops, roofed top and bottom.
        gp = raw["gear"]
        chamfer, roof = gp["toothTipChamfer"]["v"], gp["toothRoofAngle"]["v"]
        tooth_foot = self.tooth.shaped(chamfer=chamfer)
        tooth_small = self.tooth_small.shaped(roof=roof, chamfer=chamfer)
        tooth_big = self.tooth.shaped(roof=roof, chamfer=chamfer)
        for r, n in ((self.r_foot, n_foot), (self.r_small, n_small), (self.r_big, n_big)):
            assert abs(self.radius(n) - r) < 1e-9, "Song diameters and tooth counts give one pitch"
        self.foot_y = s["footGearPlane"]["v"]
        # The foot gear rides on the hub's inner segment ("附足"): its rim must lie on the hub.
        assert self.hub_y0 + 0.05 < self.foot_y - self.tooth.thick / 2 and self.foot_y + self.tooth.thick / 2 < self.spoke_y - 0.17, \
            "the foot gear must sit on the hub between its inner end and the spokes"
        self.lift = s["clutchLift"]["v"]
        self.mesh_z = self.axle_z + self.r_foot           # top of the foot gear
        self.small_y = self.foot_y - self.r_small          # small wheel touches the foot gear on its outer side
        self.big_x = math.sqrt((self.r_big + self.r_small) ** 2 - self.small_y ** 2)
        self.shaft_x = self.big_x
        self.shaft_bottom = self.shaft_top - pv(raw, "song.centralShaftHeight")
        zc = self.axle_z
        g = {}
        g["foot.R"] = self.radial("song.foot.R", (0.0, -self.foot_y, zc), Y, Z, n_foot, self.rim_foot, tooth_foot)
        g["foot.L"] = self.radial("song.foot.L", (0.0, self.foot_y, zc), Y, Z, n_foot, self.rim_foot, tooth_foot)
        # the small wheels are solid discs: the tooth root is let deep into the disc
        g["small.R"] = self.radial("song.small.R", (0.0, -self.small_y, self.mesh_z), Z, X, n_small, 0.25, tooth_small)
        g["small.L"] = self.radial("song.small.L", (0.0, self.small_y, self.mesh_z), Z, X, n_small, 0.25, tooth_small)
        g["big"] = self.radial("song.bigFlat", (self.big_x, 0.0, self.mesh_z), Z, X, n_big, self.rim_big, tooth_big)
        self.gears = g
        self.contacts = {}

        def c_big(side):
            sm = g["small." + side]
            return add(sm.center, mul(norm(sub(g["big"].center, sm.center)), self.r_small))

        ft = {"R": (0.0, -self.foot_y, self.mesh_z), "L": (0.0, self.foot_y, self.mesh_z)}
        foot_to_small = n_foot / n_small
        small_to_big = -n_small / n_big
        # chariot.js: smallR = +2 footR, smallL = -2 footL, bigFlat = -small / 4 (either side)
        g["foot.R"].phase = 0.0  # marker tooth at the top, where it meets the small wheel
        g["small.R"].phase = mesh(g["foot.R"], g["small.R"], ft["R"], +foot_to_small)
        g["big"].phase = mesh(g["small.R"], g["big"], c_big("R"), small_to_big)
        g["small.L"].phase = mesh(g["big"], g["small.L"], c_big("L"), 1 / small_to_big)
        g["foot.L"].phase = mesh(g["small.L"], g["foot.L"], ft["L"], 1 / -foot_to_small)
        self.contacts = {
            ("song.foot.R", "song.small.R"): ft["R"],
            ("song.foot.L", "song.small.L"): ft["L"],
            ("song.small.R", "song.bigFlat"): c_big("R"),
            ("song.small.L", "song.bigFlat"): c_big("L"),
        }
        # Raised, a small wheel must clear the teeth it meshes with by more than a tooth's height.
        assert self.lift > self.tooth_small.thick / 2 + self.tooth.thick / 2 + 0.05, "clutch lift too small"


# --------------------------------------------------------------------------- differential


class DiffLayout(Common):
    """Lanchester-style differential (a 20th-century hypothesis, not in the Song texts).

    Each road wheel carries a vertical crown wheel whose BOTTOM teeth drive a horizontal gear
    of the same size on the central vertical axis, so the ratio is exactly 1. Meshing at the
    bottom gives the senses the sim needs: forward motion turns the left train
    counter-clockwise (sideA = +wheelL) and the right train clockwise (sideB = -wheelR).
    The two horizontal gears differ in size, so they sit at different heights
    (z = axle - radius); between them a block-tooth differential averages them on the
    carrier, which carries the figure's shaft."""

    mechanism = "differential"

    def __init__(self, raw):
        super().__init__(raw, "differential")
        d = raw["differential"]
        self.n_left, self.n_right = d["crownLeftTeeth"]["v"], d["crownRightTeeth"]["v"]
        self.n_flat_left, self.n_flat_right = d["flatLeftTeeth"]["v"], d["flatRightTeeth"]["v"]
        # The ratio the figure needs is wheel diameter / track; the trains give crown / flat.
        want = (2 * self.wheel_r) / self.track
        for n_c, n_f in ((self.n_left, self.n_flat_left), (self.n_right, self.n_flat_right)):
            assert abs(n_c / n_f - want) < 1e-12, f"differential: crown {n_c} / flat {n_f} must equal D / track = {want}"
        self.r_left, self.r_right = self.radius(self.n_left), self.radius(self.n_right)
        assert self.r_left > self.r_right, "the left (lower) train must be the larger one"
        self.n_side, self.n_pin = d["sideGearTeeth"]["v"], d["pinionTeeth"]["v"]
        self.r_side = d["sideGearPitchRadius"]["v"]
        self.r_pin = self.r_side * self.n_pin / self.n_side
        self.small_tooth = Tooth(d["diffToothRootWidth"]["v"], d["diffToothTipWidth"]["v"], d["diffToothThick"]["v"],
                                 d["diffToothAddendum"]["v"], d["diffToothDedendum"]["v"])
        zc = self.axle_z
        self.zA = zc - self.r_left      # plane of the left horizontal gear (sideA)
        self.zB = zc - self.r_right     # plane of the right horizontal gear (sideB)
        self.disc_t = self.rim_t
        self.z_pin = (self.zA + self.zB) / 2
        self.zA_pitch = self.z_pin - self.r_pin   # side gear A's tooth pitch plane
        self.zB_pitch = self.z_pin + self.r_pin
        self.shaft_x = 0.0
        self.shaft_bottom = 0.55
        # the crown wheels sit just inside the hubs' inner ends, on their half axles
        self.crown_y = {"L": self.r_left, "R": self.r_right}
        assert self.r_left + self.tooth.thick / 2 < self.hub_y0 - 0.02, "left crown wheel runs into the hub"
        assert self.r_left + self.tooth.thick / 2 < self.gear_room_y - 0.03, "left crown wheel runs into the side board"
        g = {}
        g["crown.L"] = self.radial("diff.crown.L", (0.0, self.r_left, zc), Y, Z, self.n_left, self.rim_foot)
        g["crown.R"] = self.radial("diff.crown.R", (0.0, -self.r_right, zc), Y, Z, self.n_right, 0.25)
        g["sideA"] = self.radial("diff.sideA", (0.0, 0.0, self.zA), Z, X, self.n_flat_left, self.rim_big)
        g["sideB"] = self.radial("diff.sideB", (0.0, 0.0, self.zB), Z, X, self.n_flat_right, 0.25)
        a_face = self.zA + self.disc_t / 2
        b_face = self.zB - self.disc_t / 2
        st = self.small_tooth
        g["ringA"] = Gear("diff.sideA.ring", (0.0, 0.0, self.zA_pitch), Z, X, self.r_side, self.n_side, "axial",
                          st, h0=a_face - self.zA_pitch - 0.04, h1=st.add)
        g["ringB"] = Gear("diff.sideB.ring", (0.0, 0.0, self.zB_pitch), Z, X, self.r_side, self.n_side, "axial",
                          st, h0=-st.add, h1=b_face - self.zB_pitch + 0.04)
        root = self.r_pin - st.ded     # the pinion disc's radius
        g["pinion.0"] = Gear("diff.pinion.0", (self.r_side, 0.0, self.z_pin), X, Z, self.r_pin, self.n_pin, "radial",
                             st, r0=root - 0.06, r1=self.r_pin + st.add)
        g["pinion.1"] = Gear("diff.pinion.1", (-self.r_side, 0.0, self.z_pin), (-1.0, 0.0, 0.0), Z, self.r_pin,
                             self.n_pin, "radial", st, r0=root - 0.06, r1=self.r_pin + st.add)
        self.pin_disc_r = root
        assert self.zA_pitch - self.r_pin - 0 > 0
        # Clearances between the pinions and the faces of the two horizontal gears.
        assert self.z_pin - (self.r_pin + st.add) - a_face > 0.05, "pinion too close to gear A"
        assert b_face - (self.z_pin + self.r_pin + st.add) > 0.05, "pinion too close to gear B"
        assert self.z_pin - root - (self.zA_pitch + st.add) > 0.03, "pinion disc hits A's teeth"
        assert (self.zB_pitch - st.add) - (self.z_pin + root) > 0.03, "pinion disc hits B's teeth"
        self.gears = g
        cL = (0.0, self.r_left, self.zA)
        cR = (0.0, -self.r_right, self.zB)
        pA0, pB0 = (self.r_side, 0.0, self.zA_pitch), (self.r_side, 0.0, self.zB_pitch)
        pA1, pB1 = (-self.r_side, 0.0, self.zA_pitch), (-self.r_side, 0.0, self.zB_pitch)
        # chariot.js: sideA = +wheelL, sideB = -wheelR; with the carrier held,
        # pinion = (sideA - sideB) / 2 * 16 / 8, i.e. +2 x sideA and -2 x sideB.
        side_to_pin = self.n_side / self.n_pin
        g["crown.L"].phase = 0.0
        g["sideA"].phase = mesh(g["crown.L"], g["sideA"], cL, +want)
        g["ringA"].phase = g["sideA"].phase
        g["pinion.0"].phase = mesh(g["ringA"], g["pinion.0"], pA0, +side_to_pin)
        g["pinion.1"].phase = mesh(g["ringA"], g["pinion.1"], pA1, +side_to_pin)
        g["ringB"].phase = mesh(g["pinion.0"], g["ringB"], pB0, -1 / side_to_pin)
        assert mesh_ok(g["pinion.1"], g["ringB"], pB1, -1 / side_to_pin), "pinions disagree on side gear B"
        g["sideB"].phase = 0.0
        g["crown.R"].phase = mesh(g["sideB"], g["crown.R"], cR, -1 / want)
        self.contacts = {
            ("diff.crown.L", "diff.sideA"): cL,
            ("diff.crown.R", "diff.sideB"): cR,
            ("diff.sideA.ring", "diff.pinion.0"): pA0,
            ("diff.sideA.ring", "diff.pinion.1"): pA1,
            ("diff.sideB.ring", "diff.pinion.0"): pB0,
            ("diff.sideB.ring", "diff.pinion.1"): pB1,
        }


def layout(mechanism, raw=None):
    raw = raw or load()
    return SongLayout(raw) if mechanism == "song" else DiffLayout(raw)


if __name__ == "__main__":
    import sys
    if "--json" in sys.argv:
        print(json.dumps({m: layout(m).describe() for m in ("song", "differential")}, indent=1))
    else:
        for m in ("song", "differential"):
            L = layout(m)
            print(m, "shaft_x", round(L.shaft_x, 4), "hub y", round(L.hub_y0, 3), "→", round(L.hub_y1, 3))
            for k, g in L.gears.items():
                print(f"  {g.name:18s} r={g.r:.4f} n={g.n:3d} c={tuple(round(c, 4) for c in g.center)} phase={math.degrees(g.phase):.3f}")

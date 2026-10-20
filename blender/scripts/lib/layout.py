"""Gear layout of both chariots (pure Python, no bpy).

Blender frame, lengths in chi: +X forward, +Y left, +Z up; origin on the ground midway
between the two wheel contact points. glTF (x, y, z) = Blender (x, z, -y).

Every gear is a wooden peg wheel. A gear's pegs are numbered from 0 (the marker peg);
peg k sits at angle phase + k * 2pi / n about the gear's rotation axis, measured from its
reference direction u (v = axis x u). A positive gear angle is a right-handed rotation
about `axis`, the same axis the scene uses (contract: extras.axis).

`mesh(g1, g2, contact, ratio)` places g2's pegs in the gaps of g1 at the contact point
and checks that the geometry turns g2 by `ratio` x g1's angle, the ratio js/sim/chariot.js
uses. A wrong sense or a wrong radius therefore fails the build, not the lesson.
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


class Gear:
    """A peg wheel. kind 'radial': pegs lie in the gear plane from radius r0 to r1.
    kind 'axial': pegs stand parallel to the axis at the pitch radius, from h0 to h1."""

    def __init__(self, name, center, axis, u, r, n, kind, peg_d, r0=0.0, r1=0.0, h0=0.0, h1=0.0):
        self.name, self.center, self.axis, self.u = name, center, norm(axis), norm(u)
        assert abs(dot(self.axis, self.u)) < 1e-9, name
        self.v = cross(self.axis, self.u)
        self.r, self.n, self.kind, self.peg_d = r, n, kind, peg_d
        self.r0, self.r1, self.h0, self.h1 = r0, r1, h0, h1
        self.phase = 0.0
        self.pitch = 2 * math.pi / n

    def dir(self, ang):
        return add(mul(self.u, math.cos(ang)), mul(self.v, math.sin(ang)))

    def point(self, ang, radius, h=0.0):
        return add(add(self.center, mul(self.dir(ang), radius)), mul(self.axis, h))

    def angle_of(self, p):
        d = sub(p, self.center)
        return math.atan2(dot(d, self.v), dot(d, self.u))

    def pegs(self):
        """[(p0, p1)] peg end points at rest, peg 0 first."""
        out = []
        for k in range(self.n):
            a = self.phase + k * self.pitch
            if self.kind == "radial":
                out.append((self.point(a, self.r0), self.point(a, self.r1)))
            else:
                out.append((self.point(a, self.r, self.h0), self.point(a, self.r, self.h1)))
        return out


def mesh(g1, g2, contact, ratio):
    """Phase g2 so its pegs fill g1's gaps at `contact`; assert the kinematic ratio a2/a1."""
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
    assert abs(g1.r * g1.pitch - g2.r * g2.pitch) < 1e-9, f"{g1.name}/{g2.name}: peg pitch differs"
    a1 = g1.angle_of(contact)
    delta1 = wrap(g1.phase - a1, g1.pitch)  # g1's nearest peg, ahead of the contact
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
        # Peg pitch from the documented Song gears: pi * 2.4 / 24 = 0.314 chi ("齒間相去三寸").
        self.pitch = math.pi * s["footGearDiameter"]["v"] / s["footGearTeeth"]["v"]
        m = raw["model"]
        self.peg_d = m["pegDiameter"]["v"]
        self.add = m["pegAddendum"]["v"]
        self.ded = m["pegDedendum"]["v"]
        self.peg_root = self.ded + 0.08  # pegs are let into the rim
        self.shaft_top = m["shaftTopHeight"]["v"]
        self.shaft_r = pv(raw, "song.centralShaftDiameter") / 2
        self.deck_z = m["deckHeight"]["v"]

    def radius(self, teeth):
        return teeth * self.pitch / (2 * math.pi)

    def radial(self, name, center, axis, u, teeth, r=None):
        r = self.radius(teeth) if r is None else r
        return Gear(name, center, axis, u, r, teeth, "radial", self.peg_d, r - self.peg_root, r + self.add)


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
        for r, n in ((self.r_foot, n_foot), (self.r_small, n_small), (self.r_big, n_big)):
            assert abs(self.radius(n) - r) < 1e-9, "Song diameters and tooth counts give one pitch"
        self.foot_y = s["footGearPlane"]["v"]
        self.lift = s["clutchLift"]["v"]
        self.mesh_z = self.axle_z + self.r_foot           # top of the foot gear
        self.small_y = self.foot_y - self.r_small          # small wheel touches the foot gear on its outer side
        self.big_x = math.sqrt((self.r_big + self.r_small) ** 2 - self.small_y ** 2)
        self.shaft_x = self.big_x
        self.shaft_bottom = self.shaft_top - pv(raw, "song.centralShaftHeight")
        zc = self.axle_z
        g = {}
        g["foot.R"] = self.radial("song.foot.R", (0.0, -self.foot_y, zc), Y, Z, n_foot)
        g["foot.L"] = self.radial("song.foot.L", (0.0, self.foot_y, zc), Y, Z, n_foot)
        g["small.R"] = self.radial("song.small.R", (0.0, -self.small_y, self.mesh_z), Z, X, n_small)
        g["small.L"] = self.radial("song.small.L", (0.0, self.small_y, self.mesh_z), Z, X, n_small)
        g["big"] = self.radial("song.bigFlat", (self.big_x, 0.0, self.mesh_z), Z, X, n_big)
        self.gears = g
        self.contacts = {}

        def c_big(side):
            sm = g["small." + side]
            return add(sm.center, mul(norm(sub(g["big"].center, sm.center)), self.r_small))

        ft = {"R": (0.0, -self.foot_y, self.mesh_z), "L": (0.0, self.foot_y, self.mesh_z)}
        foot_to_small = n_foot / n_small
        small_to_big = -n_small / n_big
        # chariot.js: smallR = +2 footR, smallL = -2 footL, bigFlat = -small / 4 (either side)
        g["foot.R"].phase = 0.0  # marker peg at the top, where it meets the small wheel
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


# --------------------------------------------------------------------------- differential


class DiffLayout(Common):
    """Lanchester-style differential (a 20th-century hypothesis, not in the Song texts).

    Each road wheel carries a vertical crown wheel whose BOTTOM pegs drive a horizontal gear
    of the same size on the central vertical axis, so the ratio is exactly 1. Meshing at the
    bottom gives the senses the sim needs: forward motion turns the left train
    counter-clockwise (sideA = +wheelL) and the right train clockwise (sideB = -wheelR).
    The two horizontal gears differ in size, so they sit at different heights
    (z = axle - radius); between them a peg differential averages them on the carrier,
    which carries the figure's shaft."""

    mechanism = "differential"

    def __init__(self, raw):
        super().__init__(raw, "differential")
        d = raw["differential"]
        self.n_left, self.n_right = d["crownLeftTeeth"]["v"], d["crownRightTeeth"]["v"]
        self.r_left, self.r_right = self.radius(self.n_left), self.radius(self.n_right)
        assert self.r_left > self.r_right, "the left (lower) train must be the larger one"
        self.n_side, self.n_pin = d["sideGearTeeth"]["v"], d["pinionTeeth"]["v"]
        self.r_side = d["sideGearPitchRadius"]["v"]
        self.r_pin = self.r_side * self.n_pin / self.n_side
        self.small_peg_d = d["diffPegDiameter"]["v"]
        self.small_add = d["diffPegAddendum"]["v"]
        zc = self.axle_z
        self.zA = zc - self.r_left      # plane of the left horizontal gear (sideA)
        self.zB = zc - self.r_right     # plane of the right horizontal gear (sideB)
        self.disc_t = 0.1
        self.z_pin = (self.zA + self.zB) / 2
        self.zA_pitch = self.z_pin - self.r_pin   # side gear A's peg pitch plane
        self.zB_pitch = self.z_pin + self.r_pin
        self.shaft_x = 0.0
        self.shaft_bottom = 0.55
        g = {}
        g["crown.L"] = self.radial("diff.crown.L", (0.0, self.r_left, zc), Y, Z, self.n_left)
        g["crown.R"] = self.radial("diff.crown.R", (0.0, -self.r_right, zc), Y, Z, self.n_right)
        g["sideA"] = self.radial("diff.sideA", (0.0, 0.0, self.zA), Z, X, self.n_left)
        g["sideB"] = self.radial("diff.sideB", (0.0, 0.0, self.zB), Z, X, self.n_right)
        a_face = self.zA + self.disc_t / 2
        b_face = self.zB - self.disc_t / 2
        g["ringA"] = Gear("diff.sideA.ring", (0.0, 0.0, self.zA_pitch), Z, X, self.r_side, self.n_side, "axial",
                          self.small_peg_d, h0=a_face - self.zA_pitch, h1=self.small_add)
        g["ringB"] = Gear("diff.sideB.ring", (0.0, 0.0, self.zB_pitch), Z, X, self.r_side, self.n_side, "axial",
                          self.small_peg_d, h0=-self.small_add, h1=b_face - self.zB_pitch)
        root = 0.18
        g["pinion.0"] = Gear("diff.pinion.0", (self.r_side, 0.0, self.z_pin), X, Z, self.r_pin, self.n_pin, "radial",
                             self.small_peg_d, root - 0.06, self.r_pin + self.small_add)
        g["pinion.1"] = Gear("diff.pinion.1", (-self.r_side, 0.0, self.z_pin), (-1.0, 0.0, 0.0), Z, self.r_pin,
                             self.n_pin, "radial", self.small_peg_d, root - 0.06, self.r_pin + self.small_add)
        self.pin_disc_r = root
        assert self.zA_pitch - self.r_pin - 0 > 0
        # Clearances between the pinions and the faces of the two horizontal gears.
        assert self.z_pin - (self.r_pin + self.small_add) - a_face > 0.05, "pinion too close to gear A"
        assert b_face - (self.z_pin + self.r_pin + self.small_add) > 0.05, "pinion too close to gear B"
        assert self.z_pin - root - (self.zA_pitch + self.small_add) > 0.03, "pinion disc hits A's pegs"
        assert (self.zB_pitch - self.small_add) - (self.z_pin + root) > 0.03, "pinion disc hits B's pegs"
        self.gears = g
        cL = (0.0, self.r_left, self.zA)
        cR = (0.0, -self.r_right, self.zB)
        pA0, pB0 = (self.r_side, 0.0, self.zA_pitch), (self.r_side, 0.0, self.zB_pitch)
        pA1, pB1 = (-self.r_side, 0.0, self.zA_pitch), (-self.r_side, 0.0, self.zB_pitch)
        # chariot.js: sideA = +wheelL, sideB = -wheelR; with the carrier held,
        # pinion = (sideA - sideB) / 2 * 16 / 8, i.e. +2 x sideA and -2 x sideB.
        side_to_pin = self.n_side / self.n_pin
        g["crown.L"].phase = 0.0
        g["sideA"].phase = mesh(g["crown.L"], g["sideA"], cL, +1.0)
        g["ringA"].phase = g["sideA"].phase
        g["pinion.0"].phase = mesh(g["ringA"], g["pinion.0"], pA0, +side_to_pin)
        g["pinion.1"].phase = mesh(g["ringA"], g["pinion.1"], pA1, +side_to_pin)
        g["ringB"].phase = mesh(g["pinion.0"], g["ringB"], pB0, -1 / side_to_pin)
        assert mesh_ok(g["pinion.1"], g["ringB"], pB1, -1 / side_to_pin), "pinions disagree on side gear B"
        g["sideB"].phase = 0.0
        g["crown.R"].phase = mesh(g["sideB"], g["crown.R"], cR, -1.0)
        self.contacts = {
            ("diff.crown.L", "diff.sideA"): cL,
            ("diff.crown.R", "diff.sideB"): cR,
            ("diff.sideA", "diff.pinion.0"): pA0,
            ("diff.sideA", "diff.pinion.1"): pA1,
            ("diff.sideB", "diff.pinion.0"): pB0,
            ("diff.sideB", "diff.pinion.1"): pB1,
        }


def layout(mechanism, raw=None):
    raw = raw or load()
    return SongLayout(raw) if mechanism == "song" else DiffLayout(raw)


if __name__ == "__main__":
    for m in ("song", "differential"):
        L = layout(m)
        print(m, "shaft_x", round(L.shaft_x, 4))
        for k, g in L.gears.items():
            print(f"  {g.name:18s} r={g.r:.4f} n={g.n:3d} c={tuple(round(c, 4) for c in g.center)} phase={math.degrees(g.phase):.3f}")

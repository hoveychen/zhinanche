"""bpy helpers: flat-shaded low-poly solids in chi, materials, nodes and glTF extras.

A node can be built smooth instead (`MB.build(..., smooth=deg)`): faces meeting
at less than that angle shade as one curved surface, sharper edges stay crisp.

Every primitive is a convex solid; faces are oriented outward from the solid's centroid,
so normals are right without bpy.ops. Coordinates are Blender world coordinates (chi);
`MB.build` re-bases them on the node's pivot.
"""

import math

import bpy
from mathutils import Vector

# Base colours (sRGB hex). Left train blue, right train orange, centre gold, markers red.
COLORS = {
    "peg": "#e8c99a",        # light hardwood gear teeth (the role keeps its old name)
    "wood": "#b07a45",       # frame, deck, pole: oiled elm
    "wood_dark": "#6e4527",  # hubs, gear rims and spokes, axle: darker wood
    "lacquer": "#b8382c",    # the red box, railings, pillars (赤質)
    "wheel": "#a2301f",      # the wheels' red lacquer, a shade darker than the box
    "mark": "#f0c93a",       # the wheels' marker spoke (yellow, reads against the red)
    "eave": "#7a2a1f",
    "blue": "#2f6fd6",
    "orange": "#f08a24",
    "gold": "#e5b53b",
    "yellow": "#f2c230",     # the differential's carrier and pinions: the middle train, painted
    # the differential's inner teeth in their gear's colour ("peg_*": teeth, for check_clearance)
    "peg_blue": "#2f6fd6",
    "peg_orange": "#f08a24",
    "peg_yellow": "#f2c230",
    "marker": "#ff2340",
    "iron": "#3b3d42",
    "rope": "#c9b07a",
    # the box's paintings (materials.js lays them over these): 青龍 left, 白虎 right, 花鳥 front and back
    "mural_dragon": "#b8382c",
    "mural_tiger": "#b8382c",
    "mural_flowers": "#b8382c",
    "trim": "#2f6b55",       # the figure's collar, cuffs, sash and stole: mineral green (石绿)
    "robe": "#d1362e",
    "skin": "#f3cfa6",
    "hat": "#2a2a2e",
}


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hexstr):
    h = hexstr.lstrip("#")
    return tuple(_lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def material(name):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    col = (*rgb(COLORS[name]), 1.0)
    mat.diffuse_color = col
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = col
    bsdf.inputs["Roughness"].default_value = 0.4 if name == "marker" else 0.75
    bsdf.inputs["Metallic"].default_value = 0.5 if name in ("iron",) else 0.0
    return mat


def V(p):
    return Vector(p)


def basis(axis):
    """Two unit vectors perpendicular to axis (and to each other)."""
    a = V(axis).normalized()
    ref = Vector((0, 0, 1)) if abs(a.z) < 0.9 else Vector((1, 0, 0))
    b1 = a.cross(ref).normalized()
    b2 = a.cross(b1).normalized()
    return b1, b2


class MB:
    """Accumulates convex solids (world coordinates, chi) with material slots."""

    def __init__(self):
        self.verts, self.faces, self.fmat, self.mats = [], [], [], []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def convex(self, pts, faces, mat):
        pts = [V(p) for p in pts]
        c = sum(pts, Vector()) / len(pts)
        mi = self._mi(mat)
        base = len(self.verts)
        self.verts += pts
        for f in faces:
            n = Vector()
            for i in range(len(f)):
                p, q = pts[f[i]], pts[f[(i + 1) % len(f)]]
                n += Vector(((p.y - q.y) * (p.z + q.z), (p.z - q.z) * (p.x + q.x), (p.x - q.x) * (p.y + q.y)))
            fc = sum((pts[i] for i in f), Vector()) / len(f)
            if n.dot(fc - c) < 0:
                f = list(reversed(f))
            self.faces.append([base + i for i in f])
            self.fmat.append(mi)

    def prism(self, poly, e, mat):
        """Extrude a planar convex polygon (world points) by vector e."""
        n = len(poly)
        e = V(e)
        pts = [V(p) for p in poly] + [V(p) + e for p in poly]
        faces = [list(range(n)), list(range(n, 2 * n))]
        faces += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        self.convex(pts, faces, mat)

    def cyl(self, p0, p1, r, mat, n=8, phase=0.0, ref=None):
        p0, p1 = V(p0), V(p1)
        a = (p1 - p0).normalized()
        if ref is None:
            b1, b2 = basis(a)
        else:
            b1 = V(ref).normalized()
            b2 = a.cross(b1).normalized()
        poly = [p0 + (b1 * math.cos(phase + 2 * math.pi * i / n) + b2 * math.sin(phase + 2 * math.pi * i / n)) * r for i in range(n)]
        self.prism(poly, p1 - p0, mat)

    def disc(self, c, axis, r, t, mat, n=16, phase=0.0, ref=None):
        a = V(axis).normalized()
        self.cyl(V(c) - a * (t / 2), V(c) + a * (t / 2), r, mat, n, phase, ref)

    def box(self, lo, hi, mat):
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        self.prism([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, z1 - z0), mat)

    def beam(self, p0, p1, w, h, mat, up=(0, 0, 1)):
        """Box from p0 to p1 with a w x h cross-section (h along `up` where possible)."""
        p0, p1 = V(p0), V(p1)
        d = (p1 - p0).normalized()
        s = d.cross(V(up))
        if s.length < 1e-6:
            s = d.cross(Vector((1, 0, 0)))
        s.normalize()
        u = s.cross(d).normalized()
        poly = [p0 + s * sx * (w / 2) + u * ux * (h / 2) for sx, ux in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        self.prism(poly, p1 - p0, mat)

    def ring(self, c, axis, r_in, r_out, t, mat, n=32, ref=None):
        """Annulus as n convex segments."""
        c, a = V(c), V(axis).normalized()
        if ref is None:
            b1, b2 = basis(a)
        else:
            b1 = V(ref).normalized()
            b2 = a.cross(b1).normalized()
        for i in range(n):
            t0, t1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            d0 = b1 * math.cos(t0) + b2 * math.sin(t0)
            d1 = b1 * math.cos(t1) + b2 * math.sin(t1)
            quad = [c + d0 * r_in - a * (t / 2), c + d0 * r_out - a * (t / 2), c + d1 * r_out - a * (t / 2), c + d1 * r_in - a * (t / 2)]
            self.prism(quad, a * t, mat)

    def revolve(self, c, axis, profile, mat, n=24, ref=None, phase=0.0, seam_every=0, seam=0.0):
        """Solid of revolution: a convex profile [(r, a)] (r from the axis, a along it,
        measured from c) swept round `axis` as n convex wedges. With seam_every, every
        seam_every-th wedge boundary is left open by `seam` radians (a joint line)."""
        c, a = V(c), V(axis).normalized()
        if ref is None:
            b1, b2 = basis(a)
        else:
            b1 = V(ref).normalized()
            b2 = a.cross(b1).normalized()

        def poly(th):
            d = b1 * math.cos(th) + b2 * math.sin(th)
            return [c + d * r + a * h for r, h in profile]

        for i in range(n):
            t0, t1 = phase + 2 * math.pi * i / n, phase + 2 * math.pi * (i + 1) / n
            if seam_every:
                if i % seam_every == 0:
                    t0 += seam
                if (i + 1) % seam_every == 0:
                    t1 -= seam
            self.frustum(poly(t0), poly(t1), mat)

    def bar(self, p0, s0, p1, s1, mat, up=(0, 0, 1), chamfer=0.0, roof=0.0):
        """Tapered bar from p0 (section s0 = (w, h)) to p1 (section s1); h runs along
        `up` where possible. chamfer > 0 cuts the four corners (an octagonal section);
        roof > 0 (degrees) cuts the two faces across h to a ridge along the bar instead (a
        hexagonal section)."""
        p0, p1 = V(p0), V(p1)
        d = (p1 - p0).normalized()
        s = d.cross(V(up))
        if s.length < 1e-6:
            s = d.cross(Vector((1, 0, 0)))
        s.normalize()
        u = s.cross(d).normalized()

        def sect(p, w, h):
            if roof > 0:
                a, b = w / 2, h / 2
                e = max(b - a * math.tan(math.radians(roof)), b * 0.05)
                pts = [(-a, -e), (0.0, -b), (a, -e), (a, e), (0.0, b), (-a, e)]
                return [p + s * x + u * y for x, y in pts]
            if chamfer <= 0:
                return [p + s * sx * (w / 2) + u * ux * (h / 2) for sx, ux in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            cw, ch = min(chamfer, w / 2 * 0.99), min(chamfer, h / 2 * 0.99)
            pts = [(-w / 2 + cw, -h / 2), (w / 2 - cw, -h / 2), (w / 2, -h / 2 + ch), (w / 2, h / 2 - ch),
                   (w / 2 - cw, h / 2), (-w / 2 + cw, h / 2), (-w / 2, h / 2 - ch), (-w / 2, -h / 2 + ch)]
            return [p + s * x + u * y for x, y in pts]

        self.frustum(sect(p0, *s0), sect(p1, *s1), mat)

    def frustum(self, lo, hi, mat):
        """Convex solid between two parallel polygons with the same vertex count (or apex)."""
        if len(hi) == 1:
            n = len(lo)
            pts = list(lo) + list(hi)
            faces = [list(range(n))] + [[i, (i + 1) % n, n] for i in range(n)]
        else:
            n = len(lo)
            pts = list(lo) + list(hi)
            faces = [list(range(n)), list(range(n, 2 * n))]
            faces += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        self.convex(pts, faces, mat)

    def ellipsoid(self, c, r, mat, n=16, m=8):
        """Ellipsoid round c with semi-axes r = (rx, ry, rz): n segments round z, m from pole to pole."""
        c = V(c)
        rx, ry, rz = r
        pts = [c + Vector((0, 0, rz))]
        for j in range(1, m):
            t = math.pi * j / m
            pts += [c + Vector((rx * math.sin(t) * math.cos(2 * math.pi * i / n), ry * math.sin(t) * math.sin(2 * math.pi * i / n), rz * math.cos(t))) for i in range(n)]
        pts.append(c - Vector((0, 0, rz)))
        last = len(pts) - 1
        ring = lambda j, i: 1 + (j - 1) * n + i % n  # noqa: E731
        faces = [[0, ring(1, i), ring(1, i + 1)] for i in range(n)]
        for j in range(1, m - 1):
            faces += [[ring(j, i), ring(j + 1, i), ring(j + 1, i + 1), ring(j, i + 1)] for i in range(n)]
        faces += [[last, ring(m - 1, i + 1), ring(m - 1, i)] for i in range(n)]
        self.convex(pts, faces, mat)

    def blob(self, c, ex, ey, ez, mat, n=12, m=6):
        """An ellipsoid round c with its semi-axes along the vectors ex, ey, ez (any orientation)."""
        c, ex, ey, ez = V(c), V(ex), V(ey), V(ez)
        pts = [c + ez]
        for j in range(1, m):
            t = math.pi * j / m
            pts += [c + ex * (math.sin(t) * math.cos(2 * math.pi * i / n)) + ey * (math.sin(t) * math.sin(2 * math.pi * i / n)) + ez * math.cos(t) for i in range(n)]
        pts.append(c - ez)
        last = len(pts) - 1
        ring = lambda j, i: 1 + (j - 1) * n + i % n  # noqa: E731
        faces = [[0, ring(1, i), ring(1, i + 1)] for i in range(n)]
        for j in range(1, m - 1):
            faces += [[ring(j, i), ring(j + 1, i), ring(j + 1, i + 1), ring(j, i + 1)] for i in range(n)]
        faces += [[last, ring(m - 1, i + 1), ring(m - 1, i)] for i in range(n)]
        self.convex(pts, faces, mat)

    def loft(self, rings, mat, cap0=True, cap1=True):
        """One surface through a run of rings (each the same number of points, in the same
        order round): quads between neighbours, fans over the ends. Not convex: each face
        is turned away from the middle of the two rings it joins, so a lofted robe with
        folds or a drooping sleeve shades right."""
        n = len(rings[0])
        mi = self._mi(mat)
        base = len(self.verts)
        for r in rings:
            assert len(r) == n
            self.verts += [V(p) for p in r]
        cents = [sum((V(p) for p in r), Vector()) / n for r in rings]

        def add(f, inside):
            n_ = Vector()
            for i in range(len(f)):
                p, q = self.verts[f[i]], self.verts[f[(i + 1) % len(f)]]
                n_ += Vector(((p.y - q.y) * (p.z + q.z), (p.z - q.z) * (p.x + q.x), (p.x - q.x) * (p.y + q.y)))
            fc = sum((self.verts[i] for i in f), Vector()) / len(f)
            if n_.dot(fc - inside) < 0:
                f = list(reversed(f))
            self.faces.append(f)
            self.fmat.append(mi)

        for j in range(len(rings) - 1):
            mid = (cents[j] + cents[j + 1]) / 2
            for i in range(n):
                a, b = base + j * n + i, base + j * n + (i + 1) % n
                add([a, b, b + n, a + n], mid)
        for cap, j, nxt in ((cap0, 0, 1), (cap1, len(rings) - 1, len(rings) - 2)):
            if not cap or len(rings) < 2:
                continue
            ci = len(self.verts)
            self.verts.append(cents[j].copy())
            # the fan faces away from the next ring in
            for i in range(n):
                add([ci, base + j * n + i, base + j * n + (i + 1) % n], cents[nxt])

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def build(self, name, pivot, parent=None, collection=None, smooth=None):
        pivot = V(pivot)
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(p - pivot) for p in self.verts], [], self.faces)
        for m in self.mats:
            me.materials.append(material(m))
        me.polygons.foreach_set("material_index", self.fmat)
        me.validate()
        if smooth is not None:
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(smooth))
        me.update()
        obj = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(obj)
        place(obj, pivot, parent)
        return obj


def place(obj, world, parent):
    """Put obj at a world position, parented without rotation or parent-inverse."""
    obj.rotation_mode = "QUATERNION"
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
        obj.location = V(world) - world_pos(parent)
    else:
        obj.location = V(world)


def world_pos(obj):
    p = Vector()
    while obj is not None:
        p += obj.location
        obj = obj.parent
    return p


def empty(name, world, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    place(obj, world, parent)
    return obj


# --------------------------------------------------------------------------- extras


def gl(v):
    """Blender (x, y, z) -> glTF (x, z, -y)."""
    x, y, z = v
    return [float(x), float(z), float(-y) + 0.0]


def set_rotate(obj, pose, axis, factor=1.0):
    obj["motion"] = "rotate"
    obj["pose"] = pose
    obj["axis"] = gl(axis)
    obj["factor"] = float(factor)


def set_lift(obj, pose, distance, axis=(0, 0, 1)):
    obj["motion"] = "lift"
    obj["pose"] = pose
    obj["axis"] = gl(axis)
    obj["distance"] = float(distance)


def set_teach(obj, group, label, explode=(0, 0, 0), teeth=None):
    assert group in ("shell", "chassis", "wheel", "gear", "figure"), group
    obj["group"] = group
    obj["label"] = label
    obj["explode"] = gl(explode)
    if teeth is not None:
        obj["teeth"] = int(teeth)

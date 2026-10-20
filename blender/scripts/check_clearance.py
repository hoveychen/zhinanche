"""Collision sweep of the shipped GLBs over poses sampled from js/sim.

  node tools/export-poses.mjs        # -> blender/out/poses-<m>.json
  blender --background --factory-startup --python-exit-code 1 --python check_clearance.py -- \
      [--mechanism differential|song|all] [--poses-dir DIR] [--every N] [--all-phases]

The GLB is imported (so the sweep checks the file that ships) and every pair of meshes
that can move relative to each other is tested for triangle intersection (BVH overlap) at
every pose. Not tested:

- pairs inside one rigid body (a node with `motion` and its static children, or the
  static body);
- DESIGNED contacts: journals, keyed parts and the figure on its shaft;
- MESHING gear pairs in a pose where the two gears are not in their meshing phase. In
  the differential every pose is in phase (all gear angles are linear in the wheel
  angles). The Song small flat wheel only turns while it is lowered, but its foot gear
  turns with the road wheel all the time, so after a straight run the sim lowers it out
  of phase; those poses are counted and reported (WARN) instead of tested. Raised small
  wheels are always tested against everything: they must clear in any phase.

Prints one OK/FAIL line per pair that ever comes near (bounding boxes overlap), then a
last line CLEARANCE_OK or CLEARANCE_FAIL (exit code 0 / 1).
"""

import json
import math
import os
import re
import sys
import time

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Quaternion, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
from lib import layout as lay  # noqa: E402

COMMON = [
    r"^figure~figure\.shaft$",
    r"^body\.(frame|deck|tier|roof)~figure\.shaft$",
]
DESIGNED = {
    "song": COMMON + [
        r"^body\.axle~(wheel|song\.foot)\.(L|R)$",
        r"^song\.foot\.(L|R)~wheel\.\1$",
        r"^song\.small\.(L|R)~song\.smallLift\.\1$",
        r"^figure\.shaft~song\.bigFlat$",
        r"^body\.pole~song\.roller\.(L|R)$",
    ],
    "differential": COMMON + [
        r"^diff\.crown\.(L|R)~wheel\.\1$",
        r"^body\.frame~diff\.crown\.(L|R)$",
        r"^diff\.(sideA|sideB|carrier)~figure\.shaft$",
        r"^diff\.carrier~diff\.pinion\.(0|1)$",
    ],
}
MESHING = {
    "song": [r"^song\.foot\.(L|R)~song\.small\.\1$", r"^song\.bigFlat~song\.small\.(L|R)$"],
    "differential": [r"^diff\.crown\.L~diff\.sideA$", r"^diff\.crown\.R~diff\.sideB$",
                     r"^diff\.pinion\.(0|1)~diff\.side(A|B)$"],
}
TOL = 1e-6


def base(name):
    return name[:-7] if name.endswith(".marker") else name


def key(a, b):
    a, b = sorted((base(a), base(b)))
    return f"{a}~{b}"


def matches(rules, a, b):
    k = key(a, b)
    return any(re.match(r, k) for r in rules)


def bl_axis(o):
    x, y, z = o["axis"]
    return Vector((x, -z, y))


def import_glb(mech):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(lay.ROOT, "assets", f"chariot-{mech}.glb"))
    return {o.name: o for o in bpy.data.objects}


def rigid_body(o):
    while o is not None:
        if "motion" in o:
            return o.name
        o = o.parent
    return "static"


def in_phase(mech, side, g):
    """Song: is the lowered small wheel on `side` in its meshing phase with foot and big?"""
    if mech != "song":
        return True
    p = 2 * math.pi / 12
    foot = g["foot" + side]
    small = g["small" + side]
    k = 2.0 if side == "R" else -2.0
    a = lay.wrap(small - k * foot, p)
    b = lay.wrap(small + 4 * g["bigFlat"], p)
    return abs(a) < TOL and abs(b) < TOL


def sweep(mech, poses, all_phases=False):
    objs = import_glb(mech)
    meshes = {n: o for n, o in objs.items() if o.type == "MESH"}
    movers = {n: o for n, o in objs.items() if "motion" in o}
    for o in movers.values():
        o.rotation_mode = "QUATERNION"
        assert o.rotation_quaternion.angle < 1e-9, f"{o.name}: rest rotation must be identity"
    rest = {n: o.location.copy() for n, o in movers.items()}
    body = {n: rigid_body(o) for n, o in meshes.items()}
    designed, meshing = DESIGNED[mech], MESHING[mech]
    names = sorted(meshes)
    pairs = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if body[a] == body[b] or matches(designed, a, b):
                continue
            pairs.append((a, b, matches(meshing, a, b)))
    local = {}
    for n, o in meshes.items():
        me = o.data
        v = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", v)
        local[n] = (v.reshape(-1, 3), [tuple(p.vertices) for p in me.polygons])

    def apply(pose):
        g = pose["gears"]
        for n, o in movers.items():
            if o["motion"] == "rotate":
                ang = pose["figureRel"] if n == "figure" else g[o["pose"]]
                o.rotation_quaternion = Quaternion(bl_axis(o), o["factor"] * ang)
            else:
                e = 1.0 if pose["clutch"]["left" if o["pose"] == "clutchL" else "right"] else 0.0
                o.location = rest[n] + bl_axis(o) * (o["distance"] * (1.0 - e))

    def side_of(a, b):
        for n in (base(a), base(b)):
            m = re.search(r"\.(L|R)$", n)
            if m and ("small" in n or "foot" in n):
                return m.group(1)
        return None

    mats, trees, boxes, seen = {}, {}, {}, {}
    near, fails, first, skipped = {}, {}, {}, {}
    state = {"L down": 0, "R down": 0, "both up": 0}
    tested = 0
    t0 = time.time()
    for k, pose in enumerate(poses):
        apply(pose)
        bpy.context.view_layer.update()
        cl = pose["clutch"]
        state["L down" if cl["left"] else "R down" if cl["right"] else "both up"] += 1
        for n, o in meshes.items():
            mw = o.matrix_world
            sig = tuple(round(x, 9) for row in mw for x in row)
            if mats.get(n, (None,))[0] == sig:
                continue
            m = np.array(mw)
            w = local[n][0] @ m[:3, :3].T + m[:3, 3]
            mats[n] = (sig, m)
            trees[n] = BVHTree.FromPolygons(w.tolist(), local[n][1], all_triangles=False)
            boxes[n] = (w.min(0), w.max(0))
        for a, b, is_mesh in pairs:
            (la, ha), (lb, hb) = boxes[a], boxes[b]
            if (la > hb).any() or (lb > ha).any():
                continue
            pk = (a, b)
            if is_mesh:
                side = side_of(a, b)
                down = side is not None and cl["left" if side == "L" else "right"]
                if down and not all_phases and not in_phase(mech, side, pose["gears"]):
                    skipped[key(a, b)] = skipped.get(key(a, b), 0) + 1
                    continue
            near[pk] = near.get(pk, 0) + 1
            rel = np.linalg.inv(mats[a][1]) @ mats[b][1]
            ck = (a, b, tuple(np.round(rel, 7).ravel()))
            hits = seen.get(ck)
            if hits is None:
                hits = len(trees[a].overlap(trees[b]))
                seen[ck] = hits
                tested += 1
            if hits:
                fails[pk] = max(fails.get(pk, 0), hits)
                first.setdefault(pk, pose["label"])
        if k % 2000 == 0:
            print(f"  ... {mech}: {k}/{len(poses)} poses, {tested} pair tests, {time.time() - t0:.0f} s", flush=True)
    for (a, b, is_mesh) in pairs:
        pk = (a, b)
        if pk not in near:
            continue
        tag = "MESH " if is_mesh else "PAIR "
        if pk in fails:
            print(f"{tag}{a:24s} <-> {b:24s} FAIL first at {first[pk]} (max {fails[pk]} tri pairs)")
        else:
            print(f"{tag}{a:24s} <-> {b:24s} OK   ({near[pk]} near poses)")
    far = sum(1 for a, b, _ in pairs if (a, b) not in near)
    print(f"{mech}: {far} other pairs never come near: OK")
    print(f"{mech}: clutch states swept: " + ", ".join(f"{k} {v}" for k, v in state.items()))
    for k2, n in sorted(skipped.items()):
        print(f"WARN {mech}: {k2} lowered out of meshing phase in {n} poses (sim lowers the small wheel without aligning its pegs; not tested)")
    print(f"{mech}: {len(pairs)} pairs x {len(poses)} poses, {tested} distinct pair tests, {time.time() - t0:.0f} s")
    return not fails


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    mech = argv[argv.index("--mechanism") + 1] if "--mechanism" in argv else "all"
    pdir = argv[argv.index("--poses-dir") + 1] if "--poses-dir" in argv else os.path.join(lay.ROOT, "blender", "out")
    every = int(argv[argv.index("--every") + 1]) if "--every" in argv else 1
    all_phases = "--all-phases" in argv  # diagnostic: also test out-of-phase meshes (expected to fail)
    ok = True
    for m in (["differential", "song"] if mech == "all" else [mech]):
        with open(os.path.join(pdir, f"poses-{m}.json"), encoding="utf-8") as f:
            poses = json.load(f)["poses"][::every]
        ok = sweep(m, poses, all_phases) and ok
    print("CLEARANCE_OK" if ok else "CLEARANCE_FAIL")
    return ok


if __name__ == "__main__":
    sys.exit(0 if main() else 1)

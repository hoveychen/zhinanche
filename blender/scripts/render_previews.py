"""Render preview PNGs of the shipped GLBs (imported, so the picture is the deliverable).

  blender --background --factory-startup --python-exit-code 1 --python render_previews.py -- \
      [--mechanism differential|song|all] [--out-dir blender/out] [--size 1280]

Per mechanism: <m>-assembled.png, <m>-open.png (shell group hidden, gears exposed) and
<m>-exploded.png (every node moved by extras.explode).
"""

import math
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from lib import layout as lay  # noqa: E402

OUT = os.path.join(lay.ROOT, "blender", "out")


def setup(size):
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.render.resolution_x = size
    sc.render.resolution_y = int(size * 0.75)
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.82, 0.86, 0.9, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    sc.world = world
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 2.2
    sun.angle = math.radians(8)
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    sc.collection.objects.link(so)
    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 0.6
    fo = bpy.data.objects.new("fill", fill)
    fo.rotation_euler = (math.radians(60), 0, math.radians(150))
    sc.collection.objects.link(fo)
    me = bpy.data.meshes.new("ground")
    s = 40
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    mat = bpy.data.materials.new("ground")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.32, 0.27, 0.2, 1)
    me.materials.append(mat)
    g = bpy.data.objects.new("ground", me)
    sc.collection.objects.link(g)
    cam = bpy.data.cameras.new("cam")
    cam.lens = 50
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    return co


def look(cam, eye, target):
    cam.location = Vector(eye)
    d = Vector(target) - Vector(eye)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def frame(cam, objs, direction, margin=1.08):
    """Aim along `direction` (from target to eye) so that every visible mesh fits."""
    pts = [o.matrix_world @ v.co for o in objs if o.type == "MESH" and not o.hide_render for v in o.data.vertices]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    r = (hi - lo).length / 2
    fov = 2 * math.atan(cam.data.sensor_width / 2 / cam.data.lens) * 0.75
    dist = r / math.sin(fov / 2) * margin
    look(cam, c + Vector(direction).normalized() * dist, c)


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WROTE", path)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    mech = argv[argv.index("--mechanism") + 1] if "--mechanism" in argv else "all"
    out = argv[argv.index("--out-dir") + 1] if "--out-dir" in argv else OUT
    size = int(argv[argv.index("--size") + 1]) if "--size" in argv else 1280
    os.makedirs(out, exist_ok=True)
    for m in (["differential", "song"] if mech == "all" else [mech]):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        cam = setup(size)
        bpy.ops.import_scene.gltf(filepath=os.path.join(lay.ROOT, "assets", f"chariot-{m}.glb"))
        objs = [o for o in bpy.data.objects if o.get("group") or o.name == "chariot"]
        cx = next(o for o in bpy.data.objects if o.name == "figure.shaft").matrix_world.translation.x
        nopole = [o for o in objs if o.name != "body.pole"]
        frame(cam, nopole, (0.8, 1.0, 0.5), 0.95)
        render(os.path.join(out, f"{m}-assembled.png"))
        shell = [o for o in objs if o.get("group") == "shell"]
        gears = [o for o in objs if o.get("group") in ("gear",) or o.name.startswith("figure.shaft")]
        for o in shell:
            o.hide_render = True
        for side, d in (("L", (0.75, 1.0, 0.75)), ("R", (0.75, -1.0, 0.6))):
            wheel = bpy.data.objects[f"wheel.{side}"]
            for o in [wheel, *wheel.children]:
                o.hide_render = True
            frame(cam, [o for o in gears if not o.name.startswith("figure")], d, 1.15)
            render(os.path.join(out, f"{m}-open-{side}.png"))
            for o in [wheel, *wheel.children]:
                o.hide_render = False
        for o in shell:
            o.hide_render = False
        for o in objs:
            e = o.get("explode")
            if e:
                o.location += Vector((e[0], -e[2], e[1]))
        frame(cam, nopole, (0.8, 1.0, 0.35), 1.3)
        render(os.path.join(out, f"{m}-exploded.png"))


if __name__ == "__main__":
    main()

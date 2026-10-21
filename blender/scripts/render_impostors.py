"""Render one Poly Haven tree into impostor frames: the tree lit as the court lights it,
seen from a ring of directions round it (tools/assets/build_trees.py runs this).

  blender --background <tree>.blend --python-exit-code 1 --python render_impostors.py -- \
      --object pine_tree_01_a_LOD1 --sky assets/photo/sky-env-1024.webp --out <file>.npz \
      [--frames 16] [--px 512] [--elev 10] [--samples 96] [--only K]

The sun and the sky never move and the trees never turn (js/scene/courtyard.js), so the
light can be baked into the frames: Cycles renders the tree under the same sun as
js/scene/environment.js (SUN_DIR, colour 0xffdcb0, intensity 3.4: a three.js
DirectionalLight's Lambert term is albedo·I·cosθ/π, as a Cycles sun of strength I) and
the same photographed sky (sky-env, radiance / headroom, ×0.9 as scene.environmentIntensity),
over paving it can't see but that bounces light up. Each frame is an orthographic view
from elevation --elev, frame k from azimuth k/frames of a turn (three.js: the camera at
(sin φ, ·, cos φ) from the tree; φ = 0 is south, +z). The page draws a frame on an upright
card through the trunk that turns to face the camera.

Writes an .npz: frames (K, H, W, 4) float16 linear, premultiplied alpha; and the frame's
size and placement in metres (width, height on the card, centre height, tree height).
"""

import argparse
import math
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

# three.js SUN_DIR (environment.js): 28° up, 24° north of west; three (x, y, z) → Blender (x, -z, y).
_E, _A = math.radians(28), math.radians(24)
SUN_THREE = Vector((-math.cos(_E) * math.cos(_A), math.sin(_E), -math.cos(_E) * math.sin(_A))).normalized()
SUN = Vector((SUN_THREE.x, -SUN_THREE.z, SUN_THREE.y))
SUN_COLOUR = (1.0, 0.7157, 0.4342)  # 0xffdcb0 in linear sRGB
SUN_STRENGTH = 3.4
ENV_INTENSITY = 0.9
# The paving round the court, as environment.js puts it in the reflection map (0x8a8378).
GROUND = (0.2541, 0.2271, 0.1878)


def args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--object", required=True)
    ap.add_argument("--sky", required=True, help="sky-env webp (equirect strip, radiance / headroom)")
    ap.add_argument("--sky-elev", type=float, nargs=2, default=(-3.0, 90.0))
    ap.add_argument("--headroom", type=float, default=4.0)
    ap.add_argument("--out", required=True)
    ap.add_argument("--frames", type=int, default=16)
    ap.add_argument("--px", type=int, default=512, help="frame width rendered (height is twice)")
    ap.add_argument("--elev", type=float, default=10.0)
    ap.add_argument("--samples", type=int, default=96)
    ap.add_argument("--only", type=int, default=-1, help="render just this frame (a timing test)")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return ap.parse_args(argv)


def world(sky_path, elev, headroom):
    """The photographed sky round the tree, paving below the horizon."""
    w = bpy.data.worlds.new("court")
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    L = nt.links.new
    coord = N("ShaderNodeTexCoord")
    sep = N("ShaderNodeSeparateXYZ")
    L(coord.outputs["Generated"], sep.inputs[0])

    def math_node(op, a, b=None, clamp=False):
        n = N("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L(v, n.inputs[i])
        return n.outputs[0]

    # column: clockwise from north (three −z = Blender +y), through east (+x)
    az = math_node("ARCTAN2", sep.outputs["X"], sep.outputs["Y"])
    u = math_node("FRACT", math_node("DIVIDE", az, 2 * math.pi))
    el = math_node("ARCSINE", sep.outputs["Z"])
    lo, hi = math.radians(elev[0]), math.radians(elev[1])
    v = math_node("DIVIDE", math_node("SUBTRACT", el, lo), hi - lo, clamp=True)
    uv = N("ShaderNodeCombineXYZ")
    L(u, uv.inputs["X"])
    L(v, uv.inputs["Y"])
    tex = N("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(sky_path)
    tex.image.colorspace_settings.name = "sRGB"
    tex.extension = "EXTEND"
    L(uv.outputs[0], tex.inputs["Vector"])
    gain = N("ShaderNodeMixRGB")
    gain.blend_type = "MULTIPLY"
    gain.inputs["Fac"].default_value = 1
    L(tex.outputs["Color"], gain.inputs[1])
    gain.inputs[2].default_value = (headroom * ENV_INTENSITY,) * 3 + (1,)
    # below the horizon: the paving (as the sky shader: smoothstep 0.03..0.2 below)
    below = N("ShaderNodeMapRange")
    below.interpolation_type = "SMOOTHSTEP"
    L(sep.outputs["Z"], below.inputs["Value"])
    below.inputs["From Min"].default_value = -0.03
    below.inputs["From Max"].default_value = -0.2
    mix = N("ShaderNodeMixRGB")
    L(below.outputs["Result"], mix.inputs["Fac"])
    L(gain.outputs[0], mix.inputs[1])
    mix.inputs[2].default_value = tuple(c * ENV_INTENSITY for c in GROUND) + (1,)
    bg = N("ShaderNodeBackground")
    L(mix.outputs[0], bg.inputs["Color"])
    out = N("ShaderNodeOutputWorld")
    L(bg.outputs[0], out.inputs["Surface"])
    return w


def main():
    a = args()
    sc = bpy.context.scene
    tree = bpy.data.objects[a.object]
    for o in bpy.data.objects:
        o.hide_render = o is not tree
    tree.hide_render = False
    tree.location = (0, 0, 0)
    bpy.context.view_layer.update()
    # the tree's reach round its trunk and its height (world metres, trunk at the origin)
    me = tree.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3) @ np.array(tree.matrix_world.to_3x3()).T
    reach = float(np.sqrt(co[:, 0] ** 2 + co[:, 1] ** 2).max())
    height = float(co[:, 2].max())
    e = math.radians(a.elev)
    # the frame: twice as tall as wide, the whole tree in it from any side
    fh = max(height * math.cos(e) + 2 * reach * math.sin(e), 4 * reach) * 1.03
    fw = fh / 2
    hc = height / 2
    print(f"{a.object}: height {height:.2f} m, reach {reach:.2f} m, frame {fw:.2f} × {fh:.2f} m")

    sc.world = world(a.sky, a.sky_elev, a.headroom)
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = SUN_STRENGTH
    sun_data.color = SUN_COLOUR
    sun_data.angle = math.radians(0.53)
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (-SUN).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(sun)
    # the paving: lights the tree from below, not seen by the camera
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
    ground = bpy.context.active_object
    gm = bpy.data.materials.new("paving")
    gm.use_nodes = True
    bsdf = gm.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = GROUND + (1,)
    bsdf.inputs["Roughness"].default_value = 1
    ground.data.materials.append(gm)
    ground.visible_camera = False

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = fh
    cam_data.clip_start = 0.1
    cam_data.clip_end = 400
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam

    r = sc.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y, r.resolution_percentage = a.px, 2 * a.px, 100
    r.film_transparent = True
    r.image_settings.file_format = "OPEN_EXR"
    r.image_settings.color_depth = "16"
    r.image_settings.color_mode = "RGBA"
    cy = sc.cycles
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        cy.device = "GPU"
    except Exception as err:  # no GPU: the CPU does it, slower
        print("cycles on CPU:", err)
    cy.samples = a.samples
    cy.use_adaptive_sampling = True
    cy.use_denoising = True
    cy.transparent_max_bounces = 48
    cy.max_bounces = 6
    cy.diffuse_bounces = 3
    cy.transmission_bounces = 4
    sc.view_settings.view_transform = "Standard"

    ks = [a.only] if a.only >= 0 else list(range(a.frames))
    frames = np.zeros((len(ks), 2 * a.px, a.px, 4), dtype=np.float16)
    target = Vector((0, 0, hc))
    tmp = bpy.app.tempdir + "impostor.exr"
    for i, k in enumerate(ks):
        phi = 2 * math.pi * k / a.frames
        # three (sin φ, ·, cos φ) → Blender (sin φ, −cos φ, ·)
        to_cam = Vector((math.sin(phi) * math.cos(e), -math.cos(phi) * math.cos(e), math.sin(e)))
        cam.location = target + to_cam * 150
        cam.rotation_euler = (-to_cam).to_track_quat("-Z", "Y").to_euler()
        t0 = time.time()
        r.filepath = tmp
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(tmp, check_existing=False)
        px = np.empty(len(img.pixels), dtype=np.float32)
        img.pixels.foreach_get(px)
        # rows bottom to top, as GL wants them
        frames[i] = px.reshape(2 * a.px, a.px, 4).astype(np.float16)
        bpy.data.images.remove(img)
        print(f"frame {k}: {time.time() - t0:.1f} s", flush=True)
    np.savez(a.out, frames=frames, width=fw, height=fh / math.cos(e), centre=hc, tree=height, reach=reach, elev=a.elev, count=a.frames)


main()

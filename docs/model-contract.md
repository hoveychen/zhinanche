# 3D model contract (Blender GLB ↔ three.js scene ↔ js/sim)

Node names and `extras` in the GLB files are an API. Renaming a node is a breaking change: update this file, the scene binding and the model test together.

## Files

| File | Contents |
|---|---|
| `assets/chariot-differential.glb` | Running gear + body + Lanchester-style differential + figure |
| `assets/chariot-song.glb` | Running gear + body + Yan Su (1027) clutch gear train + figure |
| `assets/photo/chariot-<mechanism>-ao-{1024,512}.webp` | The chariot's baked occlusion atlas (see *UVs and the baked atlas*) |

Both are built by `pnpm build:model` (`blender/scripts/build_chariot.py`, from `params/chariot.json` through `blender/scripts/lib/layout.py`), which writes the two GLBs and bakes their atlases; `-- --mechanism differential|song --out PATH` builds one, `--no-bake` skips the bake. The build is reproducible byte for byte.

## Units and axes

- 1 glTF unit = 1 Song *chi* (≈ 0.31 m). The scene works in chi.
- glTF is Y-up. In the chariot's local frame, **+X is forward**, **+Y is up**, and **-Z is the chariot's left**, so +Z is its right.
- The origin sits on the ground (y = 0), at the midpoint between the two wheel contact points.
- The scene places the chariot by setting the root's position to `(x_sim, 0, -y_sim)` and its rotation to `heading` about +Y. The sim's `heading` is CCW from east, and three.js world uses x = east, -z = north. A rotation of +θ about +Y maps local +X to `(cosθ, 0, -sinθ)`, which is exactly that heading.

## Animated nodes

Every animated node carries glTF `extras`, which three.js exposes as `object.userData`:

```json
{ "motion": "rotate", "pose": "<key>", "axis": [0, 1, 0], "factor": 1 }
{ "motion": "lift",   "pose": "<key>", "axis": [0, 1, 0], "distance": 0.4 }
```

- `rotate`: the node's rotation is `rest × axisAngle(axis, factor × pose.gears[key])`. `axis` is in the node's parent space. The scene sets the angle absolutely each frame and never accumulates it.
- `lift`: `pose.clutch.left/right` are booleans that the scene eases to a value e in 0..1 (e = 1 means engaged). The node's position is `rest + axis × distance × (1 − e)`, so a disengaged gear is raised by `distance`. The extras `pose` is `clutchL` (reads `pose.clutch.left`) or `clutchR` (`pose.clutch.right`).
- Every animated node has an identity rest rotation, so `rest × axisAngle` and `axisAngle` in the parent frame are the same thing.
- Rotation sign: a positive angle about a vertical axis is counter-clockwise seen from above. For wheels, a positive `wheelL`/`wheelR` means the wheel rolls forward. Blender picks `axis` and `factor` so that this holds.

### Pose keys (from `Chariot.pose()`)

| Key | Meaning |
|---|---|
| `wheelL`, `wheelR` | road wheel rolled angle |
| `figure` | figure shaft angle relative to the body. The scene adds `figureOffset` so the arm points south at the start; see below. |
| differential: `sideA` | lower side gear, driven by the **left** wheel, = +left wheel angle (ratio 1) |
| differential: `sideB` | upper side gear, driven by the **right** wheel, = −right wheel angle (ratio 1, reversed) |
| differential: `carrier` | spider / carrier = (sideA + sideB) / 2; the figure shaft is fixed to it |
| differential: `pinion` | each pinion's spin about its own axle |
| song: `footL`, `footR` | 附足立子轮, fixed to its road wheel (24 teeth) |
| song: `smallL`, `smallR` | 小平轮 (12 teeth); turns only while lowered |
| song: `bigFlat` | 中心大平轮 (48 teeth); the figure shaft is fixed to it |
| clutch `clutchL`, `clutchR` | song only, `lift` motion of the small flat wheels and their pole rollers |

The figure: node `figure` rotates with `pose.figureRel`, which already includes the start-up offset, about +Y. Its extras say `"pose": "figure"` like the shaft's; the scene special-cases this one node and uses `pose.figureRel` (= `gears.figure` + `figureOffset`) instead of `gears.figure`. Its arm points along local **+X** at angle 0. The shaft and big gear rotate with `gears.figure` / `gears.bigFlat` / `gears.carrier`.

## Required node names

All nodes are children of root `chariot`. The root's extras carry `mechanism` (`"differential"` / `"song"`) and a `label`.

| Node | Mechanism | Motion |
|---|---|---|
| `body.frame` (sills, 伏兔, posts, deck beams, the shaft's step bearing), `body.pole` (辕, yoke bar and phoenix head), `body.side.L/R`, `body.end.F/B` (gear-room boards and the red box walls), `body.deck` (gear room's ceiling), `body.tier` (重台 with the 鏤拱 band and both eaves), `body.top` (platform, 勾闌, 香囊) | both | static |
| `body.axle` (the through axle with caps and linchpins) | song | static |
| `wheel.L`, `wheel.R` (felloe, 30 spokes, hub with its bands, ridges and bore sleeves) + child `wheel.L/R.marker` (the yellow marker spoke) | both | rotate `wheelL` / `wheelR` |
| `figure` (immortal with outstretched arm) + `figure.shaft` (with its squared section, iron point, collar and pedestal) | both | rotate `figure` (shaft: `figure` too) |
| `diff.sideA`, `diff.sideB` (each a horizontal gear with its ring of upright teeth) | differential | rotate `sideA` / `sideB` |
| `diff.carrier`, `diff.pinion.0`, `diff.pinion.1` (pinions are children of carrier) | differential | rotate `carrier`; pinions `pinion` about their own axle |
| `diff.crown.L`, `diff.crown.R` (gear fixed to each road wheel, with that wheel's half axle, cap and linchpin) | differential | rotate `wheelL` / `wheelR` |
| `song.foot.L`, `song.foot.R` (riding the hubs' inner segments) | song | rotate `footL` / `footR` |
| `song.small.L`, `song.small.R` | song | rotate `smallL` / `smallR` (child of a `song.smallLift.L/R` node that has the `lift` motion) |
| `song.bigFlat` | song | rotate `bigFlat` |
| `song.roller.L`, `song.roller.R` (辕端横木下小轮 and the linkage) | song | lift with clutch (visual only) |

Every gear node has a child `<node>.marker` (its marker tooth). `js/scene/rig.js` STAGES order the parts by these names when the chariot is taken apart; `body.top` goes first.

### Teaching extras on every mesh node

```json
{ "group": "shell" | "chassis" | "wheel" | "gear" | "figure", "explode": [dx, dy, dz], "label": "中心大平轮", "teeth": 48 }
```

- `shell`: everything that hides the gears (the box's side and end boards, the deck, the tier, the top platform). X-ray draws it (and `body.frame`) as a faint wireframe; explode moves it away while it fades out. `chassis`: frame, pole, axle; stays in place.
- `explode`: offset in chi, used at explode = 1, applied to the node's position in its parent's frame. Only direct children of `chariot` carry a non-zero offset; deeper nodes (pinions, small flat wheels, markers) are `[0, 0, 0]` and move with their parent. Gears separate vertically so that the meshing stays readable.
- `label`: Chinese name shown in callouts (English names: `js/teach/strings.en.js` `parts.names`). `teeth`: tooth count, used by the "count the teeth" tasks and by `tests/model.test.js`, which derives the ratio pointing south needs from these counts, the wheel diameter and the track.
- Every gear has one **marker tooth** in a contrasting colour (child mesh `<node>.marker`, static relative to its gear), so children can follow a gear round and count turns. The wheels have a yellow marker spoke (`wheel.L.marker`, `wheel.R.marker`).
- `diff.sideA` / `diff.sideB` each hold two rings of teeth: `teeth` counts the horizontal gear driven by the crown wheel (42 / 18), `sideTeeth` the 16 upright teeth that mesh with the pinions.
- Song meshing phase: at all-zero angles every pair is in mesh. A lowered small flat wheel is in mesh only while `(smallR − 2·footR)`, `(smallL + 2·footL)` and `(small + 4·bigFlat)` are multiples of 30°. js/sim does not keep this when it lowers a wheel after a straight run (see `docs/model-notes.md`).

## Materials

Each mesh's glTF material name is a *role* (`wood`, `wood_dark`, `wheel`, `mark`, `lacquer`, `eave`, `peg`, `marker`, `blue`, `orange`, `gold`, `iron`, `rope`, `robe`, `skin`, `hat`); `js/scene/materials.js` RECIPES swap each role for the page's own material, and the GLB's flat colours are never shown. `blue` / `orange` (left / right train) and `marker` must stay clean colours: they take no photographed grain colour and no occlusion.

## UVs and the baked atlas

- `TEXCOORD_0` of every mesh is the **baked occlusion atlas's** UV: the whole chariot unwrapped into one square (`build_chariot.py unwrap()`, deterministic). The page keeps it as `uv1` and lays its own planar grain UVs over `uv` (`materials.js dressChariot`).
- `build_chariot.py bake()` writes ambient occlusion × dust (upward faces a little darker) into `assets/photo/chariot-<mechanism>-ao-{1024,512}.webp` (Cycles, fixed seed). The page reads it as the `aoMap` of the wooden, lacquered, brass and iron roles once it arrives (`data-photo` gains `ao`); lite takes the 512. It only darkens indirect light, so wear that lightens an edge is not expressible this way (`design/decisions/0006-cad-level-chariot.md`).
- The atlas is read top row first (glTF convention): `photo.js` decodes it without the flip it applies to tiled scans.

## Geometry rules

- Gear teeth are **radial block teeth** of hardwood (`params/chariot.json` `gear`: trapezoid section 0.11 at the root, 0.06 at the tip, let through the rim with a tenon showing inside), modelled with the documented counts so children can count them. All gears share one circular pitch, π×2.4/24 ≈ 0.314 chi (宋史 「齒間相去三寸」), except the differential's inner ring-and-pinion set (0.236). Pitch radii follow params: foot gear ⌀2.4, small flat ⌀1.2, big flat ⌀4.8 chi.
- Differential: pitch radii must make the wheel→side gear ratio exactly D / track (`js/sim/params.js` DIFF.inputRatio, from the tooth counts) and the senses match the table above. Report the final layout in `docs/model-notes.md`.
- Running gear from params `wheel` (30 two-part spokes, hollow-section felloe in 15 joints, 1.6° dish, 2.4-long waisted hub, tapered axle arms with caps and linchpins, 伏兔 under the sills) and body from params `body` (the red box 9.5 wide over the wheels; the gear room between the hubs' inner ends). The layout asserts that the gear room's boards clear the hubs, that the Song foot gears sit on the hubs between their inner ends and the spokes, and that the differential's left crown wheel clears both.
- Clearance and meshing: in every pose sampled from `js/sim/scenarios.js`, meshing pairs touch only where designed and no other pair intersects (`pnpm check:model`, `CLEARANCE_OK`). Meshing pairs are tested in every pose in which they are in phase (all differential poses; Song poses with the wheel raised, or lowered in phase). At rest every meshing pair must also pass the `GEAR` lines: pitch circles touching (centre distance = r1 + r2 for parallel axes), each gear's teeth at least half a tooth height into the other's gaps, tooth tips clear of the other's rim (top clearance > 0), and a gap between tooth flanks.
- Budget (`tests/model.test.js`): under 120 k triangles and 5 MB per GLB (classroom tablets; now about 29 k and 1.9 MB). No textures larger than 1024².

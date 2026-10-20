# 3D model contract (Blender GLB ↔ three.js scene ↔ js/sim)

Node names and `extras` in the GLB files are an API. Renaming a node is a breaking change: update this file, the scene binding and the model test together.

## Files

| File | Contents |
|---|---|
| `assets/chariot-differential.glb` | Body + wheels + Lanchester-style differential + figure |
| `assets/chariot-song.glb` | Body + wheels + Yan Su (1027) clutch gear train + figure |

Both are built by `blender/scripts/build_chariot.py -- --mechanism differential|song --out PATH` from `params/chariot.json` (`pnpm build:model`).

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
- `lift`: `pose.clutch.left/right` are booleans that the scene eases to a value e in 0..1 (e = 1 means engaged). The node's position is `rest + axis × distance × (1 − e)`, so a disengaged gear is raised by `distance`.
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

The figure: node `figure` rotates with `pose.figureRel`, which already includes the start-up offset, about +Y. Its arm points along local **+X** at angle 0. The shaft and big gear rotate with `gears.figure` / `gears.bigFlat` / `gears.carrier`.

## Required node names

All nodes are children of root `chariot`.

| Node | Mechanism | Motion |
|---|---|---|
| `body.*` (frame, floor, rails, roof, pole, pillars…) | both | static |
| `wheel.L`, `wheel.R` | both | rotate `wheelL` / `wheelR` |
| `figure` (immortal with outstretched arm) + `figure.shaft` | both | rotate `figure` (shaft: `figure` too) |
| `diff.sideA`, `diff.sideB` (each including its driving horizontal gear) | differential | rotate `sideA` / `sideB` |
| `diff.carrier`, `diff.pinion.0`, `diff.pinion.1` (pinions are children of carrier) | differential | rotate `carrier`; pinions `pinion` about their own axle |
| `diff.crown.L`, `diff.crown.R` (gear fixed to each road wheel) | differential | rotate `wheelL` / `wheelR` |
| `song.foot.L`, `song.foot.R` | song | rotate `footL` / `footR` |
| `song.small.L`, `song.small.R` | song | rotate `smallL` / `smallR` (child of a `song.smallLift.L/R` node that has the `lift` motion) |
| `song.bigFlat` | song | rotate `bigFlat` |
| `song.roller.L`, `song.roller.R` (辕端横木下小轮 and the linkage) | song | lift with clutch (visual only) |

### Teaching extras on every mesh node

```json
{ "group": "shell" | "chassis" | "wheel" | "gear" | "figure", "explode": [dx, dy, dz], "label": "中心大平轮", "teeth": 48 }
```

- `shell`: everything that hides the gears (roof, side boards, railings). X-ray makes it transparent; explode moves it far away.
- `explode`: offset in chi in the chariot frame, used at explode = 1. Gears separate vertically so that the meshing stays readable.
- `label`: Chinese name shown in callouts. `teeth`: tooth count, used by the "count the teeth" tasks.
- Every gear has one **marker tooth** in a contrasting colour (child mesh `<node>.marker`), so children can follow a gear round and count turns.

## Geometry rules

- Gear teeth are wooden pegs (Song style, the text gives tooth pitch 3 寸), modelled as real teeth with the documented counts so children can count them. Pitch radii follow params: foot gear ⌀2.4, small flat ⌀1.2, big flat ⌀4.8 chi.
- Differential: pitch radii must make the wheel→side gear ratio exactly 1 (`params.differential.inputRatio`) and the senses match the table above. Report the final layout in `docs/model-notes.md`.
- Clearance: in every pose sampled from `js/sim/scenarios.js`, meshing pairs touch only where designed and no other pair intersects (`pnpm check:model`).
- Budget: under 120 k triangles per GLB (classroom tablets). Use flat-shaded low-poly wood with vertex colours or simple materials. No textures larger than 1024².

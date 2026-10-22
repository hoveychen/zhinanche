# The South-Pointing Chariot, in 3D

[中文](README.md) · **English**

![A wooden cart in a palace courtyard; the little wooden man on top points his arm at the gate marked South](images/readme-hero.en.jpg)

<p align="center"><img src="images/readme-lap.en.gif" width="560" alt="The cart spins a full turn on the spot while the wooden man's arm stays pointed at the south gate on the right; the compass dial in the top left corner reads Pointing due south all the way round"><br><sub>A full turn on the spot. The man never stops pointing south.</sub></p>

A two-wheeled cart with a wooden man standing on it. Drive it anywhere, turn it however you like, and the man's arm keeps pointing south.

There is no magnet in it. It is a mechanical compass: gears compare how far the left wheel rolled with how far the right wheel rolled, and turn the man back by exactly the angle the cart turned. Chinese texts describe chariots like this for well over a thousand years; the oldest detailed build that survives is Yan Su's, written up in the *History of Song* for the year 1027.

This repo puts one in your browser: a 3D simulation you can drive, draw routes for, X-ray, and pull apart to watch the gears work. It comes with a six-lesson course written for kids aged 9–12 (big type, touch friendly, made for a tablet in a classroom), in Chinese and English.

## Try it

The English page is [`en.html`](en.html) (`index.html` is the Chinese one; same page, but links to it preview in English). Press **中文** / **EN** in the top bar to switch; the address follows.

- **Lessons** walks through it in six steps: what it is, driving it, why the two wheels roll different distances on a turn, how the gears keep the books, the two ways it may have been built, and how it goes wrong.
- **Drive** hands you the reins. Arrow keys or the on-screen pad to drive, **Draw a road** to sketch a route and watch the cart follow it, **See the gears** to fly in and watch them mesh.
- **Break it on purpose.** Make the track too wide, one wheel a little bigger, or let a wheel slip, then drive a lap and watch the man drift off south. Real chariots had exactly this problem.
- **Tap any part** to see what it is.
- **Copy link** puts the whole setup, including the route you drew, into the URL. Whoever opens it watches the same cart drive the same road. Links copied from the English page point at `en.html`, so they open (and preview) in English.

`?free` opens straight into driving; `?lesson=N&step=K` opens lesson N at step K. The address bar keeps up with the lesson, so a teacher can copy the step on screen.

## Run it yourself

No build step. You need Node.js 22+ and pnpm.

```sh
pnpm install
pnpm vendor      # copies three.js into vendor/ (a copy is already committed; optional)
pnpm serve       # tiny static server
```

Open <http://localhost:8080>. Edit a file, reload the page.

Tests and type checks:

```sh
pnpm test        # node:test: the kinematics (tests/sim/), lesson data, share links, ...
pnpm typecheck   # tsc over the JSDoc types
uvx reuse lint   # licence compliance (or: pip install reuse && reuse lint)
```

The 3D models come out of Blender scripts (point `BLENDER=/path/to/blender` at your install):

```sh
pnpm build:model   # writes assets/*.glb
pnpm check:model   # checks the gears don't collide
```

## Publishing

The site is on GitHub Pages at <https://hoveychen.github.io/zhinanche/en.html> (Chinese: <https://hoveychen.github.io/zhinanche/>), the source at <https://github.com/hoveychen/zhinanche>. The repository is the site, with no build step: in the repository's Pages settings, deploy from a branch, `main`, folder `/`. Keep the empty `.nojekyll` at the root: without it GitHub Pages runs the site through Jekyll, which leaves out `vendor/`, and three.js would not load.

The address is written in three places; move the site and change them together (`tests/entry.test.js` checks they agree):

- `site` and `repo` in [`js/site.js`](js/site.js); with `repo` set, a "Source code" link shows under the lesson list.
- The link previews in the `<head>` of [`index.html`](index.html) (Chinese) and [`en.html`](en.html) (English): `og:url`, `og:image` / `twitter:image` and the three `hreflang` links are absolute, as most sites want for previews.

Post `…/en.html` to English-speaking places (on GitHub Pages `…/en` works as well). The preview images (1200×630) are screenshots of the 3D scene with the title laid over it.

## How faithful is it?

**Short version:** the motion is exact kinematics; the Song-dynasty build uses the tooth counts from the original text; and nobody alive knows for sure how these chariots were actually built. The course says so out loud and makes a lesson of it.

**From the sources (*History of Song*, chapter 149):**

- **Yan Su's chariot (1027):** wheels 6 *chi* across; a 24-tooth gear standing on each road wheel; a 12-tooth small gear on each side; a 48-tooth big central gear. It works with a clutch: when the cart turns, the shaft drops the outer wheel's gear into mesh. On a 90° turn the big gear moves 12 teeth, a quarter turn, which is the text's own worked example. The simulation matches it exactly.
- **Wu Deren's chariot (1107)** is mentioned in the course (big gear of 100 teeth, and so on) but **not modelled**: the text doesn't say clearly enough how its gears connect.
- No lodestone anywhere: both Song descriptions are gears and clutches only.

**Reconstructed (educated guesses):**

- **The differential-gear version is a 20th-century reconstruction** (George Lanchester, 1947), not something a Song text describes. It's the default here because it stays accurate on any route; the Song clutch version is one switch away. Why: [decision 0001](design/decisions/0001-which-reconstruction.md).
- **Yan Su's track width** isn't given. It's set to 6 *chi*, equal to the wheel diameter, which is what makes the tooth ratios work (following Needham's analysis).
- For Yan Su's chariot to stay accurate, the driver has to stop the inner wheel on a turn and swing the cart round it. That's inferred, not written. The sim has it as a "driver helps" switch, on by default for the Song chariot; switch it off and the man drifts.
- Even with the driver helping, Yan Su's chariot is not perfect. Each time a small gear drops back in, its teeth have to find the gaps again, and that nudges the big gear a little (the sim pushes it to the nearest gap from the real tooth positions: at most half a tooth, 3.75°, worked out exactly, no randomness), so after many turns the man is a few degrees off. This comes from a rigid-body physics check ([physics report](research/physics/REPORT.md), in Chinese); a real chariot would also now and then slip a whole tooth, which the sim leaves out, so it would drift somewhat more. The differential never lifts a gear and has no such error. See [decision 0007](design/decisions/0007-song-clutch-error.md) (in Chinese).
- On Yan Su's chariot the teeth of the small and big flat gears are roofed top and bottom, and every tooth tip is chamfered, so a dropping small gear doesn't jam tooth face on tooth face. That shape is what the physics check suggests; no old text describes the teeth.

**Simplified or exaggerated for teaching:**

- Every dimension of the differential version (tooth counts; same wheels and track as Yan Su's) is our choice.
- The wheels, axle and gears follow the old texts and finds: 30 two-part spokes, a hollow-section felloe, a long hub with iron bands, a dished wheel, tapered axle arms with caps and linchpins, 伏兔 blocks, from the *Kaogongji* with Zheng Xuan's commentary, the measured bronze chariot no. 2 of the First Emperor's tomb (scaled by wheel diameter) and the *Yingzao Fashi*; the teeth are radial hardwood blocks let through the rim, after a surviving Chinese wooden gear (Hommel 1937), the *Nongshu* and the *Tiangong Kaiwu*. No Song text says a word about spoke counts, hubs or felloes, so these are "after the old rule", not Song finds; the hub is shorter than the rule to make room for the gears. See [decision 0006](design/decisions/0006-cad-level-chariot.md) and the [research report](research/cad-level/REPORT.md) (in Chinese).
- The body follows the words of the *History of Song* (red, a second tier, railings, pierced brackets, hanging pouches, an immortal on top, one pole with a phoenix head) and the painted procession scroll; its sizes are borrowed from Wu Deren's chariot, the other Song south-pointing chariot with recorded dimensions. The box carries the paintings the *History of Song* names ("an azure dragon and a white tiger on the two sides, flowers and birds on all four"), but which side has which beast and how big the central panel is are guesses, and **the dragon, tiger and flower pictures themselves were generated for this project with an image model**: no Song original survives to copy. The red lacquer on the gear room under the box and on the hubs is a guess too. The man is carved after the immortals of Song painting, only to be pretty and readable. See [decision 0008](design/decisions/0008-chariot-readability.md) (in Chinese). The Song clutch's cord twisted and run over a small pulley, and the lacquered drum over the shaft's hole in the top deck, are this project's own, added so they look like real things close up; the text says nothing of them. See [decision 0011](design/decisions/0011-closeup-realism-and-highlight.md) (in Chinese).
- The two children of lesson 3 are after the children of Song paintings of children at play (hair in two buns, a short crossed jacket); the ice, the glow round a part being named and the box's edges in x-ray are ways of showing, not findings.
- The faults in the "break it" demos (track 10% wide, one wheel 5% big, 20% slip) are exaggerated so the drift shows within a few moves. Real errors were much smaller, but they add up over a long road.
- One Song *chi* is taken as 0.31 m, used only to show metres on screen.
- The courtyard, the gate and the sky are a set, not a reconstruction of any real palace. The sky, paving, walls, roof tiles and the chariot's wood are photographed scans (Poly Haven, CC0); the weathering, shadows and sky occlusion are procedural or baked while the page loads, only so the picture reads like a photograph. See [decision 0004](design/decisions/0004-realtime-photo-look.md) (in Chinese). The paving relaid in staggered courses with a tone of its own per slab, the haze over the distance, and the wood beyond the west wall that puts the court in shade and leaves the chariot in a lane of sun are arranged for the picture too; see [decision 0013](design/decisions/0013-art-round-air-reds-light.md) (in Chinese).
- The rubs on the chariot's lacquer, the edges worn through to the black ground, the grime in its corners and the yellowed varnish over the paintings are made in the shader from edge and corner masks baked from the model and a photographed lacquer scan, only so it looks like a real chariot that has been used; they are not measured from any artefact. The gears' blue, orange and yellow are dyes on the wood to tell the two trains apart, for teaching. The far trees take half the haze of the walls and halls. See [decision 0014](design/decisions/0014-lacquer-wear-stained-gears-cool-air.md) (in Chinese).
- The pines and firs are Poly Haven's CC0 tree models, rendered in Blender from 16 directions into cards; where they stand and how they are grouped is arranged for the picture. The rows of round tiles on the roofs, the tile ends, drip tiles and rafter ends along the eaves and the bracket sets under them are drawn by us after the general Qing manner (a baked height field with the grain of a photographed glaze), only so they read in the usual views: the row spacing, the number of bracket sets and the paintwork follow no particular building, and the gate keeps its flat roofs, only tiled and bracketed. See [decision 0005](design/decisions/0005-trees-and-eaves.md) (in Chinese).

Every number has its source and a confidence label in [`params/chariot.json`](params/chariot.json) (labels explained in [`docs/sources.md`](docs/sources.md)). The research behind it, and what it doesn't cover, is in [`research/REPORT.md`](research/REPORT.md); bibliography in [`research/sources/bibliography.md`](research/sources/bibliography.md). Those are in Chinese.

## What's where

```
index.html            entry point (importmap loads vendor/three)
js/sim/               pure-logic simulation, no three.js
  chariot.js            kinematics of the differential and Yan Su clutch mechanisms
  drive.js              ways of driving, including Yan Su's pivot-on-the-inner-wheel turn
  route.js              following a drawn route
params/chariot.json   the one source of parameters, each tagged sourced / estimated / chosen
js/teach/             the course: lessons.js (+ lessons.en.js), strings.js (+ strings.en.js)
js/scene/, js/app/    the 3D scene and the lesson player
assets/               chariot models (GLB, generated by blender/scripts)
tests/                node:test tests
research/             research report, original texts, bibliography
design/decisions/     design decision records
```

## Licence

- Code: [Apache-2.0](LICENSE)
- Lesson text, 3D models, parameters, docs: [CC BY-SA 4.0](LICENSES/CC-BY-SA-4.0.txt)
- three.js: MIT
- Lesson pictures: per file. *Sancai Tuhui* (public domain); Andy Dingley's photo of the Science Museum, London model (CC BY 3.0); SSR2000's photo of the gears at Taiwan's National Museum of Natural Science (CC BY-SA 3.0)
- Sky and surface scans: Poly Haven, CC0 (downloaded and recompressed by `tools/assets/build_photo.py`); the chariot's ironwork uses rusty_metal_04 (Amal Kumar), the gloss of its lacquer (rubs, scratches, board seams) lacquered_cherry_wood (Jenelle van Heerden, Rico Cilliers)
- The chariot's occlusion atlases (`assets/photo/chariot-*-ao-*.webp`; R occlusion and dust, G worn edges, B grimy corners): baked from our own models, CC BY-SA 4.0 (`pnpm build:model`)
- Tree models: Poly Haven's pine_tree_01 and fir_tree_01 (modelled by Rico Cilliers, photographed by Rob Tuytel), CC0 (downloaded by `tools/assets/fetch_models.py`, rendered into cards by `blender/scripts/render_impostors.py`)
- Roof tile and bracket textures: our own height fields with the grain of Poly Haven scans (clay_roof_tiles_02, plaster), CC BY-SA 4.0 (`tools/assets/build_photo.py`)

Details in [`docs/licensing.md`](docs/licensing.md) and [`REUSE.toml`](REUSE.toml). The setup follows [leibniz-stepped-reckoner](https://github.com/wixette/leibniz-stepped-reckoner).

# The South-Pointing Chariot, in 3D

[中文](README.md) · **English**

![A wooden cart in a palace courtyard; the little wooden man on top points his arm at the gate marked South](images/readme-hero.en.jpg)

<p align="center"><img src="images/readme-lap.en.gif" width="560" alt="The cart spins a full turn on the spot while the wooden man's arm stays pointed at the south gate on the left; the compass dial in the corner reads Pointing due south all the way round"><br><sub>A full turn on the spot. The man never stops pointing south.</sub></p>

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

Where it will live isn't decided yet. Before it goes up, fill in:

- `repo` in [`js/site.js`](js/site.js): the source repository; once set, a "Source code" link shows under the lesson list.
- The link previews in the `<head>` of [`index.html`](index.html) (Chinese) and [`en.html`](en.html) (English). `og:image` / `twitter:image` are relative (`images/og.jpg`, `images/og.en.jpg`) and most sites want absolute URLs: make them `https://<site>/images/og.jpg` and `https://<site>/images/og.en.jpg`, add `<meta property="og:url" content="https://<site>/">` (and `…/en.html` in en.html), and make the three `hreflang` links absolute too.

Post `https://<site>/en.html` to English-speaking places (on GitHub Pages `https://<site>/en` works as well). The preview images (1200×630) are screenshots of the 3D scene with the title laid over it.

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

**Simplified or exaggerated for teaching:**

- Every dimension of the differential version (tooth counts; same wheels and track as Yan Su's) is our choice.
- The body, railings and the man's look are there to be pretty and readable, not archaeology.
- The faults in the "break it" demos (track 10% wide, one wheel 5% big, 20% slip) are exaggerated so the drift shows within a few moves. Real errors were much smaller, but they add up over a long road.
- One Song *chi* is taken as 0.31 m, used only to show metres on screen.

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

Details in [`docs/licensing.md`](docs/licensing.md) and [`REUSE.toml`](REUSE.toml). The setup follows [leibniz-stepped-reckoner](https://github.com/wixette/leibniz-stepped-reckoner).

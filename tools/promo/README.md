# Promo images

How `images/og*.jpg`, `images/readme-hero*.jpg` and `images/readme-lap*.gif` are made. Not part of the site.

Setup: run from this folder with playwright beside it (`node_modules` with `playwright`, driving the system Chrome; not a dependency of the site) and the site served from the repo root, e.g. `PORT=8980 node tools/serve.mjs`, then `export PORT_=8980`. Every script opens the page with `?promo&quality=high&free`, waits for all ten photographed sets in `body[data-photo]` (sky plaster ground roof dougong iron wood trees ao murals) and for `body[data-still]=settled` before it shoots. One browser at a time.

Coordinates are the courtyard's (three.js): the chariot at the origin, the gate pinned at (0, 105), which is south; `pose` is `[x, z, heading]`, heading π/2 facing north.

## README hero (1600×700)

```sh
for L in zh en; do
  LANG_=$L SIZE=800x350 DPR=2 JOBS='[{"name":"hero-'$L'","pose":[0,0,0.9],"cam":{"pos":[-13.5,9.6,-24.5],"target":[7,7.2,14]},"fov":40}]' node still.mjs
done
ffmpeg -i hero-zh.png -q:v 3 ../../images/readme-hero.jpg; ffmpeg -i hero-en.png -q:v 3 ../../images/readme-hero.en.jpg
```

## og:image (1200×630)

The same chariot three times, turned three ways, composited (`comp3.py`) over the courtyard without it. The camera is high (26) so the red bodies stand on the grey paving, not against the red wall; the gate sits top right (`plan.py` puts it at screen x 0.86).

```sh
P='[[8.95,-13.66,0.4],[-3.81,-2.6,1.9],[-16.35,8.27,3.4]]'
for L in zh en; do
  sh og.sh f-$L $L '{"pos":[-37,26,-40],"target":[-17.35,18.5,-17.33]}' 34 "$P" 2
  uv run --with pillow --with numpy python comp3.py f-$L 3 0.75,0.88,1
  LANG_=$L DIR=f-$L node title.mjs        # f-$L/titled.png, then down to 1200×630, JPEG q86
done
```

## README loop (560×315 GIF)

`shots-gif.js`: one turn on the spot in 6 s, the camera still, 50° west of looking due south (as far round as keeps the gate in the picture, decision 0015) so the figure's pointer runs across to the gate; it starts and ends side-on with the near wheel showing.

```sh
for L in zh en; do
  LANG_=$L DIAL=left GIF=1 SHOTS=shots-gif.js W=1120 H=630 OUT=fg-$L node rec.mjs
done
sh gif.sh fg-zh ../../images/readme-lap.gif; sh gif.sh fg-en ../../images/readme-lap.en.gif
```

## Checking

`uv run --with pillow python cmp.py BEFORE_DIR ../../images OUT_DIR` lays the old images (`git show main:images/…`) over the new, three frames of each GIF, and the og image at 500 px as a link preview shows it.

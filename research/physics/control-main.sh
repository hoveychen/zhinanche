#!/bin/sh
# Control on the old geometry (main 16a1781, peg teeth replaced by REPORT §6.3 blocks made to fit = design A).
#   git archive 16a1781 params blender/scripts/lib | tar -x -C /tmp/zhinanche-polish/physics/geom-16a1781
set -e
B="uv run --with mujoco --with numpy python batch.py --root ${GEOM_OLD:-/tmp/zhinanche-polish/physics/geom-16a1781} --routes out/routes.json --out out/results-main.json --design A"
$B --tag A --only 'differential:any:*,song:pivot:*' --set '' --set 'chamfer=0.05'

#!/bin/sh
# Every run in the report, on the CAD geometry: params/ and blender/scripts/lib/ of main 03d51de (= prd/cad-chariot af674e6, unchanged), exported by
#   git archive 03d51de params blender/scripts/lib | tar -x -C /tmp/zhinanche-polish/physics/geom-03d51de
# From research/physics:  sh sweeps.sh      (about 50 min on 10 cores; results append to out/results-cad.json)
# W = the Song train held down by a latch once home, wood greased to friction 0.1.
set -e
B="uv run --with mujoco --with numpy python batch.py --root ${GEOM:-/tmp/zhinanche-polish/physics/geom-03d51de} --out out/results-cad.json"
W='latch=true;friction=0.1'
$B --tag base
$B --tag hold --only 'song:*' --set 'clutch_push=1000' --set 'clutch_push=5000' --set 'latch=true'
$B --tag friction --set 'friction=0.0' --set 'friction=0.1' --set 'friction=0.2' --set 'friction=0.6'
$B --tag friction --only 'song:*' --set 'latch=true;friction=0.0' --set "$W" --set 'latch=true;friction=0.2'
$B --tag backlash --set 'backlash=0.3' --set 'backlash=0.6'
$B --tag backlash --only 'song:*' --set "$W;backlash=0.3" --set "$W;backlash=0.6"
$B --tag chamfer --set 'chamfer=0.02' --set 'chamfer=0.04'
$B --tag chamfer --only 'song:*' --set "$W;chamfer=0.02" --set "$W;chamfer=0.04"
$B --tag dwell --only 'song:*' --set "$W;dwell_lower=1.5" --set "$W;dwell_lower=1.5;chamfer=0.04"
$B --tag combo --only 'song:*' --set "$W;chamfer=0.06" --set "$W;chamfer=0.04;backlash=0.6" --set "$W;chamfer=0.06;dwell_lower=1.5" --set "chamfer=0.04;friction=0.0"
R='ridge=["small.L","small.R","big"]'
$B --tag ridge --only 'song:*' --set "$W;$R" --set "$W;$R;chamfer=0.04" --set "$R" --set "friction=0.1;$R"

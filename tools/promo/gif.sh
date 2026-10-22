# gif.sh frames-dir out.gif [colours] [bayer scale]: the README loop from rec.mjs's frames (GIF=1 W=1120 H=630), 12 fps, 560 wide
set -e
C=${3:-192}; B=${4:-3}
ffmpeg -loglevel error -y -framerate 30 -pattern_type glob -i "$1/*.jpg" \
  -vf "fps=12,scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${C}:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=${B}" \
  -loop 0 "$2"

# enc.sh frames-dir out.mp4 [kbps]
set -e
B=${3:-6800}
LOG=$(mktemp -d)/x264
ffmpeg -loglevel error -y -framerate 30 -pattern_type glob -i "$1/*.jpg" -c:v libx264 -preset slow -b:v ${B}k -pass 1 -passlogfile $LOG -pix_fmt yuv420p -an -f mp4 /dev/null
ffmpeg -loglevel error -y -framerate 30 -pattern_type glob -i "$1/*.jpg" -c:v libx264 -preset slow -b:v ${B}k -maxrate $((B*2))k -bufsize $((B*2))k -pass 2 -passlogfile $LOG -pix_fmt yuv420p -movflags +faststart "$2"
rm -f $LOG*

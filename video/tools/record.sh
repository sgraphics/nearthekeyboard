#!/usr/bin/env bash
# Record an Android device's screen for longer than screenrecord's 3-minute
# limit: back-to-back segments on the device, joined into one file on stop.
#
#   video/tools/record.sh start <name>    # starts recording in the background
#   video/tools/record.sh stop <name>     # stops, pulls, joins -> video/raw/<name>.mp4
#
# Pick a device with ANDROID_SERIAL when more than one is attached.
set -euo pipefail
export MSYS_NO_PATHCONV=1
cmd="${1:-}"; name="${2:-}"
[ -n "$cmd" ] && [ -n "$name" ] || { echo "usage: $0 start|stop <name>"; exit 2; }
case "$name" in *[!A-Za-z0-9_-]*) echo "name: letters, digits, - and _ only"; exit 2;; esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RAW="$ROOT/video/raw"
STATE="$RAW/.rec-$name"
DEV=/data/local/tmp
mkdir -p "$RAW"

case "$cmd" in
start)
  [ -e "$STATE.pid" ] && { echo "already recording $name"; exit 1; }
  rm -f "$STATE.stop"
  adb shell "rm -f $DEV/ntkrec-$name-*.mp4"
  (
    n=0
    while [ ! -e "$STATE.stop" ]; do
      adb shell screenrecord --bit-rate 12000000 --time-limit 170 "$DEV/ntkrec-$name-$(printf %03d $n).mp4" || true
      n=$((n + 1))
    done
  ) >/dev/null 2>&1 &
  echo $! > "$STATE.pid"
  echo "recording $name (stop with: $0 stop $name)"
  ;;
stop)
  [ -e "$STATE.pid" ] || { echo "not recording $name"; exit 1; }
  touch "$STATE.stop"
  adb shell "pkill -INT screenrecord" || true
  pid="$(cat "$STATE.pid")"
  for _ in $(seq 1 30); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  rm -f "$STATE.pid" "$STATE.stop"
  sleep 1
  tmp="$(mktemp -d)"
  for f in $(adb shell "ls $DEV/ntkrec-$name-*.mp4 2>/dev/null" | tr -d '\r'); do
    adb pull -q "$f" "$tmp/" >/dev/null
  done
  adb shell "rm -f $DEV/ntkrec-$name-*.mp4"
  ls "$tmp"/*.mp4 >/dev/null 2>&1 || { echo "no segments recorded"; rm -rf "$tmp"; exit 1; }
  : > "$tmp/list.txt"
  for f in "$tmp"/*.mp4; do echo "file '$(basename "$f")'" >> "$tmp/list.txt"; done
  # screenrecord writes a frame only when the screen changes; make it a steady 30 fps
  (cd "$tmp" && ffmpeg -v error -y -f concat -safe 0 -i list.txt -vf fps=30,format=yuv420p \
    -c:v libx264 -preset veryfast -crf 18 -movflags +faststart "$RAW/$name.mp4")
  rm -rf "$tmp"
  echo "$RAW/$name.mp4: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$RAW/$name.mp4") s"
  ;;
*) echo "usage: $0 start|stop <name>"; exit 2 ;;
esac

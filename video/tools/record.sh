#!/usr/bin/env bash
# Record an Android device's screen for longer than screenrecord's 3-minute
# limit: back-to-back segments on the device, joined into one file on stop.
#
#   video/tools/record.sh start <name>    # starts recording in the background
#   video/tools/record.sh stop <name>     # stops, pulls, joins -> video/raw/<name>.mp4
#
# Also writes video/raw/<name>.timeline: per segment, the computer's clock
# (seconds since 1970) when the segment was started and where the segment
# begins in the joined file. video/tools/marks.mjs uses it to turn times
# noted on the computer during the recording into times in the video.
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
now() { date +%s.%N | cut -c1-14; }
# adb, ffmpeg and ffprobe are native Windows programs under Git Bash: give them C:/... paths.
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

case "$cmd" in
start)
  [ -e "$STATE.pid" ] && { echo "already recording $name"; exit 1; }
  rm -f "$STATE.stop" "$STATE.starts"
  adb shell "rm -f $DEV/ntkrec-$name-*.mp4"
  (
    n=0
    while [ ! -e "$STATE.stop" ]; do
      echo "$(printf %03d $n) $(now)" >> "$STATE.starts"
      adb shell screenrecord --bit-rate 12000000 --time-limit 170 "$DEV/ntkrec-$name-$(printf %03d $n).mp4" || true
      n=$((n + 1))
    done
  ) >/dev/null 2>&1 &
  echo $! > "$STATE.pid"
  echo "recording $name (stop with: $0 stop $name)"
  ;;
stop)
  [ -e "$STATE.pid" ] || { echo "not recording $name"; exit 1; }
  stopped=$(now)
  touch "$STATE.stop"
  adb shell "pkill -INT screenrecord" || true
  pid="$(cat "$STATE.pid")"
  for _ in $(seq 1 30); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  rm -f "$STATE.pid" "$STATE.stop"
  sleep 1
  tmp="$(mktemp -d)"
  for f in $(adb shell "ls $DEV/ntkrec-$name-*.mp4 2>/dev/null" | tr -d '\r'); do
    adb pull -q "$f" "$(native "$tmp")/" >/dev/null
  done
  adb shell "rm -f $DEV/ntkrec-$name-*.mp4"
  ls "$tmp"/*.mp4 >/dev/null 2>&1 || { echo "no segments recorded"; rm -rf "$tmp"; exit 1; }
  : > "$tmp/list.txt"
  : > "$RAW/$name.timeline"
  at=0
  last_start=0; last_dur=0
  for f in "$tmp"/*.mp4; do
    echo "file '$(basename "$f")'" >> "$tmp/list.txt"
    seg=$(basename "$f" .mp4); seg=${seg##*-}
    started=$(awk -v s="$seg" '$1 == s { print $2 }' "$STATE.starts" 2>/dev/null)
    dur=$(cd "$tmp" && ffprobe -v error -show_entries format=duration -of csv=p=0 "$(basename "$f")")
    echo "$seg ${started:-0} $at $dur" >> "$RAW/$name.timeline"
    last_start=${started:-0}; last_dur=$dur
    at=$(awk -v a="$at" -v d="$dur" 'BEGIN { printf "%.3f", a + d }')
  done
  rm -f "$STATE.starts"
  # screenrecord writes a frame only when the screen changes, so a still screen at the end
  # leaves no frames: hold the last frame until the recording was stopped (a segment shows
  # its first frame about 0.1 s after it is started). Then make it a steady 30 fps.
  hold=$(awk -v s="$stopped" -v b="$last_start" -v d="$last_dur" 'BEGIN { h = s - b - 0.1 - d; printf "%.2f", (b > 0 && h > 0.1) ? h : 0 }')
  vf="fps=30,format=yuv420p"
  [ "$hold" != "0.00" ] && vf="tpad=stop_mode=clone:stop_duration=$hold,$vf"
  (cd "$tmp" && ffmpeg -v error -y -f concat -safe 0 -i list.txt -vf "$vf" \
    -c:v libx264 -preset veryfast -crf 18 -movflags +faststart "$(native "$RAW/$name.mp4")")
  rm -rf "$tmp"
  echo "$RAW/$name.mp4: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$(native "$RAW/$name.mp4")") s"
  ;;
*) echo "usage: $0 start|stop <name>"; exit 2 ;;
esac

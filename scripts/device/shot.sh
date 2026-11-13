#!/usr/bin/env bash
# Screenshot.   bash scripts/device/shot.sh <name>   ->  captures/<name>.png (NTK_OUT to change)
set -e
. "$(dirname "$0")/_lib.sh"
[ -n "${1:-}" ] || { echo "usage: shot.sh <name>"; exit 2; }
mkdir -p "$OUT"
adb exec-out screencap -p > "$OUT/$1.png"
echo "$OUT/$1.png"

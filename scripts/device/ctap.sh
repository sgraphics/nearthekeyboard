#!/usr/bin/env bash
# Tap through the emulator's own touch screen, so the tap shows on a recording
# when "show taps" is on (adb shell settings put system show_touches 1). Taps
# from `adb shell input tap` and from the robot typist are injected past the
# touch screen and never show. Emulator only.
#   bash scripts/device/ctap.sh <x> <y> [hold ms]
#   bash scripts/device/ctap.sh --text "<text>"     the first element whose text contains it
#   bash scripts/device/ctap.sh --exact "<text>"    the first element whose text is exactly it
#   bash scripts/device/ctap.sh --id "<resource id>"
set -e
. "$(dirname "$0")/_lib.sh"
hold=90
case "${1:-}" in
  --text|--exact|--id)
    [ -n "${2:-}" ] || { echo "usage: ctap.sh --text|--exact|--id <value>"; exit 2; }
    dump=$(bash "$(dirname "$0")/ui.sh")
    case "$1" in
      --text) line=$(echo "$dump" | grep -F -- "$2" | head -1) ;;
      --exact) line=$(echo "$dump" | awk -F'\t' -v t="\"$2\"" '$1 == t' | head -1) ;;
      --id) line=$(echo "$dump" | awk -F'\t' -v t="$2" '$2 == t || $2 ~ (":id/" t "$")' | head -1) ;;
    esac
    [ -n "$line" ] || { echo "no element: $2"; exit 1; }
    set -- $(echo "$line" | awk -F'\t' '{print $3}') "${3:-$hold}"
    ;;
esac
[ -n "${1:-}" ] && [ -n "${2:-}" ] || { echo "usage: ctap.sh <x> <y> [hold ms] | --text <text> | --exact <text> | --id <id>"; exit 2; }
x=$1; y=$2; ms=${3:-$hold}
adb emu event mouse "$x" "$y" 0 1 >/dev/null
sleep "$(awk -v m="$ms" 'BEGIN { printf "%.3f", m / 1000 }')"
adb emu event mouse "$x" "$y" 0 0 >/dev/null
echo "tapped $x $y"

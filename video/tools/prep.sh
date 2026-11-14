#!/usr/bin/env bash
# Get a device ready to be filmed (TODO.md T.6), and back.
#   video/tools/prep.sh on     taps visible, a clean status bar (System UI demo mode), Do Not Disturb on,
#                              the light look (NTK_NIGHT=yes films the dark one)
#   video/tools/prep.sh off    all of it back as it was
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SAVED="$ROOT/video/raw/.night-mode-before"
demo() { adb shell am broadcast -a com.android.systemui.demo "$@" >/dev/null; }
case "${1:-}" in
on)
  mkdir -p "$ROOT/video/raw"
  # "Night mode: yes" -> yes; keep it to put back afterwards (the emulator may have been left dark).
  [ -e "$SAVED" ] || adb shell cmd uimode night | tr -d '\r' | awk '{print $3}' > "$SAVED"
  adb shell cmd uimode night "${NTK_NIGHT:-no}" >/dev/null
  adb shell settings put system show_touches 1
  adb shell settings put global sysui_demo_allowed 1
  demo -e command enter
  demo -e command clock -e hhmm 1200
  demo -e command notifications -e visible false
  demo -e command battery -e level 100 -e plugged false -e powersave false
  demo -e command network -e wifi show -e level 4 -e fully true
  demo -e command network -e mobile hide
  adb shell cmd notification set_dnd on >/dev/null
  echo "taps visible, clean status bar, Do Not Disturb on, night mode ${NTK_NIGHT:-no}"
  ;;
off)
  adb shell settings put system show_touches 0
  demo -e command exit
  adb shell cmd notification set_dnd off >/dev/null
  if [ -s "$SAVED" ]; then adb shell cmd uimode night "$(cat "$SAVED")" >/dev/null; rm -f "$SAVED"; fi
  echo "back to normal"
  ;;
*) echo "usage: $0 on|off"; exit 2 ;;
esac

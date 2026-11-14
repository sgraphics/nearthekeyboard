#!/usr/bin/env bash
# Turn the NTK keyboard on and make it the current keyboard.   bash scripts/device/ime-on.sh
set -e
. "$(dirname "$0")/_lib.sh"
id=$(adb shell ime list -a -s | tr -d '\r' | grep "^$PKG/" | head -1)
[ -n "$id" ] || { echo "NTK is not installed (run install.sh)"; exit 1; }
adb shell ime enable "$id"
adb shell ime set "$id"
# Emulators report a hardware keyboard; show the on-screen keyboard anyway.
adb shell settings put secure show_ime_with_hard_keyboard 1

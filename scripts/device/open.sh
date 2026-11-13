#!/usr/bin/env bash
# Open a URL on the device.   bash scripts/device/open.sh https://ntk.tools/e65ee28db5
set -e
. "$(dirname "$0")/_lib.sh"
[ -n "${1:-}" ] || { echo "usage: open.sh <url>"; exit 2; }
adb shell am start -a android.intent.action.VIEW -d "$1"

#!/usr/bin/env bash
# Tap the first element whose text (or content description) contains <text>.
#   bash scripts/device/tap-text.sh "Log in with a NEAR wallet"
set -e
. "$(dirname "$0")/_lib.sh"
[ -n "${1:-}" ] || { echo "usage: tap-text.sh <text>"; exit 2; }
line=$(bash "$(dirname "$0")/ui.sh" | grep -F -- "$1" | head -1)
[ -n "$line" ] || { echo "no element with text: $1"; exit 1; }
xy=$(echo "$line" | awk -F'\t' '{print $3}')
adb shell input tap $xy
echo "tapped $xy: $line"

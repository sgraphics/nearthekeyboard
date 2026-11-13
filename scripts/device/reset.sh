#!/usr/bin/env bash
# Clear the app's data (account key, settings, debug sessions).   bash scripts/device/reset.sh
set -e
. "$(dirname "$0")/_lib.sh"
adb shell pm clear "$PKG"

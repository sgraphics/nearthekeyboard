#!/usr/bin/env bash
# Build the debug APK and install it.   bash scripts/device/install.sh
set -e
. "$(dirname "$0")/_lib.sh"
(cd "$REPO/android" && ./gradlew -q assembleDebug)
adb install -r -t "$REPO/android/app/build/outputs/apk/debug/app-debug.apk"

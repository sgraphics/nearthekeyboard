#!/usr/bin/env bash
# Switch on the stamp-button accessibility service (TODO.md section 6).
#   bash scripts/device/a11y-on.sh [service class]
# The service is not built yet; pass its class once it exists.
set -e
. "$(dirname "$0")/_lib.sh"
svc="${1:-tools.ntk.a11y.StampButtonService}"
adb shell settings put secure enabled_accessibility_services "$PKG/$svc"
adb shell settings put secure accessibility_enabled 1

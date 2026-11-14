#!/usr/bin/env bash
# Switch on the stamp-button accessibility service (TODO.md section 6).
#   bash scripts/device/a11y-on.sh [service class]
# Instrumented tests restart the app's process; Android then counts the service
# as crashed and does not bind it again while the setting stays the same. So the
# setting is cleared first and then written, which binds it afresh.
# Switch it off with: adb shell settings delete secure enabled_accessibility_services
set -e
. "$(dirname "$0")/_lib.sh"
svc="${1:-tools.ntk.a11y.StampButtonService}"
adb shell settings delete secure enabled_accessibility_services >/dev/null
sleep 1
adb shell settings put secure enabled_accessibility_services "$PKG/$svc"
adb shell settings put secure accessibility_enabled 1
for _ in $(seq 1 10); do
  adb shell dumpsys accessibility | grep -q "Bound services:{Service\[label=NTK" && { echo "stamp buttons on"; exit 0; }
  sleep 1
done
echo "the service is switched on but not bound yet"

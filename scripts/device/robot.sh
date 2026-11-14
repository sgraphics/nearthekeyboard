#!/usr/bin/env bash
# Run the robot typist tests (TODO.md T.4) and keep the app installed.
#   bash scripts/device/robot.sh            capture test only (no network)
#   bash scripts/device/robot.sh flow       enroll + stamp + impostor against the live enclave (minutes)
#   bash scripts/device/robot.sh stamp      typist A stamps on the enrolled account (rehearsal; minutes)
#   bash scripts/device/robot.sh all
set -e
. "$(dirname "$0")/_lib.sh"
(cd "$REPO/android" && ./gradlew -q installDebug installDebugAndroidTest)
case "${1:-capture}" in
  capture) cls="-e class tools.ntk.CaptureTest" ;;
  flow) cls="-e class tools.ntk.FlowTest" ;;
  stamp) cls="-e class tools.ntk.StampTest" ;;
  all) cls="" ;;
  *) echo "usage: robot.sh [capture|flow|stamp|all]"; exit 2 ;;
esac
adb logcat -c
adb shell am instrument -w $cls "$TEST_RUNNER"
adb logcat -d -s NTK-ROBOT

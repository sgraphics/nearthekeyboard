#!/usr/bin/env bash
# Follow NTK's log. Debug builds log session sizes and states under the tag NTK, never keystrokes.
#   bash scripts/device/logs.sh
. "$(dirname "$0")/_lib.sh"
exec adb logcat -s NTK NTK-ROBOT

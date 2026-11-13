#!/usr/bin/env bash
# Get an emulator ready for tests: screen on and unlocked, NTK installed and selected.
#   bash scripts/device/prepare.sh
set -e
. "$(dirname "$0")/_lib.sh"
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell svc power stayon true
state=$(adb shell dumpsys user | tr -d '\r' | grep -m1 'State:' | awk '{print $2}')
[ "$state" = "RUNNING_UNLOCKED" ] || echo "warning: the device user is $state (a lock credential is set); app screens will not open until it is unlocked"
# DNS over TLS to Cloudflare: a stale negative cache on the dev router hid ntk.tools from the emulator.
adb shell settings put global private_dns_mode hostname
adb shell settings put global private_dns_specifier one.one.one.one
bash "$(dirname "$0")/install.sh"
bash "$(dirname "$0")/ime-on.sh"

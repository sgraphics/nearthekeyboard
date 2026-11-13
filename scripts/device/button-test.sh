#!/usr/bin/env bash
# Button test (TODO.md T.4): with the stamp-button service on, the demo feed in
# Chrome shows an NTK button over the built-in reply's tag; a tap opens the
# verify page, and its element dump says MATCH. Needs a debug build (the
# service logs where it put its buttons under the tag NTK; never screen text).
#   bash scripts/device/button-test.sh [feed url] [stamp id]
# Screenshots: captures/button-feed.png, captures/button-verify.png (NTK_OUT to change).
set -e
. "$(dirname "$0")/_lib.sh"
feed="${1:-https://ntk.tools/feed/}"
id="${2:-e65ee28db5}"
bash "$(dirname "$0")/a11y-on.sh"
adb logcat -c
adb shell am start -a android.intent.action.VIEW -d "$feed" --es com.android.browser.application_id tools.ntk.tests >/dev/null
rect=""
for i in $(seq 1 40); do
  sleep 1
  rect=$(adb logcat -d -s NTK | tr -d '\r' | grep "buttons:" | grep -o "$id[@~][0-9 -]*" | tail -1 | sed "s/^$id[@~]//" || true)
  [ -n "$rect" ] && break
  # Tags off screen get no button: replies of earlier runs may push the reply down, so scroll a little.
  if [ $((i % 6)) = 0 ]; then adb shell input swipe 540 1700 540 1100 400; fi
done
[ -n "$rect" ] || { echo "FAIL: no button for $id on $feed"; exit 1; }
sleep 1
bash "$(dirname "$0")/shot.sh" button-feed >/dev/null
set -- $rect
x=$(( ($1 + $3) / 2 )); y=$(( ($2 + $4) / 2 ))
echo "button for $id at [$1,$2][$3,$4]; tapping $x $y"
adb shell input tap "$x" "$y"
verdict=""
for _ in $(seq 1 30); do
  sleep 1
  verdict=$(bash "$(dirname "$0")/ui.sh" | cut -f1 | grep -m1 -xE '"(MATCH|NO MATCH|UNKNOWN STAMP|INVALID)"' || true)
  [ -n "$verdict" ] && break
done
bash "$(dirname "$0")/shot.sh" button-verify >/dev/null
url=$(bash "$(dirname "$0")/ui.sh" | grep -m1 url_bar | cut -f1)
echo "verify page: $url"
if [ "$verdict" = '"MATCH"' ]; then
  echo "PASS: the button opened the verify page and it says MATCH ($OUT/button-feed.png, $OUT/button-verify.png)"
else
  echo "FAIL: the verify page says ${verdict:-nothing yet}"; exit 1
fi

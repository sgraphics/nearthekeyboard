#!/usr/bin/env bash
# Proof video (b), the click layer: the stamp-button service is on (NTK app,
# setup step 5); the demo feed in Chrome with stamped replies, an NTK button on
# each visible tag; a tap on one opens the verify page: MATCH and the list of
# checks; then one word changed in the page's box: NO MATCH. Emulator only
# (taps go through the emulator's touch screen so they show; scripts/device/ctap.sh).
#
#   bash video/tools/proof-click-layer.sh [stamp id]   -> video/out/proof-click-layer.mp4 (+ .png poster)
#
# The stamp id is the reply to tap (default: the one proof-keyboard.sh posted,
# from video/raw/proof-keyboard.marks; else the feed's built-in e65ee28db5).
# Needs the debug app (its service logs where it put the buttons).
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
D="$ROOT/scripts/device"
T="$ROOT/video/tools"
NAME=proof-click-layer
RAW="$ROOT/video/raw"
OUT="$ROOT/video/out"
mkdir -p "$RAW" "$OUT"
PKG=tools.ntk.keyboard
FEED="${FEED:-https://ntk.tools/feed/}"
LABEL="NTK proof · testnet · typing by the test robot (synthetic typist)"
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
id="${1:-$(awk '$1 == "stamp" { print $2 }' "$RAW/proof-keyboard.marks" 2>/dev/null | tail -1)}"
id="${id:-e65ee28db5}"
ui() { bash "$D/ui.sh"; }
# y_of <resource id or "text">: the centre y of that element (0 when it is off screen)
y_of() { ui | awk -F'\t' -v k="$1" '$2 == k || $1 == k { split($3, a, " "); print a[2]; exit }'; }
# bounds_of <resource id>: left top right bottom, from the last dump
bounds_of() {
  { adb exec-out cat /data/local/tmp/ui.xml | tr '>' '\n' | grep "resource-id=\"$1\"" | grep -o 'bounds="[^"]*"' | head -1 \
    | tr -dc '0-9,[]' | tr '[],' '   '; } || true
}
# scroll_to <id or "text"> <swipe from y> <to y>: until it is in the upper part of the screen
scroll_to() {
  local y
  for _ in 1 2 3 4 5 6 7 8; do
    y=$(y_of "$1"); [ -n "$y" ] && [ "$y" -gt 250 ] && [ "$y" -lt 1300 ] && return 0
    adb shell input swipe 540 "$2" 540 "$3" 600; sleep 1.2
  done
  echo "could not scroll to $1" >&2; return 1
}
# The service logs where it put its buttons (debug builds): "buttons: <id>@l t r b ..."
button_xy() { # prints nothing until the service has placed one
  { adb logcat -d -s NTK | tr -d '\r' | grep "buttons:" | grep -o "$1[@~][0-9 -]*" | tail -1 \
    | sed "s/^$1[@~]//" | awk '{ printf "%d %d", ($1 + $3) / 2, ($2 + $4) / 2 }'; } || true
}

echo "== device: stamp $id"
bash "$D/ime-on.sh" >/dev/null
bash "$D/a11y-on.sh"
bash "$T/prep.sh" on
adb shell am start -n "$PKG/tools.ntk.ui.SetupActivity" >/dev/null
sleep 2
scroll_to "\"5. Stamp buttons in other apps\"" 1900 1100

echo "== recording"
bash "$T/record.sh" start "$NAME" >/dev/null
sleep 4.5 # NTK app, step 5: "On. Stamp tags in other apps get an NTK button."
adb logcat -c
adb shell am start -a android.intent.action.VIEW -d "$FEED" --es com.android.browser.application_id tools.ntk.video >/dev/null
xy=""
for _ in $(seq 1 30); do sleep 1; xy=$(button_xy "$id"); [ -n "$xy" ] && break; done
[ -n "$xy" ] || { bash "$T/record.sh" stop "$NAME" >/dev/null; echo "no button for $id"; exit 1; }
sleep 3.5 # the feed: a button on each visible tag
bash "$D/ctap.sh" $xy >/dev/null # the button on the reply's tag
for _ in $(seq 1 30); do sleep 1; ui | cut -f1 | grep -qx '"MATCH"' && break; done
sleep 3.5 # MATCH
adb shell input swipe 540 1800 540 700 900; sleep 3 # the stamp's details
adb shell input swipe 540 1800 540 800 900; sleep 3.5 # the list of checks
# The page's box holds the message with its tag: change one word, check again.
scroll_to check-title 1800 1000
set -- $(bounds_of message) # left top right bottom
[ -n "${1:-}" ] || { bash "$T/record.sh" stop "$NAME" >/dev/null; echo "no box"; exit 1; }
sleep 1.5
bash "$D/ctap.sh" $(( $1 + 146 )) $(( $2 + 61 )) 900 >/dev/null # press and hold on the second word, "agree"
sleep 1.5
adb shell input text "disagree"
sleep 2
adb shell input keyevent KEYCODE_BACK # the keyboard down, so Check is free
sleep 1
bash "$D/ctap.sh" --exact "Check" >/dev/null
for _ in $(seq 1 30); do sleep 1; ui | cut -f1 | grep -qx '"NO MATCH"' && break; done
sleep 1.5
adb shell input swipe 540 900 540 1250 500 # the verdict fully in view
sleep 4 # NO MATCH
bash "$T/record.sh" stop "$NAME"
bash "$T/prep.sh" off >/dev/null

echo "== label"
len=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$(native "$RAW/$NAME.mp4")")
node "$(native "$T/label.mjs")" --in "$(native "$RAW/$NAME.mp4")" --out "$(native "$OUT/$NAME.mp4")" --width 720 --text "$LABEL" \
  --poster "$(awk -v l="$len" 'BEGIN { printf "%.2f", l - 1.0 }'):$(native "$OUT/$NAME.png")"

#!/usr/bin/env bash
# Proof video (a), the keyboard: in the NTK app a fresh testnet account from the
# faucet, the consent screen, the three enrollment prompts typed by the robot
# typist through the NTK keyboard, "fingerprint created"; then the demo feed in
# Chrome: Reply, the robot types the demo reply, Sign, the wait, the tag, Post,
# and the reply with its tag in the feed. Emulator only (taps go through the
# emulator's touch screen so they show; scripts/device/ctap.sh).
#
#   bash video/tools/proof-keyboard.sh          -> video/out/proof-keyboard.mp4 (+ .png poster)
#   PART=stamp bash video/tools/proof-keyboard.sh   rehearse the feed part only, on the
#                                                   account the app is logged in to; no recording
#
# Typing and waiting are sped up with fwd.mjs, which labels them "FWD >>"; the
# label at the top says the typing is the test robot's. Needs the debug app and
# its test APK installed (scripts/device/robot.sh installs both).
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
D="$ROOT/scripts/device"
T="$ROOT/video/tools"
NAME=proof-keyboard
RAW="$ROOT/video/raw"
OUT="$ROOT/video/out"
mkdir -p "$RAW" "$OUT"
PKG=tools.ntk.keyboard
RUNNER=tools.ntk.keyboard.test/androidx.test.runner.AndroidJUnitRunner
FEED="${FEED:-https://ntk.tools/feed/}"
PART="${PART:-all}"
LABEL="NTK proof · testnet · typing by the test robot (synthetic typist)"
MARKS="$RAW/$NAME.marks"
: > "$MARKS"
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
now() { date +%s.%N | cut -c1-14; }
mark() { echo "$1 ${2:-$(now)}" >> "$MARKS"; echo "  [$1]${3:+ $3}"; }
robot_log() { adb logcat -d -v epoch -s NTK-ROBOT | tr -d '\r' | grep "NTK-ROBOT: " || true; }
# The robot's log is read in order: a cursor (a line number, kept in a file because
# helpers run in subshells) marks how far it has been read.
CURSOR="$RAW/.$NAME.cursor"
echo 0 > "$CURSOR"
# next_robot <pattern> <timeout s>: the first robot line after the cursor that matches; moves the cursor past it
next_robot() {
  local log hit start
  start=$(cat "$CURSOR")
  for _ in $(seq 1 $(( $2 * 2 ))); do
    log=$(robot_log)
    hit=$(echo "$log" | awk -v s="$start" -v p="NTK-ROBOT: ($1)" 'NR > s && $0 ~ p { print NR; exit }')
    if [ -n "$hit" ]; then echo "$hit" > "$CURSOR"; echo "$log" | sed -n "${hit}p"; return 0; fi
    echo "$log" | grep -qE "NTK-ROBOT: SCRIPT DONE" && break
    sleep 0.5
  done
  echo "timed out waiting for: $1" >&2; return 1
}
# The robot logs the emulator's clock, which runs a little behind this computer's (0.3 s here):
# measured once, then robot times are moved onto this clock.
OFFSET=$(a=$(now); d=$(adb shell date +%s.%N | tr -d '\r' | cut -c1-14); b=$(now); awk -v a="$a" -v b="$b" -v d="$d" 'BEGIN { printf "%.3f", (a + b) / 2 - d }')
epoch_of() { awk -v o="$OFFSET" '{ printf "%.3f", $1 + o }'; }
# find <text|id> <query>: where the element is, asked from the running robot (it holds the UI connection)
find_xy() {
  adb shell am broadcast -p "$PKG" -a tools.ntk.test.FIND --es by "$1" --es q "'$2'" >/dev/null
  next_robot "FOUND|NOTFOUND" 20 | sed -n 's/.*NTK-ROBOT: FOUND \([0-9]*\) \([0-9]*\) .*/\1 \2/p'
}
# tap <text|id> <query> [tries]: find it (waiting for it to appear) and tap it visibly
tap() {
  local xy=""
  for _ in $(seq 1 "${3:-20}"); do
    xy=$(find_xy "$1" "$2") || true
    [ -n "$xy" ] && break
    sleep 1
  done
  [ -n "$xy" ] || { echo "not on screen: $2" >&2; return 1; }
  bash "$D/ctap.sh" $xy >/dev/null
}
# wait_for <text> <timeout s>: until an element with that text is on screen
wait_for() {
  local xy=""
  for _ in $(seq 1 "$2"); do
    xy=$(find_xy text "$1") || true
    [ -n "$xy" ] && return 0
    sleep 1
  done
  echo "never appeared: $1" >&2; return 1
}
# One robot step: it types; the computer taps Sign when the robot says where; then the result.
# When a call fails (the relay restarted and forgot it, a timeout), the robot asks for Sign again.
robot_step() { # robot_step <n> <session> <OK|MATCH>
  local l tries=0
  l=$(next_robot "TYPING " 1500); mark "typing$1" "$(echo "$l" | epoch_of)" "$2"
  l=$(next_robot "TYPED " 300); mark "typed$1" "$(echo "$l" | epoch_of)"
  while :; do
    l=$(next_robot "SIGN_AT " 120)
    sleep 0.8
    bash "$D/ctap.sh" $(echo "$l" | sed -n 's/.*SIGN_AT \([0-9]*\) \([0-9]*\).*/\1 \2/p') >/dev/null
    [ "$tries" = 0 ] && mark "sign$1"
    l=$(next_robot "RESULT |FAILED " 900)
    case "$l" in
      *"NTK-ROBOT: FAILED "*)
        tries=$((tries + 1)); mark "failed${1}_$tries" "$(echo "$l" | epoch_of)" "$(echo "$l" | sed 's/.*FAILED //')"
        [ "$tries" -lt 3 ] || return 1 ;;
      *) break ;;
    esac
  done
  mark "result$1" "$(echo "$l" | epoch_of)" "$(echo "$l" | sed 's/.*RESULT //')"
  echo "$l" | grep -q " $3" || { echo "step $1 did not give $3: $l" >&2; return 1; }
}

echo "== device"
if [ "$PART" = all ]; then
  adb shell pm clear "$PKG" >/dev/null # no account, no fingerprint: a fresh start
fi
bash "$D/ime-on.sh" >/dev/null
adb shell settings delete secure enabled_accessibility_services >/dev/null || true # stamp buttons off here
# The feed without replies of earlier runs (they are kept in Chrome's storage).
adb shell am start -a android.intent.action.VIEW -d "$FEED" --es com.android.browser.application_id tools.ntk.video >/dev/null
sleep 5
for _ in 1 2 3 4 5 6; do # "Clear my replies" is at the bottom of the page; it does nothing when there are none
  y=$(bash "$D/ui.sh" | awk -F'\t' '$1 == "\"Clear my replies\"" { split($3, a, " "); print a[2]; exit }')
  if [ -n "$y" ] && [ "$y" -lt 2250 ]; then bash "$D/ctap.sh" --exact "Clear my replies" >/dev/null; break; fi
  adb shell input swipe 540 1900 540 600 300; sleep 1
done
adb shell input keyevent KEYCODE_HOME
bash "$T/prep.sh" on

echo "== robot"
adb logcat -c
if [ "$PART" = all ]; then steps=enroll:v_enroll_1,enroll:a_enroll_2,enroll:v_enroll_3,stamp:a_stamp; first=4; else steps=stamp:a_stamp; first=1; fi
adb shell am instrument -w -e class tools.ntk.ScriptTest -e steps "$steps" -e sign host -e pauseMs 1500 \
  -e waitMs 1500000 -e holdMs 900000 "$RUNNER" > "$RAW/$NAME.robot.txt" 2>&1 &
ROBOT=$!
# On any exit: end the robot on the device too (it would hold the screen's UI connection for minutes).
trap 'kill $ROBOT 2>/dev/null || true; adb shell am force-stop "$PKG" >/dev/null 2>&1 || true' EXIT
next_robot "ROBOT READY" 90 >/dev/null

if [ "$PART" = all ]; then
  echo "== recording"
  bash "$T/record.sh" start "$NAME" >/dev/null
  sleep 2
  mark start
  adb shell am start -n "$PKG/tools.ntk.ui.SetupActivity" >/dev/null; mark app
  sleep 3.5
  tap text "Create a testnet account for me"; mark create
  wait_for "Created ntk-" 300; mark created
  sleep 2.5
  tap text "Enroll: type three short texts"; mark enroll
  sleep 3.5 # the consent screen
  tap text "I agree. Start enrolling"; mark agree
  robot_step 1 v_enroll_1 OK
  robot_step 2 a_enroll_2 OK
  robot_step 3 v_enroll_3 OK
  wait_for "Fingerprint created" 30
  sleep 3; mark ready
fi

adb shell am start -a android.intent.action.VIEW -d "$FEED" --es com.android.browser.application_id tools.ntk.video >/dev/null
mark feed
sleep 4
tap id reply-box; mark replybox
robot_step "$first" a_stamp MATCH
stamp=$(robot_log | grep -o "RESULT a_stamp MATCH [0-9a-f]*" | awk '{print $4}' | tail -1 || true)
sleep 2.5 # the tag in the reply box
adb shell input keyevent KEYCODE_BACK; mark keyboard_down # the Reply button may be under the keyboard
sleep 1.2
tap id reply-btn; mark post
sleep 4; mark end

if [ "$PART" != all ]; then echo "rehearsal done: stamp $stamp"; exit 0; fi
bash "$T/record.sh" stop "$NAME"
adb shell am force-stop "$PKG" # ends the robot (and restarts the keyboard)
bash "$T/prep.sh" off >/dev/null
echo "stamp $stamp" >> "$MARKS"

echo "== cut"
fast=$(node "$(native "$T/marks.mjs")" --latency 0.05 --timeline "$(native "$RAW/$NAME.timeline")" --marks "$(native "$MARKS")" \
  --fast "create+0.8..created-0.4:=1.5" \
  --fast "typing1+1.0..typed1-0.4:6" --fast "sign1+1.2..result1-0.4:=2.5" \
  --fast "typing2+1.0..typed2-0.4:6" --fast "sign2+1.2..result2-0.4:=2.5" \
  --fast "typing3+1.0..typed3-0.4:6" --fast "sign3+1.2..result3-0.4:=2.5" \
  --fast "typing4+1.0..typed4-0.4:4" --fast "sign4+1.2..result4-0.4:=2.5")
node "$(native "$T/fwd.mjs")" --in "$(native "$RAW/$NAME.mp4")" --out "$(native "$RAW/$NAME-fwd.mp4")" $fast
len=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$(native "$RAW/$NAME-fwd.mp4")")
node "$(native "$T/label.mjs")" --in "$(native "$RAW/$NAME-fwd.mp4")" --out "$(native "$OUT/$NAME.mp4")" --width 720 --text "$LABEL" \
  --poster "$(awk -v l="$len" 'BEGIN { printf "%.2f", l - 1.5 }'):$(native "$OUT/$NAME.png")"
echo "stamp in the video: [NTK $stamp]"

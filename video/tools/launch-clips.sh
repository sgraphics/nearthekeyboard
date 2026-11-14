#!/usr/bin/env bash
# The phone clips of the launch video (video/remotion), recorded on the NTK_Robot
# emulator; the typing is the robot typist's (synthetic typist "alice", the one
# the robot account enrolled with). One part per run:
#
#   bash video/tools/launch-clips.sh problem   /messages/?fresh=1: the conversation, ending with Maya's question
#   bash video/tools/launch-clips.sh moment    reply there with NTK: the robot types, Sign, the wait, the tag, send
#   bash video/tools/launch-clips.sh check     Maya's phone (/messages/?fresh=1&as=maya): the stamp button on the
#                                              tag, the verify page with MATCH; one word changed: NO MATCH
#   bash video/tools/launch-clips.sh feed      the X-like demo feed (/feed/) with the stamp buttons on: its stamped
#                                              reply, with the NTK button on the tag (the check scene's app cycle)
#   bash video/tools/launch-clips.sh enroll    the NTK app: Enroll, consent, three prompts typed by the robot,
#                                              "Fingerprint created, sealed in the enclave"
#
# Each writes video/raw/launch-<part>.mp4, .marks (times noted during the take) and
# .timeline (record.sh). video/tools/marks.mjs turns the marks into times in the video;
# the cuts and speeds then go into video/remotion/src/timeline.tsx (see video/remotion/README.md).
# Runs only on the AVD named NTK_Robot: ANDROID_SERIAL is set to it, nothing else is touched.
set -euo pipefail
export MSYS_NO_PATHCONV=1
PART="${1:-}"
case "$PART" in problem|moment|check|feed|enroll) ;; *) echo "usage: $0 problem|moment|check|feed|enroll"; exit 2 ;; esac
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
D="$ROOT/scripts/device"
T="$ROOT/video/tools"
RAW="$ROOT/video/raw"
mkdir -p "$RAW"
NAME="launch-$PART"
PKG=tools.ntk.keyboard
RUNNER=tools.ntk.keyboard.test/androidx.test.runner.AndroidJUnitRunner
SITE="${SITE:-https://ntk.tools}"
CHAT="$SITE/messages/?fresh=1"
MAYA="$SITE/messages/?fresh=1&as=maya"
WORD_FROM="${WORD_FROM:-word}" # the word changed on the verify page, and what it becomes
WORD_TO="${WORD_TO:-line}"

# ---- the device: NTK_Robot and nothing else ----------------------------------------
unset ANDROID_SERIAL
for s in $(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }'); do
  if [ "$(adb -s "$s" emu avd name 2>/dev/null | head -1 | tr -d '\r')" = "NTK_Robot" ]; then export ANDROID_SERIAL="$s"; break; fi
done
[ -n "${ANDROID_SERIAL:-}" ] || { echo "the NTK_Robot emulator is not running"; exit 1; }
echo "== $NAME on $ANDROID_SERIAL (NTK_Robot)"

native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
now() { date +%s.%N | cut -c1-14; }
MARKS="$RAW/$NAME.marks"
: > "$MARKS"
mark() { echo "$1 ${2:-$(now)}" >> "$MARKS"; echo "  [$1]${3:+ $3}"; }
open_url() { adb shell am start -a android.intent.action.VIEW -d "'$1'" --es com.android.browser.application_id tools.ntk.video >/dev/null; }

# ---- the robot (from proof-keyboard.sh): its log is read in order, a cursor marks how far --------
robot_log() { adb logcat -d -v epoch -s NTK-ROBOT | tr -d '\r' | grep "NTK-ROBOT: " || true; }
CURSOR="$RAW/.$NAME.cursor"
echo 0 > "$CURSOR"
next_robot() { # next_robot <pattern> <timeout s>: the first robot line after the cursor that matches
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
# The emulator's clock runs a little behind this computer's: measured once, robot times are moved onto this clock.
OFFSET=$(a=$(now); d=$(adb shell date +%s.%N | tr -d '\r' | cut -c1-14); b=$(now); awk -v a="$a" -v b="$b" -v d="$d" 'BEGIN { printf "%.3f", (a + b) / 2 - d }')
epoch_of() { awk -v o="$OFFSET" '{ printf "%.3f", $1 + o }'; }
find_xy() { # find_xy <text|id> <query>: asked from the running robot (it holds the UI connection)
  adb shell am broadcast -p "$PKG" -a tools.ntk.test.FIND --es by "$1" --es q "'$2'" >/dev/null
  next_robot "FOUND|NOTFOUND" 20 | sed -n 's/.*NTK-ROBOT: FOUND \([0-9]*\) \([0-9]*\) .*/\1 \2/p'
}
tap() { # tap <text|id> <query> [tries]: find it (waiting for it) and tap it through the touch screen, so it shows
  local xy=""
  for _ in $(seq 1 "${3:-20}"); do
    xy=$(find_xy "$1" "$2") || true
    [ -n "$xy" ] && break
    sleep 1
  done
  [ -n "$xy" ] || { echo "not on screen: $2" >&2; return 1; }
  bash "$D/ctap.sh" $xy >/dev/null
}
wait_for() { # wait_for <text> <timeout s>
  local xy=""
  for _ in $(seq 1 "$2"); do
    xy=$(find_xy text "$1") || true
    [ -n "$xy" ] && return 0
    sleep 1
  done
  echo "never appeared: $1" >&2; return 1
}
# One robot step: it types; this computer taps Sign (or Enroll) where the robot says; then the result.
# A failed call (a timeout on a slow testnet, a relay restart) makes the robot ask for Sign again.
robot_step() { # robot_step <n> <session> <OK|MATCH>
  local l tries=0
  l=$(next_robot "TYPING " 1500); mark "typing$1" "$(echo "$l" | epoch_of)" "$2"
  l=$(next_robot "TYPED " 300); mark "typed$1" "$(echo "$l" | epoch_of)"
  while :; do
    l=$(next_robot "SIGN_AT " 120)
    sleep 0.8
    bash "$D/ctap.sh" $(echo "$l" | sed -n 's/.*SIGN_AT \([0-9]*\) \([0-9]*\).*/\1 \2/p') >/dev/null
    mark "sign${1}_$tries"
    l=$(next_robot "RESULT |FAILED " 2400)
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
start_robot() { # start_robot <steps>: the instrumentation restarts the keyboard's process, so this comes first
  adb logcat -c
  echo 0 > "$CURSOR"
  adb shell am instrument -w -e class tools.ntk.ScriptTest -e steps "$1" -e sign host -e pauseMs 1500 \
    -e waitMs 2400000 -e holdMs 900000 "$RUNNER" > "$RAW/$NAME.robot.txt" 2>&1 &
  ROBOT=$!
  next_robot "ROBOT READY" 90 >/dev/null
}
# On any exit: end the robot (it would hold the screen's UI connection for minutes), stop a
# recording still running (a take that failed half way), and put the device back as it was.
ROBOT=""
cleanup() {
  if [ -n "$ROBOT" ]; then kill "$ROBOT" 2>/dev/null || true; adb shell am force-stop "$PKG" >/dev/null 2>&1 || true; fi
  if [ -e "$RAW/.rec-$NAME.pid" ]; then bash "$T/record.sh" stop "$NAME" >/dev/null 2>&1 || true; fi
  if [ -n "${STYLUS_BEFORE:-}" ]; then
    if [ "$STYLUS_BEFORE" = null ]; then adb shell settings delete secure stylus_handwriting_enabled >/dev/null 2>&1 || true
    else adb shell settings put secure stylus_handwriting_enabled "$STYLUS_BEFORE" >/dev/null 2>&1 || true; fi
  fi
  bash "$T/prep.sh" off >/dev/null 2>&1 || true
}
trap cleanup EXIT
# The emulator's touch events (ctap.sh) count as a stylus on recent Android: a long press then opens
# the stylus handwriting tutorial, which swallows typed text. Off while a take selects a word.
no_stylus() {
  STYLUS_BEFORE=$(adb shell settings get secure stylus_handwriting_enabled | tr -d '\r')
  adb shell settings put secure stylus_handwriting_enabled 0
}
# Clears the messages this browser sent on /messages/ (the page's own Clear button), so ?fresh=1
# ends with Maya's question. The robot answers FIND while it runs; otherwise uiautomator does.
clear_chat() {
  open_url "$CHAT"; sleep 4
  bash "$D/ctap.sh" --exact "Clear" >/dev/null 2>&1 || true
  sleep 1
}

bash "$D/ime-on.sh" >/dev/null
bash "$T/prep.sh" on
case "$PART" in
problem)
  adb shell settings delete secure enabled_accessibility_services >/dev/null || true
  clear_chat
  open_url "about:blank"; sleep 2
  bash "$T/record.sh" start "$NAME" >/dev/null
  sleep 1.5; mark start
  # screenrecord writes frames only when the screen changes: the page is opened while recording
  open_url "$CHAT"; mark page
  sleep 10; mark end
  bash "$T/record.sh" stop "$NAME"
  ;;
moment)
  adb shell settings delete secure enabled_accessibility_services >/dev/null || true
  clear_chat
  open_url "about:blank"; sleep 2
  start_robot "stamp:${SESSION:-v_reply}"
  bash "$T/record.sh" start "$NAME" >/dev/null
  sleep 1.5; mark start
  # opened after the robot is connected, so the page's elements are visible to it (and frames are written)
  open_url "$CHAT"; mark page
  sleep 4; mark question
  tap id message-box; mark composer
  robot_step 1 "${SESSION:-v_reply}" MATCH
  stamp=$(robot_log | grep -o "RESULT [a-z_]* MATCH [0-9a-f]*" | awk '{print $4}' | tail -1 || true)
  sleep 3 # the tag in the box
  tap id send-btn; mark send # the keyboard closes by itself: the whole thread, the reply at its foot
  sleep 5; mark end
  bash "$T/record.sh" stop "$NAME"
  echo "stamp $stamp" >> "$MARKS"
  echo "stamp in the take: [NTK $stamp]"
  ;;
check)
  adb shell am force-stop "$PKG" >/dev/null 2>&1 || true # no robot here: uiautomator is free
  no_stylus
  bash "$D/a11y-on.sh"
  id=$(awk '$1 == "stamp" { print $2 }' "$RAW/launch-moment.marks" 2>/dev/null | tail -1)
  [ -n "$id" ] || { echo "no stamp from the moment take (video/raw/launch-moment.marks)"; exit 1; }
  echo "  stamp $id"
  open_url "$MAYA"; sleep 5
  adb logcat -c
  bash "$T/record.sh" start "$NAME" >/dev/null
  sleep 1.5; mark start
  open_url "$MAYA" # the same page again, so the service places its buttons while recording
  xy=""
  for _ in $(seq 1 40); do
    sleep 1
    xy=$( { adb logcat -d -s NTK | tr -d '\r' | grep "buttons:" | grep -o "$id[@~][0-9 -]*" | tail -1 \
      | sed "s/^$id[@~]//" | awk '{ printf "%d %d", ($1 + $3) / 2, ($2 + $4) / 2 }'; } || true)
    [ -n "$xy" ] && break
  done
  [ -n "$xy" ] || { bash "$T/record.sh" stop "$NAME" >/dev/null; echo "no stamp button for $id"; exit 1; }
  mark button
  sleep 3.5
  bash "$D/ctap.sh" $xy >/dev/null; mark tap
  for _ in $(seq 1 90); do sleep 1; bash "$D/ui.sh" | cut -f1 | grep -qx '"MATCH"' && break; done
  mark match
  sleep 4.5
  # The page's box holds the message with its tag: change one word, check again.
  for _ in 1 2 3 4 5 6 7 8; do
    y=$(bash "$D/ui.sh" | awk -F'\t' '$2 ~ /check-title$/ { split($3, a, " "); print a[2]; exit }' || true)
    [ -n "$y" ] && [ "$y" -gt 250 ] && [ "$y" -lt 1300 ] && break
    adb shell input swipe 540 1800 540 1000 700; sleep 1.2
  done
  mark box
  adb shell uiautomator dump /data/local/tmp/ui.xml >/dev/null
  b=$(adb exec-out cat /data/local/tmp/ui.xml | tr '>' '\n' | grep 'resource-id="message"' | grep -o 'bounds="[^"]*"' | head -1 | tr -dc '0-9,[]' | tr '[],' '   ' || true)
  set -- $b
  [ -n "${1:-}" ] || { bash "$T/record.sh" stop "$NAME" >/dev/null; echo "no box"; exit 1; }
  sleep 1
  bash "$D/ctap.sh" $(( $1 + ${WORD_X:-228} )) $(( $2 + ${WORD_Y:-64} )) 900 >/dev/null; mark select # press and hold on the word
  sleep 1.5
  adb shell input text "$WORD_TO"; mark typed
  sleep 2
  adb shell input keyevent KEYCODE_BACK
  sleep 1
  bash "$D/ctap.sh" --exact "Check" >/dev/null; mark recheck
  for _ in $(seq 1 90); do sleep 1; bash "$D/ui.sh" | cut -f1 | grep -qx '"NO MATCH"' && break; done
  mark nomatch
  sleep 1.5
  adb shell input swipe 540 900 540 1250 500 # the verdict fully in view
  sleep 4; mark end
  bash "$T/record.sh" stop "$NAME"
  ;;
feed)
  bash "$D/a11y-on.sh"
  open_url "$SITE/feed/"; sleep 6
  # the stamped reply (the feed's own, [NTK e65ee28db5]) up to about two thirds of the screen
  for _ in 1 2 3 4 5 6 7 8; do
    y=$(bash "$D/ui.sh" | awk -F'	' 'index($1, "This reply was typed by me") { split($3, a, " "); print a[2]; exit }' || true)
    [ -n "$y" ] && [ "$y" -gt 1350 ] && [ "$y" -lt 1800 ] && break
    if [ -n "$y" ] && [ "$y" -le 1350 ]; then adb shell input swipe 540 1000 540 1300 900; else adb shell input swipe 540 1700 540 1200 900; fi
    sleep 2
  done
  adb logcat -c
  bash "$T/record.sh" start "$NAME" >/dev/null
  sleep 1.5; mark start
  adb shell input swipe 540 1300 540 1260 500 # a small scroll: frames are written, the service places its button again
  sleep 6; mark end
  bash "$T/record.sh" stop "$NAME"
  ;;
enroll)
  adb shell settings delete secure enabled_accessibility_services >/dev/null || true
  start_robot "enroll:v_enroll_1,enroll:a_enroll_2,enroll:v_enroll_3"
  bash "$T/record.sh" start "$NAME" >/dev/null
  sleep 1.5; mark start
  adb shell am start -n "$PKG/tools.ntk.ui.SetupActivity" >/dev/null; mark app
  sleep 3.5
  tap text "Enroll: type three short texts"; mark enroll
  # The consent screen; the app shows it once, so a second enrollment goes straight to prompt 1 and the
  # robot may start typing while this looks for the button: the log is read again from here afterwards.
  c0=$(cat "$CURSOR")
  sleep 3.5
  if tap text "I agree. Start enrolling" 2; then mark agree; else mark agree "$(now)" "(consent given before)"; fi
  echo "$c0" > "$CURSOR"
  robot_step 1 v_enroll_1 OK
  robot_step 2 a_enroll_2 OK
  robot_step 3 v_enroll_3 OK
  wait_for "Fingerprint created" 60; mark ready
  sleep 4; mark end
  bash "$T/record.sh" stop "$NAME"
  ;;
esac
bash "$T/prep.sh" off >/dev/null
node "$(native "$T/marks.mjs")" --timeline "$(native "$RAW/$NAME.timeline")" --marks "$(native "$MARKS")" 2>&1 >/dev/null | sed 's/^/  /'
echo "== $RAW/$NAME.mp4"

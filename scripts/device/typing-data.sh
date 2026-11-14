#!/usr/bin/env bash
# Debug builds only: pull the sessions the keyboard sent into typing-data/ (ignored by git;
# real sessions are biometric data, never commit them).   bash scripts/device/typing-data.sh
set -e
. "$(dirname "$0")/_lib.sh"
dest="$REPO/typing-data"
mkdir -p "$dest"
adb exec-out run-as "$PKG" sh -c 'cd files/typing-data 2>/dev/null && tar cf - .' | tar xf - -C "$dest"
ls -1 "$dest" | tail -5
echo "$(ls -1 "$dest" | wc -l) files in $dest"

# Shared by scripts/device/*.sh. Source it; do not run it.
# Git Bash on Windows rewrites paths like /data/local/tmp unless this is set.
export MSYS_NO_PATHCONV=1
PKG=tools.ntk.keyboard
IME="$PKG/rkr.simplekeyboard.inputmethod.latin.LatinIME"
TEST_RUNNER="$PKG.test/androidx.test.runner.AndroidJUnitRunner"
# With two devices attached, set ANDROID_SERIAL=<serial> (adb reads it).
# Under Git Bash a Windows path (C:/...), which both bash and the Windows adb.exe read; elsewhere a POSIX one.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && (pwd -W 2>/dev/null || pwd))"
OUT="${NTK_OUT:-$REPO/captures}"
adb_() { adb "$@"; }

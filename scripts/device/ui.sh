#!/usr/bin/env bash
# Dump the screen's elements: one line per element with text, resource id and centre x y.
#   bash scripts/device/ui.sh
set -e
. "$(dirname "$0")/_lib.sh"
adb shell uiautomator dump /data/local/tmp/ui.xml >/dev/null
adb exec-out cat /data/local/tmp/ui.xml | node -e '
let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
  for (const m of s.matchAll(/<node [^>]*>/g)) {
    const a = (k) => ((m[0].match(new RegExp(` ${k}="([^"]*)"`)) || [])[1] || "");
    const b = a("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!b) continue;
    const text = a("text") || a("content-desc");
    const id = a("resource-id");
    if (!text && !id) continue;
    const x = (+b[1] + +b[3]) >> 1, y = (+b[2] + +b[4]) >> 1;
    console.log(`${JSON.stringify(text)}\t${id}\t${x} ${y}`);
  }
});'

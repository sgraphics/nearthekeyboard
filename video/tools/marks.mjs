#!/usr/bin/env node
// Turns times noted on the computer during a recording into times in the
// recorded video, and builds fwd.mjs's --fast arguments from them.
//
//   node video/tools/marks.mjs --timeline video/raw/x.timeline --marks video/raw/x.marks \
//        [--latency 0.05] [--fast "<from>..<to>:<speed>"]...
//
// marks: one "<name> <seconds since 1970>" per line (proof-*.sh write them).
// timeline: written by record.sh stop ("<segment> <host start> <video start> <length>").
// latency: how long after its command a screenrecord segment shows its first frame (about 0.05 s
// on the emulator; robot times must already be on the computer's clock, see proof-keyboard.sh).
// --fast: <from> and <to> are mark names, each with an optional +/- offset in
// seconds; <speed> is a factor ("8") or a target length ("=2.5" plays the part
// in 2.5 s). Parts shorter than 1.5 s, or that would not get faster, are left out.
// Prints every mark with its video time to stderr, and the --fast arguments on stdout.
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const all = (n) => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []));
const latency = Number(opt('--latency', '0.05'));
const timeline = fs.readFileSync(opt('--timeline'), 'utf8').trim().split(/\r?\n/).map((l) => {
  const [seg, host, at, dur] = l.trim().split(/\s+/).map(Number);
  return { seg, host, at, dur };
}).filter((s) => Number.isFinite(s.host) && s.host > 0);
const marks = new Map();
for (const l of fs.readFileSync(opt('--marks'), 'utf8').split(/\r?\n/)) {
  const [name, t] = l.trim().split(/\s+/);
  if (name && Number.isFinite(+t)) marks.set(name, +t);
}

/** Host clock -> seconds into the joined video. */
function videoTime(t) {
  let s = timeline[0];
  for (const x of timeline) if (x.host <= t) s = x;
  return Math.min(s.at + s.dur, Math.max(s.at, s.at + (t - s.host - latency)));
}

const at = (ref) => {
  const m = String(ref).match(/^([A-Za-z0-9_.-]+?)([+-][\d.]+)?$/);
  if (!m || !marks.has(m[1])) throw new Error(`no mark ${ref}`);
  return videoTime(marks.get(m[1])) + Number(m[2] || 0);
};

for (const [name, t] of marks) console.error(`${videoTime(t).toFixed(2).padStart(8)}  ${name}`);
const out = [];
for (const rule of all('--fast')) {
  const m = rule.match(/^(.+)\.\.(.+):(=?)([\d.]+)$/);
  if (!m) throw new Error(`--fast expects <from>..<to>:<speed>, got ${rule}`);
  let from;
  let to;
  try { from = at(m[1]); to = at(m[2]); } catch (e) { console.error(`skip ${rule}: ${e.message}`); continue; }
  const len = to - from;
  const factor = m[3] ? len / Number(m[4]) : Number(m[4]);
  if (len < 1.5 || factor < 1.5) { console.error(`skip ${rule}: ${len.toFixed(1)} s`); continue; }
  console.error(`fast ${from.toFixed(2)}-${to.toFixed(2)} x${factor.toFixed(1)} (${len.toFixed(1)} s -> ${(len / factor).toFixed(1)} s)  ${rule}`);
  out.push('--fast', `${from.toFixed(2)}-${to.toFixed(2)}:${factor.toFixed(2)}`);
}
console.log(out.join(' '));

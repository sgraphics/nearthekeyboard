#!/usr/bin/env node
// Exports synthetic typing sessions from client/synth.mjs for the robot typist
// (app/src/androidTest). The robot taps these sessions on the real keyboard with
// exact touch-down and touch-up times and touch points.
//
//   node android/tools/export-sessions.mjs
//
// Writes android/app/src/androidTest/assets/robot-sessions.json. The typists are
// invented (not anyone's typing), so the file may be committed.
import fs from 'node:fs';
import { Typist, ENROLL_TEXTS } from '../../client/synth.mjs';

// The same two typists as client/e2e.mjs.
const alice = new Typist('alice', { seed: 11, dwell: 88, flight: 95, travel: 22, ox: 0.10, oy: 0.14 });
const bob = new Typist('bob', { seed: 29, dwell: 118, flight: 150, travel: 30, ox: -0.12, oy: -0.06 });

// The demo reply (TODO.md section 0) and an enrollment copy sentence.
export const REPLY = 'I agree with this, and I typed every word myself.';

// What the keyboard produces for a session: replay taps and backspaces (synth
// sessions have no insertions), trimmed.
function replay(events) {
  const out = [];
  for (const e of events) {
    if (e.k === '<bksp>') out.pop();
    else if (!(e.k.length > 2 && e.k.startsWith('<') && e.k.endsWith('>'))) out.push(...e.k);
  }
  return out.join('').trim();
}

const sessions = {};
const add = (name, typist, text, seed, mode) => {
  const s = typist.session(text, seed);
  sessions[name] = { typist: typist.name, mode, text: replay(s.events), intended: text, events: s.events };
};
ENROLL_TEXTS.forEach((t, i) => add(`a_enroll_${i + 1}`, alice, t, 100 + i, i === 1 ? 'copy' : 'compose'));
add('a_stamp', alice, REPLY, 501);
add('b_stamp', bob, REPLY, 502);
add('a_capture', alice, 'the quick brown fox jumps over the lazy dog, then types a little more.', 7);

const out = new URL('../app/src/androidTest/assets/robot-sessions.json', import.meta.url);
fs.mkdirSync(new URL('.', out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  source: 'client/synth.mjs via android/tools/export-sessions.mjs',
  note: 'Synthetic typists, not real typing. d/u in ms since the first touch-down, x/y as a fraction of the key size.',
  reply: REPLY,
  enroll_texts: ENROLL_TEXTS,
  sessions,
}, null, 1) + '\n');
for (const [name, s] of Object.entries(sessions)) {
  const taps = s.events.length;
  const overlaps = s.events.filter((e, i) => i > 0 && e.d < s.events[i - 1].u).length;
  console.log(`${name.padEnd(12)} ${s.typist.padEnd(6)} ${String(taps).padStart(3)} taps, ${overlaps} overlapping, "${s.text.slice(0, 50)}${s.text.length > 50 ? '…' : ''}"`);
}
console.log(`wrote ${out.pathname}`);

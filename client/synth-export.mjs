#!/usr/bin/env node
// Writes typing sessions of the synthetic typists in synth.mjs as files for the
// tuning harness (enclave/src/harness.rs): <typist>-<nn>.json, one session per
// file, in the session format of docs/protocol.md. Each typist's first three
// sessions are the enrollment texts (compose, copy, compose); the rest are
// replies. The output is the same on every run.
//
//   node synth-export.mjs [folder] [--typists alice,bob,carol] [--sessions 10]
//   cd ../enclave && cargo run --release --bin harness -- <folder>
//
// Default folder: typing-data/synth/ at the repository root (ignored by git).
// Existing files in the folder are overwritten, never deleted. Synthetic
// typists test the pipeline; they say nothing about real people.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Typist, TYPISTS, ENROLL_TEXTS, ENROLL_MODES, STAMP_TEXT, DEMO_REPLY } from './synth.mjs';

const REPLIES = [
  STAMP_TEXT,
  DEMO_REPLY,
  'Thanks for the update, I will check the numbers tonight and reply tomorrow morning.',
  'We could meet at the station at six and walk to the new place by the river.',
  'My phone keeps guessing the wrong words, so I switched the suggestions off for good.',
  'Can you send me the photos from the trip when you have a minute, there is no rush.',
  'The weather turned cold again, so I am staying in tonight with a book and some tea.',
];

const usage = 'usage: node synth-export.mjs [folder] [--typists alice,bob,carol] [--sessions 10]';
const args = process.argv.slice(2);
let folder = null;
let names = Object.keys(TYPISTS);
let count = 10;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') { console.log(usage); process.exit(0); }
  else if (a === '--typists') names = String(args[++i] ?? '').split(',').filter(Boolean);
  else if (a === '--sessions') count = Number(args[++i]);
  else if (a.startsWith('-')) { console.error(`unknown option ${a}\n${usage}`); process.exit(2); }
  else folder = a;
}
const unknown = names.filter((n) => !TYPISTS[n]);
if (!names.length || unknown.length || !Number.isInteger(count) || count < 1 || count > 99) {
  console.error(`${unknown.length ? `unknown typist ${unknown.join(', ')}; known: ${Object.keys(TYPISTS).join(', ')}\n` : ''}${usage}`);
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(folder ?? path.join(here, '..', 'typing-data', 'synth'));
fs.mkdirSync(dir, { recursive: true });

names.forEach((name, t) => {
  const typist = new Typist(name, TYPISTS[name]);
  for (let i = 0; i < count; i++) {
    const enrolling = i < ENROLL_TEXTS.length;
    const text = enrolling ? ENROLL_TEXTS[i] : REPLIES[(i - ENROLL_TEXTS.length) % REPLIES.length];
    const session = typist.session(text, 7000 + 100 * t + i);
    if (enrolling) session.mode = ENROLL_MODES[i];
    fs.writeFileSync(path.join(dir, `${name}-${String(i + 1).padStart(2, '0')}.json`), JSON.stringify(session) + '\n');
  }
});
console.log(`wrote ${count} sessions each of ${names.join(', ')} to ${dir}`);

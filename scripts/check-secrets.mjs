#!/usr/bin/env node
// Checks that nothing secret is about to be committed or pushed.
//
//   node scripts/check-secrets.mjs [--range <older>..<newer>]
//
// It looks at every file git tracks or would add (and, with --range, at every
// line those commits add, so a secret committed and later deleted is caught
// too), and fails (exit 1) when it finds
//   1. the actual value of a secret held on this machine: anything key-like in
//      ~/.ntk, ~/.near-credentials, or in environment variables whose name
//      contains KEY, SECRET, TOKEN or PASSWORD;
//   2. something shaped like a private key or an access token;
//   3. a match for NTK_SCAN_EXTRA, an optional regular expression for words that
//      must not appear in this repository.
// Local paths and e-mail addresses are reported as warnings. A secret value is
// never printed, only the file it was found in and where the value came from.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const files = [...new Set((git('ls-files') + git('ls-files', '--others', '--exclude-standard')).split('\n').filter(Boolean))];

// 1. Secret values on this machine.
const secrets = [];
const add = (label, v) => { if (typeof v === 'string' && v.length >= 20) secrets.push({ label, v }); };
const home = os.homedir();
const SECRET_NAME = /private|secret|key|token|seed|phrase|mnemonic|password/i;
const walk = (dir, fn, depth = 0) => {
  if (depth > 4 || !fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, fn, depth + 1); else fn(p);
  }
};
const harvest = (p) => {
  let text;
  try { if (fs.statSync(p).size > 1024 * 1024) return; text = fs.readFileSync(p, 'utf8'); } catch { return; }
  const label = p.replace(home, '~');
  try {
    const visit = (o, k = '') => {
      if (o && typeof o === 'object') { for (const [kk, vv] of Object.entries(o)) visit(vv, kk); return; }
      if (typeof o === 'string' && SECRET_NAME.test(k) && !/public/i.test(k)) {
        add(`${label} (${k})`, o);
        add(`${label} (${k})`, o.replace(/^ed25519:/, ''));
      }
    };
    visit(JSON.parse(text));
    return;
  } catch { /* not JSON: read it as KEY=value lines */ }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*["']?([^"'\s]+)["']?\s*$/);
    if (m && SECRET_NAME.test(m[1]) && !/public/i.test(m[1])) add(`${label} (${m[1]})`, m[2]);
  }
  const whole = text.trim();
  if (whole.length >= 20 && whole.length < 400 && !/\s/.test(whole)) add(`${label} (whole file)`, whole);
};
for (const d of ['.ntk', '.near-credentials']) walk(path.join(home, d), harvest);
for (const [k, v] of Object.entries(process.env)) {
  if (/KEY|SECRET|TOKEN|PASSWORD/i.test(k) && !/PUBLIC|PATH|^SSH_AUTH_SOCK$/i.test(k)) add(`environment variable ${k}`, v);
}

// 2. Shapes of secrets. 3. Extra words.
const hard = [
  ['ed25519 private key', /ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/g],
  ['private or secret key with a value', /["']?(private_key|secret_key|secretKey|privateKey|seed_phrase|mnemonic)["']?\s*[:=]\s*["'][^"'\s]{32,}["']/g],
  ['PEM private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['bearer token', /Bearer\s+[A-Za-z0-9._-]{24,}/g],
  ['access token', /\b(?:sk|rk|ghp|gho|ghs|github_pat|xox[bap])[-_][A-Za-z0-9_-]{20,}/g],
];
if (process.env.NTK_SCAN_EXTRA) hard.push(['word listed in NTK_SCAN_EXTRA', new RegExp(process.env.NTK_SCAN_EXTRA, 'gi')]);
const soft = [
  ['local path', /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+|\/(?:Users|home)\/[a-z][a-z0-9._-]+\//g],
  ['e-mail address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g],
];
// Addresses that are meant to be public.
const ALLOWED = /noreply@|@example\.|@users\.noreply\.github\.com/i;

const failures = [];
const warnings = [];
for (const f of files) {
  let text;
  try { text = fs.readFileSync(path.join(repo, f), 'utf8'); } catch { continue; }
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  for (const s of secrets) {
    const i = text.indexOf(s.v);
    if (i >= 0) failures.push(`${f}:${lineOf(i)}  holds the value of ${s.label}`);
  }
  for (const [name, re] of hard) {
    // .gitignore may name what it ignores.
    if (name.startsWith('word listed') && f === '.gitignore') continue;
    for (const m of text.matchAll(re)) failures.push(`${f}:${lineOf(m.index)}  ${name}`);
  }
  for (const [name, re] of soft) {
    for (const m of text.matchAll(re)) if (!ALLOWED.test(m[0])) warnings.push(`${f}:${lineOf(m.index)}  ${name}: ${m[0].slice(0, 60)}`);
  }
}

// With --range: the lines added by those commits, whatever the files hold now.
const r = process.argv.indexOf('--range');
if (r > 0 && process.argv[r + 1]) {
  const range = process.argv[r + 1];
  const added = git('diff', '--no-color', '--unified=0', range).split('\n').filter((l) => l.startsWith('+')).join('\n');
  for (const s of secrets) if (added.includes(s.v)) failures.push(`commits ${range}  add the value of ${s.label}`);
  for (const [name, re] of hard) {
    if (name.startsWith('word listed')) continue;
    if (re.test(added)) failures.push(`commits ${range}  add: ${name}`);
  }
}

console.log(`checked ${files.length} files against ${secrets.length} secret values found on this machine`);
for (const w of [...new Set(warnings)]) console.log(`warning  ${w}`);
for (const x of [...new Set(failures)]) console.log(`FAIL     ${x}`);
if (failures.length) {
  console.log('\nSecrets must not enter the repository. Remove them, then run this again.');
  process.exit(1);
}
console.log('no secrets found');

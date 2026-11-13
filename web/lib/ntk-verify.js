// NTK stamp verification: the reference implementation of the text rule (v2)
// and of every check a verifier makes. One ES module with no build step that
// runs unchanged in browsers and in Node 20+. The enclave (Rust) and the
// keyboard (Android) implement the same rule; docs/protocol.md is the spec and
// docs/test-vectors/text-v2.json holds the shared test cases.
import { verifyAsync } from '../vendor/noble-ed25519.js';

/** What a verifier pins. A stamp signed by any other key is not an NTK stamp. */
export const NTK = Object.freeze({
  project: 'nearthekeyboard.testnet/ntk',
  network: 'testnet',
  api: 'https://testnet-api.outlayer.ai',
  stampPk: 'ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG',
  verifyBase: 'https://ntk.tools/',
});

/** Every stamp signature covers this prefix followed by the record JSON. */
export const STAMP_DOMAIN = 'NTK-STAMP/v1\n';

/** `[NTK <id>]`, and the older `[NTK @<account> <id>]`. Group 1 is the id. */
export const TAG_SOURCE = String.raw`\[NTK(?: @[^\s\]]+)? ([0-9a-f]{10})\]`;
export const tagRegExp = () => new RegExp(TAG_SOURCE, 'g');

// Unicode White_Space, written out so that Rust, JavaScript and Java agree.
const WS = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);
export const isWhitespace = (cp) => WS.has(cp);

/**
 * Text rule v2. Every run of whitespace becomes one space (U+0020), and
 * whitespace at the start and the end is removed. Nothing else changes.
 */
export function canonicalText(s) {
  let out = '';
  let pending = false;
  for (const ch of String(s)) {
    if (WS.has(ch.codePointAt(0))) {
      pending = out.length > 0;
      continue;
    }
    if (pending) out += ' ';
    pending = false;
    out += ch;
  }
  return out;
}

/** Length in Unicode scalar values (what `text_chars` counts). */
export const charCount = (s) => [...String(s)].length;

/**
 * The text a stamp covers, given everything that stands before its tag.
 * v2: the last `chars` scalar values of the canonical prefix.
 * v1 (older stamps): the last `chars` of the prefix with CR removed and trimmed.
 * Returns null when the prefix is shorter than the stamp says.
 */
export function coveredText(prefix, chars, v = 2) {
  const base = v >= 2 ? canonicalText(prefix) : String(prefix).replace(/\r/g, '').trim();
  const cps = [...base];
  if (!Number.isInteger(chars) || chars <= 0 || cps.length < chars) return null;
  return cps.slice(cps.length - chars).join('');
}

/** Tags in a text: [{ id, index, length, account }] in order of appearance. */
export function findTags(text) {
  const out = [];
  const s = String(text);
  for (const m of s.matchAll(tagRegExp())) {
    const account = (m[0].match(/^\[NTK @([^\s\]]+) /) || [])[1] ?? null;
    out.push({ id: m[1], index: m.index, length: m[0].length, account });
  }
  return out;
}

// ---- encodings ---------------------------------------------------------

const enc = new TextEncoder();
const dec = new TextDecoder();
export const utf8 = (s) => enc.encode(s);
export const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

export function fromBase64(s) {
  const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export function toBase64Url(u8) {
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const encodeText = (s) => toBase64Url(utf8(s));
export const decodeText = (s) => dec.decode(fromBase64(s));

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function fromBase58(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error('not base58');
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== '1') break; bytes.unshift(0); }
  return new Uint8Array(bytes);
}

export async function sha256(u8) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', u8));
}
export const sha256Hex = async (s) => hex(await sha256(typeof s === 'string' ? utf8(s) : s));

// ---- links -------------------------------------------------------------

/** The verify page for a stamp, with the text before its tag in the fragment (never sent to a server). */
export function verifyUrl(id, prefixText = '', base = NTK.verifyBase) {
  return `${base}${id}${prefixText ? `#t=${encodeText(prefixText)}` : ''}`;
}

/** Where a stamp is published: OutLayer's public storage, readable by anyone. */
export function stampUrl(id, pins = NTK) {
  return `${pins.api}/public/storage/get?project=${encodeURIComponent(pins.project)}&key=${encodeURIComponent(`stamp:${id}`)}&format=raw`;
}

/** The published stamp, or null when no stamp has this id. */
export async function fetchStamp(id, { pins = NTK, fetchImpl = globalThis.fetch } = {}) {
  if (!/^[0-9a-f]{10}$/.test(id)) throw new Error('a stamp id is 10 lowercase hex characters');
  const res = await fetchImpl(stampUrl(id, pins));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`stamp lookup failed: HTTP ${res.status}`);
  return JSON.parse(await res.text());
}

// ---- verification ------------------------------------------------------

/**
 * Check one published stamp against the text that stood before its tag.
 * verdict: MATCH (every check passed), NO_MATCH (a genuine stamp, but the text
 * differs), INVALID (not signed by the pinned key, or tampered), UNKNOWN (no
 * stamp under this id).
 */
export async function verifyStamp(published, prefix, { id, pins = NTK } = {}) {
  const checks = [];
  const add = (key, ok, label, detail = '') => checks.push({ key, ok: !!ok, label, detail });
  if (!published) {
    add('found', false, 'A stamp exists under this id', id ? `no stamp ${id}` : '');
    return { verdict: 'UNKNOWN', checks, record: null, covered: null };
  }
  add('found', true, 'A stamp exists under this id', published.id);
  let record = null;
  try { record = JSON.parse(published.record); } catch { /* checked below */ }
  add('key', published.pk === pins.stampPk, 'Signed with the pinned NTK enclave key', published.pk);
  let sigOk = false;
  let sig = null;
  try {
    sig = fromBase64(published.sig);
    const pk = fromBase58(pins.stampPk.replace(/^ed25519:/, ''));
    sigOk = await verifyAsync(sig, utf8(STAMP_DOMAIN + published.record), pk);
  } catch { sigOk = false; }
  add('signature', sigOk, 'The signature over the record is valid');
  const idOk = !!sig && (await sha256Hex(sig)).slice(0, 10) === published.id && (!id || id === published.id);
  add('id', idOk, 'The id belongs to this signature', published.id);
  add('project', record && record.project === pins.project && record.kind === 'ntk-stamp',
    'Issued by the NTK project', record ? `${record.project}, ${record.network}` : 'unreadable record');
  if (!record || !sigOk || !idOk || published.pk !== pins.stampPk || record.project !== pins.project) {
    return { verdict: 'INVALID', checks, record, covered: null };
  }
  const covered = prefix == null ? null : coveredText(prefix, record.text_chars, record.v);
  const textOk = covered != null && (await sha256Hex(covered)) === record.text_sha256;
  add('text', textOk, 'The text before the tag is the stamped text',
    covered == null ? 'the text before the tag is shorter than the stamped text' : '');
  return { verdict: textOk ? 'MATCH' : 'NO_MATCH', checks, record, covered };
}

/** Verify every tag in a text. Each tag is checked against everything before it. */
export async function verifyText(text, opts = {}) {
  const results = [];
  for (const tag of findTags(text)) {
    const prefix = String(text).slice(0, tag.index);
    let published = null;
    let error = null;
    try { published = await fetchStamp(tag.id, opts); } catch (e) { error = e.message; }
    if (error) {
      results.push({ tag, verdict: 'ERROR', error, checks: [], record: null, covered: null });
      continue;
    }
    results.push({ tag, ...(await verifyStamp(published, prefix, { id: tag.id, pins: opts.pins })) });
  }
  return results;
}

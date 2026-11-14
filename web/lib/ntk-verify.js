// NTK stamp verification: the reference implementation of the text rule (v2)
// and of every check a verifier makes. One ES module with no build step that
// runs unchanged in browsers and in Node 20+. The enclave (Rust) and the
// keyboard (Android) implement the same rule; docs/protocol.md is the spec and
// docs/test-vectors/text-v2.json holds the shared test cases.
//
// A tag names no network. A verifier looks the id up on every network whose
// keys are pinned (lib/networks.js), in parallel, and checks the stamp with the
// pins of the network that has it.
import { verifyAsync } from '../vendor/noble-ed25519.js';
import { NETWORKS, DEFAULT_NETWORK, availableNetworks, hasStampKey } from './networks.js';

const VERIFY_BASE = 'https://ntk.tools/';

/** What a verifier pins on one network: { project, network, api, stampPk, verifyBase }. */
export function pinsFor(net) {
  return Object.freeze({ project: net.project, network: net.network, api: net.api, stampPk: net.stampPk, verifyBase: VERIFY_BASE });
}

/** What a verifier pins on the default network (testnet). A stamp signed by any other key is not an NTK stamp. */
export const NTK = pinsFor(NETWORKS[DEFAULT_NETWORK]);

/** The pins of every network whose enclave keys are known, the default first: where stamps are looked up. */
export const PINNED = Object.freeze(availableNetworks().map((n) => (n.network === NTK.network ? NTK : pinsFor(n))));

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

const checkId = (id) => {
  if (!/^[0-9a-f]{10}$/.test(id)) throw new Error('a stamp id is 10 lowercase hex characters');
};

/** The published stamp on one network, or null when no stamp has this id there. */
export async function fetchStamp(id, { pins = NTK, fetchImpl = globalThis.fetch } = {}) {
  checkId(id);
  const res = await fetchImpl(stampUrl(id, pins));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`stamp lookup failed: HTTP ${res.status}`);
  return JSON.parse(await res.text());
}

/**
 * Look a stamp id up on several networks at once (default: every pinned one).
 * Returns { found: [{ pins, published }], missing: [pins], errors: [{ pins, error }] }.
 */
export async function findStamp(id, { networks = PINNED, fetchImpl = globalThis.fetch } = {}) {
  checkId(id);
  const answers = await Promise.allSettled(networks.map((pins) => fetchStamp(id, { pins, fetchImpl })));
  const out = { found: [], missing: [], errors: [] };
  answers.forEach((a, i) => {
    const pins = networks[i];
    if (a.status === 'rejected') out.errors.push({ pins, error: a.reason?.message ?? String(a.reason) });
    else if (a.value) out.found.push({ pins, published: a.value });
    else out.missing.push(pins);
  });
  return out;
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
  // The record must name this network's project and this network: a stamp is valid only where it was issued.
  const projectOk = !!record && record.kind === 'ntk-stamp' && record.project === pins.project && record.network === pins.network;
  add('project', projectOk, 'Issued by the NTK project',
    !record ? 'unreadable record' : `${record.project}, ${record.network}${projectOk ? '' : ` (NTK on ${pins.network} is ${pins.project})`}`);
  if (!record || !sigOk || !idOk || published.pk !== pins.stampPk || !projectOk) {
    return { verdict: 'INVALID', checks, record, covered: null };
  }
  const covered = prefix == null ? null : coveredText(prefix, record.text_chars, record.v);
  const textOk = covered != null && (await sha256Hex(covered)) === record.text_sha256;
  add('text', textOk, 'The text before the tag is the stamped text',
    covered == null ? 'the text before the tag is shorter than the stamped text' : '');
  return { verdict: textOk ? 'MATCH' : 'NO_MATCH', checks, record, covered };
}

// When a stamp id exists on more than one network (a 40-bit coincidence), the most genuine result wins.
const RANK = { MATCH: 0, NO_MATCH: 1, INVALID: 2 };

/**
 * Check one stamp id against the text before its tag. The id is looked up on
 * every pinned network in parallel (networks without a stamp key are skipped)
 * and checked with the pins of the network that has it; `pins` checks one
 * network only. Returns verifyStamp()'s result plus `network` and `pins` (null
 * when no network has the id) and `networks`, the names of the networks asked.
 * When no network has it and a lookup failed: verdict ERROR, with `error`.
 */
export async function verifyId(id, prefix, { networks = PINNED, pins = null, fetchImpl = globalThis.fetch } = {}) {
  const list = pins ? [pins] : networks.filter(hasStampKey);
  const asked = list.map((p) => p.network);
  const { found, errors } = await findStamp(id, { networks: list, fetchImpl });
  if (found.length) {
    const results = await Promise.all(found.map(async (f) => ({
      ...(await verifyStamp(f.published, prefix, { id, pins: f.pins })), network: f.pins.network, pins: f.pins, networks: asked,
    })));
    return results.sort((a, b) => RANK[a.verdict] - RANK[b.verdict])[0];
  }
  if (errors.length) {
    const error = errors.map((e) => (list.length > 1 ? `${e.pins.network}: ${e.error}` : e.error)).join('; ');
    return { verdict: 'ERROR', error, checks: [], record: null, covered: null, network: null, pins: null, networks: asked };
  }
  return { ...(await verifyStamp(null, prefix, { id })), network: null, pins: null, networks: asked };
}

/** Verify every tag in a text. Each tag is checked against everything before it, on every pinned network (see verifyId). */
export async function verifyText(text, opts = {}) {
  const results = [];
  for (const tag of findTags(text)) {
    const prefix = String(text).slice(0, tag.index);
    results.push({ tag, ...(await verifyId(tag.id, prefix, opts)) });
  }
  return results;
}

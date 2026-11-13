// Verify page logic without the DOM: what the address asks to check, and what
// to show for a result of verifyStamp() / verifyText() from lib/ntk-verify.js.
// Every function here is pure, so `node --test` covers it (web/test/).
import { NTK, decodeText, canonicalText } from '../lib/ntk-verify.js';

/** Hosts that are the real verify site. Anywhere else (local dev) links use location.origin. */
export const SITE_HOSTS = new Set(['ntk.tools', 'www.ntk.tools']);

/** What a stamp means and does not mean: shown under every result. */
export const MEANING =
  'A stamp says this text was typed key by key on the NTK keyboard by someone whose typing ' +
  "matches this NEAR account's fingerprint, not that it was written without help.";

export const TITLES = Object.freeze({
  MATCH: 'MATCH',
  NO_MATCH: 'NO MATCH',
  INVALID: 'INVALID',
  UNKNOWN: 'UNKNOWN STAMP',
  NO_TEXT: 'NO TEXT GIVEN',
  ERROR: 'COULD NOT CHECK',
});

// The checks verifyStamp() makes, in order, with the labels it uses.
const STANDARD_CHECKS = [
  ['found', 'A stamp exists under this id'],
  ['key', 'Signed with the pinned NTK enclave key'],
  ['signature', 'The signature over the record is valid'],
  ['id', 'The id belongs to this signature'],
  ['project', 'Issued by the NTK project'],
  ['text', 'The text before the tag is the stamped text'],
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The stamp id from the path and the text from the fragment: `/<id>#t=<base64url>`.
 * Returns { id, text, error }: id null on any other path, text null when absent.
 */
export function parseLocation({ pathname = '/', hash = '' } = {}) {
  const m = /^\/([0-9a-f]{10})$/.exec(pathname);
  const t = new URLSearchParams(String(hash).replace(/^#/, '')).get('t');
  let text = null;
  let error = null;
  if (t) {
    try {
      text = decodeText(t);
    } catch {
      error = 'The text in this link is damaged, so it cannot be checked. Paste the message instead.';
    }
  }
  return { id: m ? m[1] : null, text, error };
}

/** Base for links to verify pages: the real site, or this origin in local development. */
export function verifyBaseFor({ hostname = '', origin = '' } = {}) {
  return SITE_HOSTS.has(hostname) || !origin || origin === 'null' ? NTK.verifyBase : `${origin}/`;
}

/** The message as it looked: the text, a space, the tag. Prefills the box on /<id>#t=… */
export function boxMessage(id, text) {
  if (!text) return '';
  return /\s$/.test(text) ? `${text}[NTK ${id}]` : `${text} [NTK ${id}]`;
}

/** True when there is any text at all before a tag (whitespace alone does not count). */
export const hasText = (prefix) => prefix != null && canonicalText(prefix).length > 0;

/** "2026-11-13 11:26 UTC" */
export function formatUtc(ms) {
  if (!Number.isFinite(ms)) return 'unknown';
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** The issuing OutLayer call: its attestation and the command that proves it. */
export function issuingCall(record, pins = NTK) {
  const id = record && typeof record.call_id === 'string' && UUID.test(record.call_id) ? record.call_id : null;
  if (!id) return null;
  const network = /^[a-z]+$/.test(record.network || '') ? record.network : pins.network;
  return {
    id,
    url: `${pins.api}/attestations/by-call/${id}`,
    command: `outlayer-verify call ${id} --network ${network}`,
  };
}

/** Every standard check, pass / fail / skip, with a reason for the skipped ones. */
export function checkList(result, { textGiven = true } = {}) {
  const got = new Map((result.checks || []).map((c) => [c.key, c]));
  return STANDARD_CHECKS.map(([key, label]) => {
    const c = got.get(key);
    if (c) {
      const skipText = key === 'text' && !textGiven;
      return {
        key,
        label: c.label || label,
        status: skipText ? 'skip' : c.ok ? 'pass' : 'fail',
        detail: skipText ? 'not checked: no text given' : c.detail || '',
      };
    }
    let why = 'not checked';
    if (result.verdict === 'ERROR') why = 'not checked: the stamp could not be fetched';
    else if (result.verdict === 'UNKNOWN') why = 'not checked: there is no stamp';
    else if (result.verdict === 'INVALID') why = 'not checked: the stamp is not valid';
    else if (key === 'text' && !textGiven) why = 'not checked: no text given';
    return { key, label, status: 'skip', detail: why };
  });
}

function facts(r) {
  const out = [
    ['NEAR account', r.account],
    ['Typed', formatUtc(r.issued_at_ms)],
    ['Typed share', Number.isFinite(r.typed_pct) ? `${r.typed_pct}% typed key by key` : null],
    ['Typing match score', Number.isFinite(r.score_pct)
      ? `${r.score_pct}%${Number.isFinite(r.threshold_pct) ? ` (needs ${r.threshold_pct}%)` : ''}` : null],
    ['Key taps', Number.isFinite(r.taps) ? String(r.taps) : null],
    ['Characters covered', Number.isFinite(r.text_chars) ? String(r.text_chars) : null],
    ['Fingerprint', Number.isFinite(r.profile_sessions)
      ? `${r.profile_sessions} enrollment session${r.profile_sessions === 1 ? '' : 's'}` : null],
    ['Network', r.network],
  ];
  return out.filter(([, v]) => v != null && v !== '').map(([label, value]) => ({ label, value: String(value) }));
}

/** The typing match score and the score it needs, for the scale on a MATCH: { pct, needs } (needs may be null). */
function score(r) {
  if (!r || !Number.isFinite(r.score_pct)) return null;
  return { pct: r.score_pct, needs: Number.isFinite(r.threshold_pct) ? r.threshold_pct : null };
}

/**
 * Everything the page shows for one result.
 * `result`: from verifyStamp() (plus `{ verdict: 'ERROR', error }` when the lookup failed).
 * `textGiven`: false when the address or the box had no text before the tag.
 */
export function buildView(result, { id, textGiven = true, pins = NTK, link = null } = {}) {
  const record = result.record || null;
  let verdict = result.verdict;
  if (verdict === 'NO_MATCH' && !textGiven) verdict = 'NO_TEXT';
  const genuine = verdict === 'MATCH' || verdict === 'NO_MATCH' || verdict === 'NO_TEXT';
  const account = genuine && record ? record.account : null;
  const chars = genuine && record ? record.text_chars : null;

  let summary;
  switch (verdict) {
    case 'MATCH':
      summary = `Typed on the NTK keyboard by ${account}. Every check passed.`;
      break;
    case 'NO_MATCH':
      summary = result.covered == null
        ? `A genuine stamp by ${account}, but the text before the tag is shorter than the ${chars} characters it covers.`
        : `A genuine stamp by ${account}, but the text before the tag is not the text that was stamped.`;
      break;
    case 'NO_TEXT':
      summary = `A genuine stamp by ${account}. Paste the message with its tag below to check its text.`;
      break;
    case 'INVALID':
      summary = 'Not a valid NTK stamp: it is not signed by the NTK enclave key, or it was altered.';
      break;
    case 'UNKNOWN':
      summary = `No stamp has the id ${id}. Check the tag for a typo.`;
      break;
    default:
      verdict = 'ERROR';
      summary = `The stamp could not be fetched${result.error ? ` (${result.error})` : ''}. Check the connection and try again.`;
  }

  const tone = { MATCH: 'match', NO_MATCH: 'nomatch', INVALID: 'invalid', UNKNOWN: 'unknown', NO_TEXT: 'neutral', ERROR: 'error' }[verdict];
  const showCovered = (verdict === 'MATCH' || verdict === 'NO_MATCH') && result.covered != null;
  return {
    id,
    link, // this check's own address (verifyUrl), for sharing
    verdict,
    title: TITLES[verdict],
    tone,
    summary,
    network: (genuine && record && record.network) || pins.network,
    covered: showCovered ? result.covered : null,
    coveredLabel: verdict === 'MATCH' ? 'The stamp covers this text' : `The last ${chars} characters before the tag`,
    facts: genuine && record ? facts(record) : [],
    score: verdict === 'MATCH' ? score(record) : null,
    record: genuine && record ? { v: record.v, enclave: record.enclave } : null,
    checks: checkList(result, { textGiven }),
    call: genuine ? issuingCall(record, pins) : null,
    meaning: genuine ? MEANING : null,
  };
}

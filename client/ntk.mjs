// NTK protocol client — what the keyboard (and any verifier) does:
// seal a typing session to the enclave's X25519 key, sign the request with a key
// of the user's NEAR account (NEP-413, the format of NEAR wallets' signMessage),
// call the enclave through OutLayer's HTTPS API, and verify stamps.
// docs/protocol.md is the contract; web/lib/ntk-verify.js is the reference verifier.
import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes, randomBytes } from '@noble/hashes/utils.js';
import { baseDecode } from 'near-api-js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalText, coveredText } from '../web/lib/ntk-verify.js';

export const RECIPIENT = 'near-the-keyboard';
/** The enclave's keys as pinned in docs/protocol.md. `info` must keep returning these. */
export const PINNED = Object.freeze({
  stampPk: 'ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG',
  transportPk: '4443a5935e077902ff3afc6a4d188c53168b8ec9bd9b0b847b4d1006ab95b729',
});
/** Polling of an asynchronous call (docs/protocol.md, "Calling the enclave"). */
export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 6 * 60 * 1000;
/** Operations that change nothing in the enclave, so sending one twice is harmless. */
const READ_ONLY = new Set(['info', 'status']);
const STAMP_DOMAIN = 'NTK-STAMP/v1\n';
const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reads ~/.ntk/<network>.env: NTK_API, NTK_PROJECT, NTK_PAYMENT_KEY. Never committed. */
export function loadEnv(network = 'testnet') {
  const file = path.join(os.homedir(), '.ntk', `${network}.env`);
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/** sha256(borsh(2^31+413) || borsh({message, nonce, recipient, callback_url: None})) */
export function nep413Hash(message, nonce, recipient = RECIPIENT) {
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
  const str = (s) => { const b = utf8ToBytes(s); return concatBytes(u32(b.length), b); };
  return sha256(concatBytes(u32(2147484061), str(message), nonce, str(recipient), new Uint8Array([0])));
}

/** hex(sha256(epk || nonce || ct)) — what the signed message commits to. */
export function sealedDigest(sealed) {
  if (!sealed) return '';
  return bytesToHex(sha256(concatBytes(hexToBytes(sealed.epk), hexToBytes(sealed.nonce), unb64(sealed.ct))));
}

/** Seal a session so that only the enclave can open it. aad binds it to op + account. */
export function seal(transportPkHex, session, op, account) {
  const pk = hexToBytes(transportPkHex);
  const esk = x25519.utils.randomSecretKey();
  const epk = x25519.getPublicKey(esk);
  const shared = x25519.getSharedSecret(esk, pk);
  const key = hkdf(sha256, shared, concatBytes(epk, pk), utf8ToBytes('ntk/v1/transport'), 32);
  const nonce = randomBytes(12);
  const aad = utf8ToBytes(`ntk/v1|${op}|${account}`);
  const ct = chacha20poly1305(key, nonce, aad).encrypt(utf8ToBytes(JSON.stringify(session)));
  return { epk: bytesToHex(epk), nonce: bytesToHex(nonce), ct: b64(ct) };
}

/** A NEP-413 signature by `keyPair` (a key of `accountId`) over the NTK request message. */
export function authFor({ op, accountId, keyPair, sealed, ts = Date.now() }) {
  const message = JSON.stringify({ ntk: 1, op, account: accountId, payload: sealedDigest(sealed), ts });
  const nonce = randomBytes(32);
  const { signature } = keyPair.sign(nep413Hash(message, nonce));
  return {
    account_id: accountId,
    public_key: keyPair.getPublicKey().toString(),
    signature: b64(signature),
    nonce: b64(nonce),
    message,
    recipient: RECIPIENT,
  };
}

/**
 * A call that produced no answer from the enclave. (An answer with `ok: false`
 * is not a CallError: the enclave ran and refused.)
 * - `mayHaveRun`: false only when OutLayer refused the call before queueing it.
 * - `transient`: the same call may succeed later.
 */
export class CallError extends Error {
  constructor(message, { op, callId = null, httpStatus = null, mayHaveRun = true, transient = true, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'CallError';
    Object.assign(this, { op, callId, httpStatus, mayHaveRun, transient, retryAfterMs });
  }
}

export class NtkClient {
  /**
   * @param {object} o api, project ("owner/name"), paymentKey;
   *   pollIntervalMs (2 s) and timeoutMs (6 min) for polling a call;
   *   log: called with one line per call submitted and finished.
   */
  constructor({ api, project, paymentKey, pollIntervalMs = POLL_INTERVAL_MS, timeoutMs = POLL_TIMEOUT_MS, submitTimeoutMs = 90_000, log = () => {} }) {
    Object.assign(this, { api, project, paymentKey, pollIntervalMs, timeoutMs, submitTimeoutMs, log });
    this.calls = []; // exact request bodies and responses, kept for attestation checks
  }

  /**
   * One enclave call, asynchronous: POST {api}/call/{owner}/{name} with
   * {input, async: true} answers at once with a call id, then GET {api}/calls/{id}
   * is polled every `pollIntervalMs` until the call completes, for at most
   * `timeoutMs`. Returns { output, call, body }, where `output` is the enclave's
   * answer.
   *
   * Sending again: `info` and `status` change nothing and are sent again after
   * any transient failure. An `enroll` or `stamp` is sent again only when
   * OutLayer refused it before queueing it (HTTP 429 or 503: nothing ran). After
   * any other failure it may have run, and the enclave refuses a replayed
   * request, so the error is thrown: sign a fresh request to try again.
   */
  async call(input, { pollIntervalMs = this.pollIntervalMs, timeoutMs = this.timeoutMs, retries = 2 } = {}) {
    const op = input?.operation;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.#callOnce(input, { pollIntervalMs, timeoutMs });
      } catch (e) {
        const again = e instanceof CallError && e.transient && (READ_ONLY.has(op) || !e.mayHaveRun);
        if (!again || attempt >= retries) throw e;
        this.log(`${op}: ${e.message}; sending it again`);
        await sleep(e.retryAfterMs ?? pollIntervalMs);
      }
    }
  }

  async #callOnce(input, { pollIntervalMs, timeoutMs }) {
    const op = input?.operation;
    const [owner, ...rest] = this.project.split('/');
    const body = JSON.stringify({ input, async: true });
    const headers = { 'X-Payment-Key': this.paymentKey };
    const started = Date.now();

    let res;
    let text;
    try {
      res = await fetch(`${this.api}/call/${owner}/${rest.join('/')}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(this.submitTimeoutMs),
      });
      text = await res.text();
    } catch (e) {
      throw new CallError(`${op}: submitting the call failed (${e.message}); it may still have been queued`, { op });
    }
    let call = null;
    try { call = JSON.parse(text); } catch { /* reported below */ }
    if (!res.ok || !call?.call_id) {
      const s = res.status;
      // 429 and 503 come before the call is queued: nothing ran, nothing was charged.
      const notRun = s === 429 || s === 503;
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new CallError(`${op}: OutLayer answered ${s} to the call: ${text.slice(0, 300) || '(empty body)'}`, {
        op,
        httpStatus: s,
        mayHaveRun: !(notRun || (s >= 400 && s < 500)),
        transient: notRun || s >= 500 || res.ok,
        retryAfterMs: retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : null,
      });
    }
    this.log(`${op}: call ${call.call_id} queued`);

    const deadline = started + timeoutMs;
    while (call.status !== 'completed') {
      if (call.status === 'failed') {
        throw new CallError(`${op}: call ${call.call_id} failed: ${call.error ?? 'no reason given'}`, { op, callId: call.call_id });
      }
      if (Date.now() >= deadline) {
        throw new CallError(`${op}: call ${call.call_id} not finished after ${Math.round(timeoutMs / 1000)} s; it may still run`, { op, callId: call.call_id });
      }
      await sleep(pollIntervalMs);
      let r;
      let t;
      try {
        r = await fetch(`${this.api}/calls/${call.call_id}`, { headers, signal: AbortSignal.timeout(30_000) });
        t = await r.text();
      } catch {
        continue; // a passing network fault: poll again until the deadline
      }
      if (r.status === 401 || r.status === 403) {
        throw new CallError(`${op}: polling call ${call.call_id} was refused (${r.status}): ${t.slice(0, 200)}`, { op, callId: call.call_id, httpStatus: r.status, transient: false });
      }
      let next = null;
      try { next = r.ok ? JSON.parse(t) : null; } catch { /* poll again */ }
      if (next?.status) call = { ...call, ...next };
    }

    const output = parseOutput(call.output);
    const ms = Date.now() - started;
    this.calls.push({ op, call_id: call.call_id, input, output, attestation_url: call.attestation_url, ms, time_ms: call.time_ms ?? null });
    this.log(`${op}: call ${call.call_id} completed in ${(ms / 1000).toFixed(1)} s`);
    return { output, call, body };
  }

  async info() { return (await this.call({ operation: 'info' })).output; }

  async request(op, { accountId, keyPair, session, transportPk, sealedOverride, auth }) {
    const sealed = sealedOverride ?? (session ? seal(transportPk, session, op, accountId) : undefined);
    const input = { operation: op, auth: auth ?? authFor({ op, accountId, keyPair, sealed }) };
    if (sealed) input.sealed = sealed;
    return (await this.call(input)).output;
  }

  async publicStamp(id) {
    const url = `${this.api}/public/storage/get?project=${encodeURIComponent(this.project)}&key=${encodeURIComponent(`stamp:${id}`)}&format=raw`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`public storage ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return JSON.parse(await res.text());
  }

  async attestation(call_id) {
    const res = await fetch(`${this.api}/attestations/by-call/${call_id}`);
    if (!res.ok) throw new Error(`attestation ${res.status}`);
    return res.json();
  }
}

/** `output` may arrive as a JSON string; parse it when it is one. */
function parseOutput(output) {
  if (typeof output !== 'string') return output;
  try { return JSON.parse(output); } catch { return output; }
}

/**
 * The hash a stamp record carries for a text: record v2 hashes the canonical
 * text (text rule v2), v1 the text with CR removed and trimmed.
 */
export function textHash(text, v = 2) {
  const t = v >= 2 ? canonicalText(text) : String(text).replace(/\r/g, '').trim();
  return bytesToHex(sha256(utf8ToBytes(t)));
}

/**
 * Verify a published stamp against the pinned stamp key and, when given, the
 * text that stands before its tag (the covered text, by the record's rule).
 * Synchronous; the full check with verdicts is verifyStamp() in web/lib/ntk-verify.js.
 */
export function verifyStamp(published, pinnedStampPk, textBeforeTag) {
  const checks = {};
  checks.pinned_key = published.pk === pinnedStampPk;
  const pk = baseDecode(pinnedStampPk.replace(/^ed25519:/, ''));
  const sig = unb64(published.sig);
  checks.signature = ed25519.verify(sig, utf8ToBytes(STAMP_DOMAIN + published.record), pk);
  checks.id = bytesToHex(sha256(sig)).slice(0, 10) === published.id;
  const record = JSON.parse(published.record);
  if (textBeforeTag !== undefined) {
    const covered = coveredText(textBeforeTag, record.text_chars, record.v);
    checks.text = covered != null && record.text_sha256 === bytesToHex(sha256(utf8ToBytes(covered)));
  }
  checks.verdict = record.score_pct >= record.threshold_pct;
  return { ok: Object.values(checks).every(Boolean), checks, record };
}

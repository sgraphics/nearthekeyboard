// NTK protocol client — what the keyboard (and any verifier) does:
// seal a typing session to the enclave's X25519 key, sign the request with a key
// of the user's NEAR account (NEP-413, the format of NEAR wallets' signMessage),
// call the enclave through OutLayer's HTTPS API, and verify stamps.
import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes, randomBytes } from '@noble/hashes/utils.js';
import { baseDecode } from 'near-api-js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const RECIPIENT = 'near-the-keyboard';
const STAMP_DOMAIN = 'NTK-STAMP/v1\n';
const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

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

export class NtkClient {
  constructor({ api, project, paymentKey }) {
    Object.assign(this, { api, project, paymentKey });
    this.calls = []; // exact request bodies and responses, kept for attestation checks
  }

  /** POST /call/{owner}/{name}; returns { output, call, body }. Retries a cold-start empty reply once. */
  async call(input, { retries = 2 } = {}) {
    const [owner, ...rest] = this.project.split('/');
    const body = JSON.stringify({ input, async: false });
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${this.api}/call/${owner}/${rest.join('/')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Payment-Key': this.paymentKey },
        body,
      });
      const text = await res.text();
      if (!text && attempt < retries) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      let call;
      try { call = JSON.parse(text); } catch { throw new Error(`OutLayer ${res.status}: ${text.slice(0, 300)}`); }
      if (!res.ok || call.status !== 'completed') throw new Error(`OutLayer ${res.status}: ${text.slice(0, 400)}`);
      const output = typeof call.output === 'string' ? JSON.parse(call.output) : call.output;
      this.calls.push({ op: input.operation, call_id: call.call_id, input, output, attestation_url: call.attestation_url });
      return { output, call, body };
    }
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

/** The text hash a stamp commits to: CR removed, surrounding whitespace trimmed. */
export function textHash(text) {
  return bytesToHex(sha256(utf8ToBytes(text.replace(/\r/g, '').trim())));
}

/** Verify a published stamp against the pinned enclave stamp key. Needs no enclave, no account, no fingerprint. */
export function verifyStamp(published, pinnedStampPk, text) {
  const checks = {};
  checks.pinned_key = published.pk === pinnedStampPk;
  const pk = baseDecode(pinnedStampPk.replace(/^ed25519:/, ''));
  const sig = unb64(published.sig);
  checks.signature = ed25519.verify(sig, utf8ToBytes(STAMP_DOMAIN + published.record), pk);
  checks.id = bytesToHex(sha256(sig)).slice(0, 10) === published.id;
  const record = JSON.parse(published.record);
  if (text !== undefined) checks.text = record.text_sha256 === textHash(text);
  checks.verdict = record.score_pct >= record.threshold_pct;
  return { ok: Object.values(checks).every(Boolean), checks, record };
}

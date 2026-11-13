// Writes the shared test vectors in docs/test-vectors/. Every implementation of
// the NTK protocol (Rust enclave, Android keyboard, web verifier, this client)
// checks itself against these files. All inputs are fixed, so the output is
// the same on every run:   node vectors.mjs
import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, utf8ToBytes, concatBytes } from '@noble/hashes/utils.js';
import { baseEncode } from 'near-api-js';
import fs from 'node:fs';
import { canonicalText, charCount, coveredText, sha256Hex } from '../web/lib/ntk-verify.js';
import { nep413Hash } from './ntk.mjs';

const out = new URL('../docs/test-vectors/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const b64 = (u8) => Buffer.from(u8).toString('base64');
const fill = (n, f) => Uint8Array.from({ length: n }, (_, i) => f(i));

// ---- text rule v2 --------------------------------------------------------
const canonicalCases = [
  ['collapses runs and trims', '  Hello   world \n'],
  ['CR LF is one space', 'a\r\nb'],
  ['tab and no-break space', 'tab\tand nbsp'],
  ['em space and ideographic space', ' em space　ideographic'],
  ['empty', ''],
  ['only whitespace', ' \t\n '],
  ['non-ASCII letters and an emoji count as one scalar each', 'émoji 👍 ok'],
  ['zero-width space is not whitespace', 'zero​width'],
  ['line separator', 'line1 line2'],
  ['next line (U+0085) is whitespace', 'NEL\u0085x'],
  ['byte order mark (U+FEFF) is not whitespace', 'bom﻿x'],
  ['information separator (U+001C) is not whitespace', 'x\u001cy'],
  ['the demo reply', 'I agree with this, and I typed every word myself.'],
];
const canonical = [];
for (const [name, input] of canonicalCases) {
  const c = canonicalText(input);
  canonical.push({ name, input, canonical: c, chars: charCount(c), sha256: await sha256Hex(c) });
}

const reply = 'I agree with this, and I typed every word myself.';
const coveredCases = [
  { name: 'earlier text and odd spacing before the stamped text', prefix: `Earlier text.  I agree with this,\nand I typed every word myself. `, chars: charCount(reply), v: 2 },
  { name: 'an earlier tag is outside the covered text', prefix: 'First part [NTK 0123456789] second part ', chars: charCount('second part'), v: 2 },
  { name: 'prefix shorter than the stamped text', prefix: 'too short', chars: 50, v: 2 },
  { name: 'v1 stamps: CR removed and trimmed, no collapsing', prefix: ' This reply was typed by me, a human, on my own phone, one key at a time. ', chars: 72, v: 1 },
];
const covered = coveredCases.map((c) => ({ ...c, covered: coveredText(c.prefix, c.chars, c.v) }));

fs.writeFileSync(new URL('text-v2.json', out), JSON.stringify({
  spec: 'docs/protocol.md, "Text rule v2"',
  whitespace: 'U+0009-000D, U+0020, U+0085, U+00A0, U+1680, U+2000-200A, U+2028, U+2029, U+202F, U+205F, U+3000',
  canonical, covered,
}, null, 2) + '\n');

// ---- transport sealing ---------------------------------------------------
const transportSeed = fill(32, (i) => i + 1);
const transportPk = x25519.getPublicKey(transportSeed);
const ephSecret = fill(32, (i) => 0xa0 + i);
const epk = x25519.getPublicKey(ephSecret);
const nonce12 = fill(12, (i) => 0x10 + i);
const op = 'stamp';
const account = 'ntk-alice.testnet';
const session = JSON.stringify({ v: 1, layout: 'qwerty-en-portrait-v1', events: [{ k: 'h', d: 0, u: 85, x: 0.1, y: -0.05 }, { k: 'i', d: 190, u: 262, x: -0.02, y: 0.12 }] });
const shared = x25519.getSharedSecret(ephSecret, transportPk);
const key = hkdf(sha256, shared, concatBytes(epk, transportPk), utf8ToBytes('ntk/v1/transport'), 32);
const aad = `ntk/v1|${op}|${account}`;
const ct = chacha20poly1305(key, nonce12, utf8ToBytes(aad)).encrypt(utf8ToBytes(session));
const sealedDigest = bytesToHex(sha256(concatBytes(epk, nonce12, ct)));

// ---- NEP-413 request signature --------------------------------------------
const userSeed = fill(32, (i) => 0x40 + i);
const userPk = ed25519.getPublicKey(userSeed);
const message = JSON.stringify({ ntk: 1, op, account, payload: sealedDigest, ts: 1794569167000 });
const nonce32 = fill(32, (i) => 0xc0 + i);
const hash = nep413Hash(message, nonce32);
const signature = ed25519.sign(hash, userSeed);

// ---- a real published stamp -------------------------------------------------
const stamp = {
  id: 'e65ee28db5',
  pk: 'ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG',
  record: '{"v":1,"kind":"ntk-stamp","account":"ntk-alice.testnet","text_sha256":"ff70b908dd7fd61ad557b4890f9fa5ad65c85c1cfcd13ac06783a35c40d56afc","text_chars":72,"taps":73,"typed_pct":100,"score_pct":98,"threshold_pct":65,"profile_sessions":3,"issued_at_ms":1794569167718,"project":"nearthekeyboard.testnet/ntk","network":"testnet","call_id":"3437877d-fbaa-482b-a042-1673f4135fde","enclave":"0.1.0"}',
  sig: 'CN/iLs/yDx/b2dddv0r5/njS791N8KClakHAbHS4WzB2lvigAUHtDg2HSUCj4FaQneCk6cj1YfzvAYp3/0avDw==',
  text: 'This reply was typed by me, a human, on my own phone, one key at a time.',
};
const stampPk = (await import('../web/lib/ntk-verify.js')).fromBase58(stamp.pk.slice(8));
const stampOk = ed25519.verify(Buffer.from(stamp.sig, 'base64'), utf8ToBytes('NTK-STAMP/v1\n' + stamp.record), stampPk);
if (!stampOk) throw new Error('the real stamp does not verify');

fs.writeFileSync(new URL('crypto-v1.json', out), JSON.stringify({
  spec: 'docs/protocol.md',
  seal: {
    transport_seed_hex: bytesToHex(transportSeed), transport_pk_hex: bytesToHex(transportPk),
    eph_secret_hex: bytesToHex(ephSecret), epk_hex: bytesToHex(epk), nonce_hex: bytesToHex(nonce12),
    op, account, aad, plaintext: session,
    shared_hex: bytesToHex(shared), key_hex: bytesToHex(key),
    ct_b64: b64(ct), sealed_digest_hex: sealedDigest,
  },
  nep413: {
    seed_hex: bytesToHex(userSeed), public_key: `ed25519:${baseEncode(userPk)}`,
    message, nonce_b64: b64(nonce32), recipient: 'near-the-keyboard',
    hash_hex: bytesToHex(hash), signature_b64: b64(signature),
  },
  stamp: { ...stamp, stamp_domain: 'NTK-STAMP/v1\\n', sig_sha256_hex: bytesToHex(sha256(Buffer.from(stamp.sig, 'base64'))) },
}, null, 2) + '\n');

console.log(`wrote ${canonical.length} canonical cases, ${covered.length} covered cases, and the crypto vectors to docs/test-vectors/`);

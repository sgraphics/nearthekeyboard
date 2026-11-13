// The SHA-256 / SHA-512 fallback for plain-http pages (web/verify/sha-fallback.js):
// compared with node:crypto, and used by noble-ed25519 to verify the real stamp.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { sha256, sha512, subtleFallback, installSubtleFallback } from '../verify/sha-fallback.js';
import { hashes, verifyAsync } from '../vendor/noble-ed25519.js';
import { fromBase64, fromBase58, utf8, STAMP_DOMAIN } from '../lib/ntk-verify.js';

const { stamp: STAMP } = JSON.parse(fs.readFileSync(new URL('../../docs/test-vectors/crypto-v1.json', import.meta.url), 'utf8'));
const hex = (u8) => Buffer.from(u8).toString('hex');
const node = (alg, u8) => createHash(alg).update(u8).digest('hex');

/** Deterministic bytes (xorshift), so a failure can be reproduced. */
function bytes(n, seed) {
  const out = new Uint8Array(n);
  let x = seed | 1;
  for (let i = 0; i < n; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

test('SHA-256 and SHA-512 agree with node:crypto on every length 0..300 and some larger ones', () => {
  const lengths = [...Array(301).keys(), 447, 448, 511, 512, 1000, 4099, 65536 + 7];
  for (const n of lengths) {
    const b = bytes(n, n + 1);
    assert.equal(hex(sha256(b)), node('sha256', b), `sha256 length ${n}`);
    assert.equal(hex(sha512(b)), node('sha512', b), `sha512 length ${n}`);
  }
  assert.equal(hex(sha256(new TextEncoder().encode('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('subtle.digest: names, objects, buffers and views; unknown names are refused', async () => {
  const b = bytes(77, 9);
  const view = new DataView(b.buffer, 5, 40);
  assert.equal(hex(new Uint8Array(await subtleFallback.digest('SHA-256', b))), node('sha256', b));
  assert.equal(hex(new Uint8Array(await subtleFallback.digest({ name: 'SHA-512' }, b.buffer))), node('sha512', b));
  assert.equal(hex(new Uint8Array(await subtleFallback.digest('sha-256', view))), node('sha256', b.subarray(5, 45)));
  await assert.rejects(subtleFallback.digest('SHA-1', b), /not available/);
  await assert.rejects(subtleFallback.digest('SHA-256', 'text'), TypeError);
});

test('installSubtleFallback only fills in what is missing', () => {
  const bare = { crypto: {} };
  assert.equal(installSubtleFallback(bare), true);
  assert.equal(bare.crypto.subtle, subtleFallback);
  const none = {};
  assert.equal(installSubtleFallback(none), true);
  assert.equal(none.crypto.subtle, subtleFallback);
  const real = { crypto: { subtle: { digest() {} } } };
  assert.equal(installSubtleFallback(real), false);
  assert.notEqual(real.crypto.subtle, subtleFallback);
});

test('noble-ed25519 verifies the real stamp e65ee28db5 with the fallback SHA-512', async () => {
  const original = hashes.sha512Async;
  let used = 0;
  hashes.sha512Async = async (m) => { used++; return sha512(m); };
  try {
    const pk = fromBase58(STAMP.pk.replace(/^ed25519:/, ''));
    const msg = utf8(STAMP_DOMAIN + STAMP.record);
    assert.equal(await verifyAsync(fromBase64(STAMP.sig), msg, pk), true);
    assert.equal(await verifyAsync(fromBase64(STAMP.sig), utf8(`${STAMP_DOMAIN}${STAMP.record} `), pk), false);
    assert.ok(used > 0, 'the fallback was used');
  } finally {
    hashes.sha512Async = original;
  }
  assert.equal(hex(sha256(utf8(STAMP.text))), JSON.parse(STAMP.record).text_sha256);
});

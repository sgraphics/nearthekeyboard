// Test helpers (not a test file): stamps signed with a throwaway ed25519 key,
// for networks whose real enclave key is not pinned yet (mainnet), and a fetch
// that answers OutLayer's public storage per network. No side effects.
import crypto from 'node:crypto';
import { NETWORKS } from '../lib/networks.js';
import { STAMP_DOMAIN, canonicalText, charCount, sha256Hex } from '../lib/ntk-verify.js';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = `1${s}`; }
  return s;
}

/** A fresh key pair: { pk: 'ed25519:<base58>', sign(text) -> signature bytes }. */
export function testKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  return { pk: `ed25519:${base58(raw)}`, sign: (text) => crypto.sign(null, Buffer.from(text, 'utf8'), privateKey) };
}

/** Mainnet as lib/networks.js has it, with both keys pinned (the stamp key is `key`'s). */
export const pinnedMainnet = (key) => Object.freeze({ ...NETWORKS.mainnet, stampPk: key.pk, transportPk: 'ab'.repeat(32) });

/**
 * A published stamp {id, pk, record, sig} as the enclave makes it: a v2 record for
 * `text`, signed by `key`. `fields` overrides record fields (project, network, …).
 */
export async function signedStamp(key, text, fields = {}) {
  const canonical = canonicalText(text);
  const record = JSON.stringify({
    v: 2, kind: 'ntk-stamp', account: 'ntk-alice.near', text_sha256: await sha256Hex(canonical),
    text_chars: charCount(canonical), taps: 52, typed_pct: 100, score_pct: 90, threshold_pct: 80, profile_sessions: 4,
    issued_at_ms: 1794650000000, project: NETWORKS.mainnet.project, network: 'mainnet',
    call_id: '6f0e8a52-2f43-4c1b-9d4e-2a8f6b1c9e07', enclave: '0.2.0', ...fields,
  });
  const sig = key.sign(STAMP_DOMAIN + record);
  return { id: (await sha256Hex(new Uint8Array(sig))).slice(0, 10), pk: key.pk, record, sig: sig.toString('base64') };
}

/**
 * A fetch for stamp lookups: `tables` maps an OutLayer API origin to { <id>: stamp | HTTP status }.
 * A request for another project than that network's, or to an unknown origin, fails the test.
 * Records every URL; `maxInFlight` shows whether lookups ran in parallel.
 */
export function storageFetch(tables, { projects = { [NETWORKS.testnet.api]: NETWORKS.testnet.project, [NETWORKS.mainnet.api]: NETWORKS.mainnet.project } } = {}) {
  const calls = [];
  let inFlight = 0;
  const f = async (url) => {
    calls.push(url);
    inFlight++;
    f.maxInFlight = Math.max(f.maxInFlight, inFlight);
    try {
      await new Promise((r) => setTimeout(r, 15));
      const u = new URL(url);
      if (!(u.origin in tables)) throw new Error(`unexpected host ${u.origin}`);
      if (u.pathname !== '/public/storage/get' || u.searchParams.get('project') !== projects[u.origin]) {
        throw new Error(`unexpected lookup ${url}`);
      }
      const id = u.searchParams.get('key').replace(/^stamp:/, '');
      const v = tables[u.origin][id];
      if (v === undefined) return new Response('not found', { status: 404 });
      if (typeof v === 'number') return new Response('error', { status: v });
      return new Response(JSON.stringify(v), { status: 200 });
    } finally {
      inFlight--;
    }
  };
  f.calls = calls;
  f.maxInFlight = 0;
  return f;
}

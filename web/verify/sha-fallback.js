// SHA-256 and SHA-512 in plain JavaScript, for pages opened over plain http
// from another machine (an emulator at http://10.0.2.2:3970, a phone on the
// LAN). Browsers hide crypto.subtle outside secure contexts, and both the
// reference verifier (SHA-256) and noble-ed25519 (SHA-512) call
// crypto.subtle.digest. On https and on localhost the browser's own is used.
//
// Round constants and initial values are computed, not typed in: the
// fractional parts of the square and cube roots of the first primes (FIPS 180-4).
// web/test/sha-fallback.test.mjs compares both digests with node:crypto.

function primes(n) {
  const out = [];
  for (let c = 2; out.length < n; c++) if (out.every((p) => c % p !== 0)) out.push(c);
  return out;
}

/** floor(n ** (1/k)) for BigInt n >= 0 (Newton's method from above). */
function iroot(n, k) {
  if (n < 2n) return n;
  let x = 1n << (BigInt(n.toString(2).length) / k + 1n);
  for (;;) {
    const y = ((k - 1n) * x + n / x ** (k - 1n)) / k;
    if (y >= x) return x;
    x = y;
  }
}

const M32 = 0xffffffffn;
const M64 = (1n << 64n) - 1n;
const P = primes(80).map(BigInt);
const K256 = Uint32Array.from(P.slice(0, 64), (p) => Number(iroot(p << 96n, 3n) & M32));
const H256 = Uint32Array.from(P.slice(0, 8), (p) => Number(iroot(p << 64n, 2n) & M32));
const K512 = P.map((p) => iroot(p << 192n, 3n) & M64);
const H512 = P.slice(0, 8).map((p) => iroot(p << 128n, 2n) & M64);

const ror = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256(bytes) {
  const len = bytes.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(len / 0x20000000));
  dv.setUint32(total - 4, (len * 8) >>> 0);
  const H = H256.slice();
  const W = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15];
      const b = W[i - 2];
      W[i] = W[i - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + W[i - 7] + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10));
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + W[i]) | 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d;
    H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  H.forEach((v, i) => odv.setUint32(i * 4, v));
  return out;
}

const rot = (x, n) => ((x >> n) | (x << (64n - n))) & M64;

export function sha512(bytes) {
  const len = bytes.length;
  const total = Math.ceil((len + 17) / 128) * 128;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setBigUint64(total - 8, BigInt(len) * 8n);
  const H = H512.slice();
  const W = new Array(80);
  for (let off = 0; off < total; off += 128) {
    for (let i = 0; i < 16; i++) W[i] = dv.getBigUint64(off + i * 8);
    for (let i = 16; i < 80; i++) {
      const a = W[i - 15];
      const b = W[i - 2];
      W[i] = (W[i - 16] + (rot(a, 1n) ^ rot(a, 8n) ^ (a >> 7n)) + W[i - 7] + (rot(b, 19n) ^ rot(b, 61n) ^ (b >> 6n))) & M64;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 80; i++) {
      const t1 = (h + (rot(e, 14n) ^ rot(e, 18n) ^ rot(e, 41n)) + ((e & f) ^ (~e & M64 & g)) + K512[i] + W[i]) & M64;
      const t2 = ((rot(a, 28n) ^ rot(a, 34n) ^ rot(a, 39n)) + ((a & b) ^ (a & c) ^ (b & c))) & M64;
      h = g; g = f; f = e; e = (d + t1) & M64;
      d = c; c = b; b = a; a = (t1 + t2) & M64;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) & M64; });
  }
  const out = new Uint8Array(64);
  const odv = new DataView(out.buffer);
  H.forEach((v, i) => odv.setBigUint64(i * 8, v));
  return out;
}

function bytesOf(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new TypeError('digest data must be an ArrayBuffer or a view of one');
}

/** The part of SubtleCrypto that the verifier uses: digest('SHA-256' | 'SHA-512', data). */
export const subtleFallback = Object.freeze({
  async digest(algorithm, data) {
    const name = String(algorithm && typeof algorithm === 'object' ? algorithm.name : algorithm).toUpperCase();
    if (name === 'SHA-256') return sha256(bytesOf(data)).buffer;
    if (name === 'SHA-512') return sha512(bytesOf(data)).buffer;
    throw new Error(`digest ${name} is not available on plain http`);
  },
});

/** Give `g.crypto` a subtle.digest when the browser withholds it. Returns true when installed. */
export function installSubtleFallback(g = globalThis) {
  if (g.crypto && g.crypto.subtle) return false;
  if (!g.crypto) g.crypto = {};
  Object.defineProperty(g.crypto, 'subtle', { value: subtleFallback, configurable: true, enumerable: true });
  return true;
}

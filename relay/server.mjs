#!/usr/bin/env node
// NTK relay: holds the OutLayer payment key, so the keyboard does not have to.
// Node 20+, no dependencies. Endpoints (docs/protocol.md, "Calling the enclave"):
//
//   POST /api/call        {"input": {...}}  -> {"call_id"}   forwards {input, async: true} to OutLayer
//   GET  /api/calls/<id>  OutLayer's call object, unchanged (only for calls this relay started)
//   GET  /api/info        {"output": <the enclave's info output>, "at": <ms>}, cached, refreshed in the background
//
// What it can and cannot do: it sees account names, operations, times and sizes.
// It cannot read sessions (sealed to the enclave) or act for a user (requests
// are signed by the user's NEAR key and bound to the sealed session).
//
// Environment:
//   NTK_API, NTK_PROJECT, NTK_PAYMENT_KEY   required (or from NTK_ENV_FILE)
//   NTK_ENV_FILE    optional KEY=value file, e.g. ~/.ntk/testnet.env; real environment variables win
//   PORT=3970  HOST=127.0.0.1
//   STATIC_DIR      optional: also serve web/ (local development: one port for the emulator)
//   KEEP_WARM_SEC=0 call `info` this often to keep the enclave warm (0 = off)
//   INFO_TTL_SEC=600  RATE_IP_PER_MIN=20  RATE_IP_PER_DAY=500  RATE_ACCOUNT_PER_MIN=10
//   RATE_ACCOUNT_PER_DAY=300  RATE_POLL_PER_MIN=120  RATE_GLOBAL_PER_MIN=120
//
// Logs: one line per request with method, path, operation, account, status and
// duration. Never bodies, never keys, never IP addresses.
//
//   NTK_ENV_FILE=~/.ntk/testnet.env STATIC_DIR=web node relay/server.mjs
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const OPERATIONS = Object.freeze(['info', 'enroll', 'stamp', 'status', 'forget']);
export const MAX_BODY = 1024 * 1024;
const DRAIN_LIMIT = 8 * MAX_BODY; // an oversized body is read and dropped up to here, then the socket is closed
const ACCOUNT_RE = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const CALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN = 60_000;
const DAY = 86_400_000;

/** The CSP and other headers the site is served with (the same as deploy/nginx/ntk.conf). */
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "font-src 'self'; connect-src 'self' https://testnet-api.outlayer.ai; object-src 'none'; base-uri 'none'; " +
    "form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
});

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

// ---- configuration ------------------------------------------------------

/** KEY=value lines; `export`, quotes, blank lines and # comments allowed. */
export function parseEnvFile(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}

const expandHome = (p) => (p === '~' || p.startsWith('~/') || p.startsWith('~\\') ? path.join(os.homedir(), p.slice(1)) : p);

function int(env, name, dflt, { min = 0 } = {}) {
  const raw = env[name];
  if (raw == null || raw === '') return dflt;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a number >= ${min}, not "${raw}"`);
  return n;
}

/** Settings from the environment (and NTK_ENV_FILE). Throws when a required one is missing. */
export function loadConfig(env = process.env) {
  let merged = { ...env };
  if (env.NTK_ENV_FILE) {
    const file = path.resolve(expandHome(env.NTK_ENV_FILE));
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { throw new Error(`NTK_ENV_FILE: cannot read ${file}`); }
    merged = { ...parseEnvFile(text), ...env };
  }
  const missing = ['NTK_API', 'NTK_PROJECT', 'NTK_PAYMENT_KEY'].filter((k) => !merged[k]);
  if (missing.length) throw new Error(`missing ${missing.join(', ')} (set them, or NTK_ENV_FILE=<file with KEY=value lines>)`);
  const api = String(merged.NTK_API).replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+/.test(api)) throw new Error('NTK_API must be an http(s) URL');
  if (!/^[^/\s]+\/[^\s]+$/.test(merged.NTK_PROJECT)) throw new Error('NTK_PROJECT must look like <owner>/<name>');
  const staticDir = merged.STATIC_DIR ? path.resolve(expandHome(merged.STATIC_DIR)) : null;
  if (staticDir && !fs.existsSync(path.join(staticDir, 'index.html'))) throw new Error(`STATIC_DIR: no index.html in ${staticDir}`);
  return {
    api,
    project: merged.NTK_PROJECT,
    paymentKey: merged.NTK_PAYMENT_KEY,
    port: int(merged, 'PORT', 3970),
    host: merged.HOST || '127.0.0.1',
    staticDir,
    keepWarmSec: int(merged, 'KEEP_WARM_SEC', 0),
    infoTtlSec: int(merged, 'INFO_TTL_SEC', 600),
    infoWaitSec: 20,
    callTtlSec: 1800,
    pollIntervalMs: 2000,
    pollTimeoutMs: 6 * MIN,
    prefetchInfo: true,
    limits: {
      ipPerMin: int(merged, 'RATE_IP_PER_MIN', 20),
      ipPerDay: int(merged, 'RATE_IP_PER_DAY', 500),
      accountPerMin: int(merged, 'RATE_ACCOUNT_PER_MIN', 10),
      accountPerDay: int(merged, 'RATE_ACCOUNT_PER_DAY', 300),
      pollPerMin: int(merged, 'RATE_POLL_PER_MIN', 120),
      globalPerMin: int(merged, 'RATE_GLOBAL_PER_MIN', 120),
    },
  };
}

// ---- helpers ------------------------------------------------------------

/** Fixed-window counters. hit() is false once `max` hits are used in the window (0 = no limit). */
export function rateLimiter(now = Date.now) {
  const windows = new Map();
  return {
    hit(key, max, windowMs) {
      if (!max) return { ok: true };
      const t = now();
      let w = windows.get(key);
      if (!w || w.reset <= t) {
        w = { n: 0, reset: t + windowMs };
        windows.set(key, w);
      }
      if (w.n >= max) return { ok: false, retryAfter: Math.max(1, Math.ceil((w.reset - t) / 1000)) };
      w.n++;
      return { ok: true };
    },
    sweep() {
      const t = now();
      for (const [k, w] of windows) if (w.reset <= t) windows.delete(k);
    },
    get size() { return windows.size; },
  };
}

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    const chunks = [];
    let size = 0;
    let tooBig = declared > limit;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) tooBig = true;
      if (!tooBig) chunks.push(c);
      else if (size > DRAIN_LIMIT) req.destroy();
    });
    req.on('end', () => (tooBig ? reject(new HttpError(413, `body over ${limit} bytes`)) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
    req.on('close', () => reject(new HttpError(400, 'the request was cut off'))); // no-op once settled
  });
}

const isObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const sleep = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) return resolve();
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

function clientIp(req) {
  const peer = req.socket.remoteAddress || '';
  const local = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  const real = req.headers['x-real-ip'];
  return local && typeof real === 'string' && real.trim() ? real.trim() : peer;
}

// ---- the relay ----------------------------------------------------------

/**
 * Build the relay. Returns { server, listen(), close(), refreshInfo(), state }.
 * `fetchImpl` and `log` are replaceable for tests.
 */
export function createRelay(config, { fetchImpl = globalThis.fetch, log = (line) => console.log(line), now = Date.now } = {}) {
  const cfg = config;
  const limiter = rateLimiter(now);
  const issued = new Map(); // call_id -> expiry: the relay passes on polls only for calls it started
  const stop = new AbortController();
  const timers = [];
  const state = { info: null, infoInflight: null, lastInfoAttempt: 0, upstreamCalls: 0 };
  const scrub = (s) => String(s).split(cfg.paymentKey).join('<payment key>');

  async function upstream(method, urlPath, body, timeoutMs) {
    state.upstreamCalls++;
    const headers = { 'X-Payment-Key': cfg.paymentKey, Accept: 'application/json' };
    if (body != null) headers['Content-Type'] = 'application/json';
    // Aborted by close() or after timeoutMs (AbortSignal.any needs Node 20.3; this works on every 20.x).
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), timeoutMs);
    const onStop = () => ac.abort(stop.signal.reason);
    stop.signal.addEventListener('abort', onStop, { once: true });
    try {
      const res = await fetchImpl(`${cfg.api}${urlPath}`, { method, headers, body, signal: ac.signal });
      const text = await res.text();
      return { status: res.status, headers: res.headers, text };
    } finally {
      clearTimeout(timer);
      stop.signal.removeEventListener('abort', onStop);
    }
  }

  function remember(callId) {
    const t = now();
    issued.set(callId, t + cfg.callTtlSec * 1000);
    if (issued.size > 10_000) for (const [k, exp] of issued) if (exp <= t) issued.delete(k);
  }

  /** POST the call to OutLayer (async). Returns the call_id, or throws an HttpError for the client. */
  async function startCall(input) {
    let r;
    try {
      r = await upstream('POST', `/call/${cfg.project}`, JSON.stringify({ input, async: true }), 30_000);
    } catch (e) {
      throw new HttpError(502, `OutLayer did not answer (${e.name === 'TimeoutError' ? 'timeout' : 'network error'})`);
    }
    if (r.status === 429 || r.status === 503) {
      const retry = r.headers.get('retry-after');
      throw Object.assign(new HttpError(r.status, `OutLayer is busy (HTTP ${r.status}); try again shortly`,
        retry ? { 'Retry-After': retry } : {}), { upstream: r.status });
    }
    let call = null;
    try { call = JSON.parse(r.text); } catch { /* handled below */ }
    if (r.status < 200 || r.status >= 300 || !call || typeof call.call_id !== 'string') {
      const detail = call && (call.error || call.message) ? scrub(call.error || call.message).slice(0, 300) : undefined;
      throw Object.assign(new HttpError(502, `OutLayer answered HTTP ${r.status}`), { upstream: r.status, detail });
    }
    remember(call.call_id);
    return call.call_id;
  }

  /** Start a call and poll it until it is completed; returns the parsed output. */
  async function runCall(input) {
    const callId = await startCall(input);
    const deadline = now() + cfg.pollTimeoutMs;
    while (now() < deadline && !stop.signal.aborted) {
      await sleep(cfg.pollIntervalMs, stop.signal);
      let r;
      try { r = await upstream('GET', `/calls/${callId}`, null, 20_000); } catch { continue; }
      if (r.status !== 200) continue;
      let call;
      try { call = JSON.parse(r.text); } catch { continue; }
      if (call.status === 'completed') {
        let out = call.output;
        if (typeof out === 'string') { try { out = JSON.parse(out); } catch { /* keep the string */ } }
        return { callId, output: out };
      }
      if (call.status === 'failed') throw new Error(`call ${callId} failed`);
    }
    throw new Error(`call ${callId} did not complete in time`);
  }

  /** Fetch `info` from the enclave into the cache. One at a time; at most one attempt per 30 s unless forced. */
  function refreshInfo({ force = false } = {}) {
    if (state.infoInflight) return state.infoInflight;
    if (!force && now() - state.lastInfoAttempt < 30_000) return Promise.resolve(state.info);
    state.lastInfoAttempt = now();
    const t0 = now();
    state.infoInflight = (async () => {
      try {
        const { callId, output } = await runCall({ operation: 'info' });
        if (!isObject(output) || output.ok !== true) throw new Error(`call ${callId}: info did not answer ok`);
        state.info = { output, at: now() };
        log(`${new Date().toISOString()} info refreshed by call ${callId} in ${Math.round((now() - t0) / 1000)}s`);
      } catch (e) {
        if (!stop.signal.aborted) log(`${new Date().toISOString()} info refresh failed: ${scrub(e.message)}`);
      } finally {
        state.infoInflight = null;
      }
      return state.info;
    })();
    return state.infoInflight;
  }

  // ---- handlers ----

  function send(res, status, body, headers = {}) {
    const isJson = body !== undefined && typeof body !== 'string' && !Buffer.isBuffer(body);
    const payload = body === undefined ? '' : isJson ? JSON.stringify(body) : body;
    res.writeHead(status, {
      ...(body !== undefined ? { 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8' } : {}),
      'Cache-Control': 'no-store',
      ...headers,
    });
    res.end(payload);
  }

  function limited(res, ...checks) {
    for (const [key, max, windowMs] of checks) {
      const r = limiter.hit(key, max, windowMs);
      if (!r.ok) {
        send(res, 429, { error: 'too many requests', retry_after: r.retryAfter }, { 'Retry-After': String(r.retryAfter) });
        return true;
      }
    }
    return false;
  }

  async function postCall(req, res, ctx) {
    const ip = clientIp(req);
    const L = cfg.limits;
    if (limited(res, [`ip-min:${ip}`, L.ipPerMin, MIN], [`ip-day:${ip}`, L.ipPerDay, DAY])) return;
    const raw = await readBody(req, MAX_BODY);
    let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return send(res, 400, { error: 'the body must be JSON: {"input": {...}}' }); }
    const input = isObject(body) ? body.input : null;
    if (!isObject(input)) return send(res, 400, { error: 'input must be an object' });
    if (typeof input.operation !== 'string' || !OPERATIONS.includes(input.operation)) {
      return send(res, 400, { error: `operation must be one of ${OPERATIONS.join(', ')}` });
    }
    ctx.op = input.operation;
    if (ctx.op !== 'info') {
      const account = isObject(input.auth) ? input.auth.account_id : null;
      if (typeof account !== 'string' || !ACCOUNT_RE.test(account)) {
        return send(res, 400, { error: 'auth.account_id must be a NEAR account id' });
      }
      ctx.account = account;
      if (limited(res, [`acct-min:${account}`, L.accountPerMin, MIN], [`acct-day:${account}`, L.accountPerDay, DAY])) return;
    }
    if (limited(res, ['global-min', L.globalPerMin, MIN])) return;
    try {
      const callId = await startCall(input);
      send(res, 200, { call_id: callId });
    } catch (e) {
      ctx.upstream = e.upstream;
      send(res, e.status || 502, { error: e.message, ...(e.detail ? { detail: e.detail } : {}) }, e.headers);
    }
  }

  async function getCall(req, res, id) {
    if (!CALL_ID_RE.test(id)) return send(res, 400, { error: 'a call id is a UUID' });
    if (limited(res, [`poll-min:${clientIp(req)}`, cfg.limits.pollPerMin, MIN])) return;
    const exp = issued.get(id);
    if (!exp || exp <= now()) return send(res, 404, { error: 'unknown call id: this relay did not start that call, or it is too old' });
    let r;
    try {
      r = await upstream('GET', `/calls/${id}`, null, 20_000);
    } catch (e) {
      return send(res, 502, { error: `OutLayer did not answer (${e.name === 'TimeoutError' ? 'timeout' : 'network error'})` });
    }
    send(res, r.status, r.text, { 'Content-Type': r.headers.get('content-type') || 'application/json' });
  }

  async function getInfo(req, res) {
    if (limited(res, [`info-min:${clientIp(req)}`, 60, MIN])) return;
    const fresh = state.info && now() - state.info.at < cfg.infoTtlSec * 1000;
    if (state.info) {
      if (!fresh) refreshInfo();
      return send(res, 200, state.info);
    }
    const pending = refreshInfo();
    const waited = await Promise.race([pending, sleep(cfg.infoWaitSec * 1000, stop.signal).then(() => null)]);
    if (waited) return send(res, 200, waited);
    send(res, 503, { error: 'info is being fetched from the enclave; try again shortly' }, { 'Retry-After': '10' });
  }

  async function serveStatic(req, res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }
    if (rel.includes('\0') || rel.split('/').some((s) => s.startsWith('.')) || rel.startsWith('/test/')) {
      return send(res, 404, 'Not found');
    }
    // The same routes as deploy/nginx/ntk.conf.
    if (rel === '/' || /^\/[0-9a-f]{10}$/.test(rel)) rel = '/index.html';
    else if (rel === '/favicon.ico') rel = '/assets/favicon.ico';
    else if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(cfg.staticDir, `.${rel}`);
    if (file !== cfg.staticDir && !file.startsWith(cfg.staticDir + path.sep)) return send(res, 404, 'Not found');
    let st;
    try { st = await fsp.stat(file); } catch { return send(res, 404, 'Not found'); }
    if (st.isDirectory()) return send(res, 301, undefined, { Location: `${pathname}/` });
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }

  async function handle(req, res) {
    const t0 = now();
    const ctx = { op: null, account: null, upstream: null };
    const { pathname } = new URL(req.url, 'http://relay.invalid');
    res.on('close', () => {
      const extra = ctx.upstream ? ` upstream=${ctx.upstream}` : '';
      log(`${new Date().toISOString()} ${req.method} ${pathname} op=${ctx.op || '-'} account=${ctx.account || '-'} ` +
        `${res.statusCode}${res.writableFinished ? '' : ' (aborted)'} ${now() - t0}ms${extra}`);
    });
    try {
      if (pathname.startsWith('/api/')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
        if (req.method === 'OPTIONS') return send(res, 204);
        const callMatch = /^\/api\/calls\/([^/]+)$/.exec(pathname);
        if (pathname === '/api/call') {
          if (req.method !== 'POST') return send(res, 405, { error: 'use POST' }, { Allow: 'POST, OPTIONS' });
          return await postCall(req, res, ctx);
        }
        if (pathname === '/api/info' || callMatch) {
          if (req.method !== 'GET') return send(res, 405, { error: 'use GET' }, { Allow: 'GET, OPTIONS' });
          return callMatch ? await getCall(req, res, callMatch[1]) : await getInfo(req, res);
        }
        return send(res, 404, { error: 'not found' });
      }
      if (cfg.staticDir && (req.method === 'GET' || req.method === 'HEAD')) return await serveStatic(req, res, pathname);
      return send(res, 404, 'Not found');
    } catch (e) {
      if (res.headersSent) return res.destroy();
      if (e instanceof HttpError) return send(res, e.status, { error: e.message }, { ...e.headers, Connection: 'close' });
      log(`${new Date().toISOString()} error in ${req.method} ${pathname}: ${scrub(e.message)}`);
      return send(res, 500, { error: 'internal error' });
    }
  }

  const server = http.createServer((req, res) => { handle(req, res); });
  server.requestTimeout = 30_000;
  server.headersTimeout = 20_000;

  return {
    server,
    state,
    refreshInfo,
    listen(port = cfg.port, host = cfg.host) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          timers.push(setInterval(() => limiter.sweep(), MIN).unref());
          if (cfg.keepWarmSec > 0) timers.push(setInterval(() => refreshInfo({ force: true }), cfg.keepWarmSec * 1000));
          if (cfg.prefetchInfo) refreshInfo({ force: true });
          resolve(server.address());
        });
      });
    },
    async close() {
      stop.abort();
      timers.forEach(clearInterval);
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

// ---- run ----------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    console.error(`ntk relay: ${e.message}`);
    process.exit(2);
  }
  const relay = createRelay(cfg);
  const addr = await relay.listen();
  console.log(`ntk relay on http://${addr.address}:${addr.port} -> ${cfg.api}/call/${cfg.project}` +
    `${cfg.staticDir ? `, serving ${cfg.staticDir}` : ''}${cfg.keepWarmSec ? `, keep-warm every ${cfg.keepWarmSec}s` : ''}`);
  const quit = () => { relay.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

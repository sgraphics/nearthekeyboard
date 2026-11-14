// The relay against a mocked OutLayer: forwarding, polling, the info cache,
// validation, limits, CORS, logs, static files and configuration.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRelay, loadConfig, mainnetConfig, parseEnvFile, rateLimiter, MAX_BODY, SECURITY_HEADERS } from '../server.mjs';

const KEY = 'test-owner.testnet:1:THIS-IS-NOT-A-REAL-PAYMENT-KEY-0123456789';
const PROJECT = 'test-owner.testnet/ntk';
const WEB = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../web');
const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const INFO_OUTPUT = { ok: true, ntk: '0.1.0', project: PROJECT, transport_pk: 'ab'.repeat(32), stamp_pk: 'ed25519:test' };

/**
 * A fake OutLayer: POST /call/<owner>/<name> starts a call, GET /calls/<id> answers pending, then completed.
 * One per network: its payment key, its project, and call ids counted from `first`.
 */
async function mockOutLayer({ key = KEY, project = PROJECT, first = 1 } = {}) {
  const info = { ...INFO_OUTPUT, project };
  const mock = {
    requests: [],
    calls: new Map(),
    next: first,
    polls: 0,
    postStatus: 200,
    postHeaders: {},
    postBody: null,
    pendingPolls: 1,
    output: (input) => JSON.stringify(input.operation === 'info' ? info : { ok: true, op: input.operation }),
  };
  mock.server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      mock.requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      const json = (status, obj, headers = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
      };
      if (req.headers['x-payment-key'] !== key) return json(401, { error: 'invalid payment key' });
      if (req.method === 'POST' && req.url === `/call/${project}`) {
        if (mock.postStatus !== 200) return json(mock.postStatus, mock.postBody ?? { error: 'nope' }, mock.postHeaders);
        const { input, async } = JSON.parse(body);
        const id = UUID(mock.next++);
        mock.calls.set(id, { input, async, polls: 0 });
        return json(200, { call_id: id, status: 'pending', poll_url: `/calls/${id}`, attestation_url: `/attestations/by-call/${id}` });
      }
      const m = /^\/calls\/(.+)$/.exec(req.url);
      if (req.method === 'GET' && m) {
        mock.polls++;
        const call = mock.calls.get(m[1]);
        if (!call) return json(404, { error: 'call_not_found' });
        call.polls++;
        if (call.polls <= mock.pendingPolls) return json(200, { call_id: m[1], status: 'pending' });
        return json(200, { call_id: m[1], status: 'completed', output: mock.output(call.input), time_ms: 12, compute_cost: '1000' });
      }
      json(404, { error: 'not found' });
    });
  });
  await new Promise((r) => mock.server.listen(0, '127.0.0.1', r));
  mock.url = `http://127.0.0.1:${mock.server.address().port}`;
  return mock;
}

function config(api, over = {}) {
  return {
    api, project: PROJECT, paymentKey: KEY, port: 0, host: '127.0.0.1', staticDir: null,
    keepWarmSec: 0, infoTtlSec: 600, infoWaitSec: 5, callTtlSec: 1800, pollIntervalMs: 5, pollTimeoutMs: 5000,
    prefetchInfo: false,
    limits: { ipPerMin: 100, ipPerDay: 1000, accountPerMin: 100, accountPerDay: 1000, pollPerMin: 1000, globalPerMin: 1000 },
    ...over,
    limits: { ipPerMin: 100, ipPerDay: 1000, accountPerMin: 100, accountPerDay: 1000, pollPerMin: 1000, globalPerMin: 1000, ...over.limits },
  };
}

/** Start a mock OutLayer and a relay in front of it. */
async function setup(over = {}) {
  const mock = await mockOutLayer();
  const logs = [];
  const relay = createRelay(config(mock.url, over), { log: (l) => logs.push(l) });
  const addr = await relay.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${addr.port}`;
  const done = async () => { await relay.close(); await new Promise((r) => mock.server.close(r)); };
  return { mock, relay, base, logs, done };
}

const post = (base, body, headers = {}) => fetch(`${base}/api/call`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const stampInput = (account = 'alice.testnet') => ({
  operation: 'stamp',
  auth: { account_id: account, public_key: 'ed25519:x', signature: 'c2ln', nonce: 'bm9uY2U=', message: '{}', recipient: 'near-the-keyboard' },
  sealed: { epk: 'aa', nonce: 'bb', ct: 'SECRET-CIPHERTEXT-SHOULD-NOT-BE-LOGGED' },
});
const settle = () => new Promise((r) => setTimeout(r, 30)); // let 'close' log lines land

test('POST /api/call forwards {input, async: true} with the payment key and answers {call_id}', async () => {
  const t = await setup();
  try {
    const input = stampInput();
    const res = await post(t.base, { input, async: false, resource_limits: { max_instructions: 1 } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    const body = await res.json();
    assert.deepEqual(Object.keys(body), ['call_id']);
    assert.equal(body.call_id, UUID(1));
    const [req] = t.mock.requests;
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/call/test-owner.testnet/ntk');
    assert.equal(req.headers['x-payment-key'], KEY);
    assert.deepEqual(JSON.parse(req.body), { input, async: true }, 'input unchanged, nothing else forwarded');
  } finally { await t.done(); }
});

test('GET /api/calls/<id> passes OutLayer\'s call object through unchanged', async () => {
  const t = await setup({ });
  try {
    const { call_id } = await (await post(t.base, { input: { operation: 'info' } })).json();
    const first = await fetch(`${t.base}/api/calls/${call_id}`);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { call_id, status: 'pending' });
    const second = await (await fetch(`${t.base}/api/calls/${call_id}`)).json();
    assert.equal(second.status, 'completed');
    assert.equal(second.output, JSON.stringify(INFO_OUTPUT), 'output stays a string, as OutLayer sent it');
    assert.equal(second.compute_cost, '1000');
    const polls = t.mock.requests.filter((r) => r.method === 'GET');
    assert.ok(polls.every((r) => r.headers['x-payment-key'] === KEY));
  } finally { await t.done(); }
});

test('polls only for calls this relay started; ids must be UUIDs', async () => {
  const t = await setup();
  try {
    const unknown = await fetch(`${t.base}/api/calls/${UUID(999)}`);
    assert.equal(unknown.status, 404);
    assert.match((await unknown.json()).error, /did not start/);
    assert.equal((await fetch(`${t.base}/api/calls/not-a-uuid`)).status, 400);
    assert.equal((await fetch(`${t.base}/api/calls/..%2f..%2fsecret`)).status, 400);
    assert.equal(t.mock.polls, 0, 'OutLayer was not asked');
  } finally { await t.done(); }
});

test('only the five operations; other operations and bad bodies are refused before OutLayer', async () => {
  const t = await setup();
  try {
    const cases = [
      [{ input: { operation: 'deploy' } }, /operation must be one of info, enroll, stamp, status, forget/],
      [{ input: { operation: 'stamp' } }, /auth\.account_id/],
      [{ input: { operation: 'status', auth: { account_id: 'Not An Account' } } }, /auth\.account_id/],
      [{ input: 'info' }, /input must be an object/],
      [{ nothing: true }, /input must be an object/],
      ['{not json', /must be JSON/],
    ];
    for (const [body, error] of cases) {
      const res = await post(t.base, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match((await res.json()).error, error);
    }
    for (const op of ['info', 'enroll', 'stamp', 'status', 'forget']) {
      const input = op === 'info' ? { operation: op } : { ...stampInput(), operation: op };
      assert.equal((await post(t.base, { input })).status, 200, op);
    }
    assert.equal(t.mock.calls.size, 5);
    assert.equal((await fetch(`${t.base}/api/call`)).status, 405);
    assert.equal((await fetch(`${t.base}/api/nothing`)).status, 404);
  } finally { await t.done(); }
});

test('a body over 1 MB is refused with 413', async () => {
  const t = await setup();
  try {
    const big = JSON.stringify({ input: { ...stampInput(), sealed: { epk: 'a', nonce: 'b', ct: 'x'.repeat(MAX_BODY) } } });
    const res = await post(t.base, big);
    assert.equal(res.status, 413);
    assert.equal(t.mock.calls.size, 0);
    const fits = JSON.stringify({ input: { ...stampInput(), sealed: { epk: 'a', nonce: 'b', ct: 'x'.repeat(MAX_BODY - 1000) } } });
    assert.equal((await post(t.base, fits)).status, 200);
  } finally { await t.done(); }
});

test('rate limits: per IP, per account, overall; with Retry-After', async () => {
  const t = await setup({ limits: { ipPerMin: 3, accountPerMin: 2, globalPerMin: 1000 } });
  try {
    assert.equal((await post(t.base, { input: stampInput('alice.testnet') })).status, 200);
    assert.equal((await post(t.base, { input: stampInput('alice.testnet') })).status, 200);
    const third = await post(t.base, { input: stampInput('alice.testnet') });
    assert.equal(third.status, 429, 'per account (this request still used the IP\'s third slot)');
    assert.ok(Number(third.headers.get('retry-after')) > 0);
    assert.equal((await post(t.base, { input: stampInput('bob.testnet') })).status, 429, 'per IP: 3 used');
    // Behind nginx, X-Real-IP from a loopback peer names the client.
    assert.equal((await post(t.base, { input: stampInput('bob.testnet') }, { 'X-Real-IP': '203.0.113.9' })).status, 200);
  } finally { await t.done(); }
  const g = await setup({ limits: { globalPerMin: 2 } });
  try {
    assert.equal((await post(g.base, { input: { operation: 'info' } }, { 'X-Real-IP': '198.51.100.1' })).status, 200);
    assert.equal((await post(g.base, { input: { operation: 'info' } }, { 'X-Real-IP': '198.51.100.2' })).status, 200);
    assert.equal((await post(g.base, { input: { operation: 'info' } }, { 'X-Real-IP': '198.51.100.3' })).status, 429, 'overall');
  } finally { await g.done(); }
});

test('OutLayer errors: busy is passed on with Retry-After, others become 502 without the key', async () => {
  const t = await setup();
  try {
    t.mock.postStatus = 503;
    t.mock.postHeaders = { 'Retry-After': '7' };
    const busy = await post(t.base, { input: { operation: 'info' } });
    assert.equal(busy.status, 503);
    assert.equal(busy.headers.get('retry-after'), '7');
    t.mock.postStatus = 402;
    t.mock.postBody = { error: `insufficient balance on ${KEY}` };
    const broke = await post(t.base, { input: { operation: 'info' } });
    assert.equal(broke.status, 502);
    const text = await broke.text();
    assert.ok(!text.includes(KEY), 'the payment key is scrubbed');
    assert.match(text, /insufficient balance on <payment key>/);
  } finally { await t.done(); }
  const down = await setup();
  await new Promise((r) => down.mock.server.close(r));
  try {
    const res = await post(down.base, { input: { operation: 'info' } });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /did not answer/);
  } finally { await down.relay.close(); }
});

test('GET /api/info: fetched once through an async call, then served from the cache', async () => {
  const t = await setup();
  try {
    const res = await fetch(`${t.base}/api/info`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.output, INFO_OUTPUT, 'the output string is parsed');
    assert.ok(Math.abs(body.at - Date.now()) < 5000);
    const posts = t.mock.requests.filter((r) => r.method === 'POST');
    assert.equal(posts.length, 1);
    assert.deepEqual(JSON.parse(posts[0].body), { input: { operation: 'info' }, async: true });
    const again = await (await fetch(`${t.base}/api/info`)).json();
    assert.deepEqual(again, body);
    assert.equal(t.mock.requests.filter((r) => r.method === 'POST').length, 1, 'cached');
  } finally { await t.done(); }
});

test('GET /api/info: a stale cache is served while it refreshes; no cache and no answer gives 503', async () => {
  const t = await setup({ infoTtlSec: 0 });
  try {
    const a = await (await fetch(`${t.base}/api/info`)).json();
    t.relay.state.lastInfoAttempt = 0;
    const b = await (await fetch(`${t.base}/api/info`)).json();
    assert.deepEqual(b, a, 'stale value served at once');
    await t.relay.state.infoInflight;
    assert.ok(t.relay.state.info.at >= a.at);
    assert.equal(t.mock.requests.filter((r) => r.method === 'POST').length, 2, 'refreshed in the background');
  } finally { await t.done(); }
  const slow = await setup({ infoWaitSec: 0.05 });
  try {
    slow.mock.pendingPolls = 1e9; // never completes
    const res = await fetch(`${slow.base}/api/info`);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '10');
  } finally { await slow.done(); }
});

test('keep-warm calls info on a timer; prefetch fills the cache at start', async () => {
  const t = await setup({ keepWarmSec: 0.05, prefetchInfo: true });
  try {
    await new Promise((r) => setTimeout(r, 400));
    const infoPosts = t.mock.requests.filter((r) => r.method === 'POST').length;
    assert.ok(infoPosts >= 2, `info called ${infoPosts} times`);
    assert.ok(t.relay.state.info);
  } finally { await t.done(); }
});

test('CORS preflight', async () => {
  const t = await setup();
  try {
    const res = await fetch(`${t.base}/api/call`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.match(res.headers.get('access-control-allow-methods'), /POST/);
    assert.match(res.headers.get('access-control-allow-headers'), /Content-Type/i);
  } finally { await t.done(); }
});

test('logs: method, path, op, account, status, duration; never bodies or keys', async () => {
  const t = await setup();
  try {
    const { call_id } = await (await post(t.base, { input: stampInput('alice.testnet') })).json();
    await fetch(`${t.base}/api/calls/${call_id}`);
    await post(t.base, { input: { operation: 'nope' } });
    await settle();
    const line = t.logs.find((l) => l.includes('POST /api/call op=stamp'));
    assert.match(line, /POST \/api\/call op=stamp account=alice\.testnet 200 \d+ms/);
    assert.ok(t.logs.some((l) => l.includes(`GET /api/calls/${call_id} op=- account=- 200`)));
    assert.ok(t.logs.some((l) => /POST \/api\/call op=- account=- 400/.test(l)));
    const all = t.logs.join('\n');
    assert.ok(!all.includes(KEY), 'no payment key');
    assert.ok(!all.includes('SECRET-CIPHERTEXT'), 'no body');
    assert.ok(!all.includes('127.0.0.1'), 'no IP addresses');
  } finally { await t.done(); }
});

test('static files for local development: the same routes as nginx', async () => {
  const t = await setup({ staticDir: WEB });
  try {
    const get = (p) => fetch(`${t.base}${p}`, { redirect: 'manual' });
    const index = await get('/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);
    assert.equal(index.headers.get('content-security-policy'), SECURITY_HEADERS['Content-Security-Policy']);
    const page = await index.text();
    const stamp = await get('/e65ee28db5');
    assert.equal(stamp.status, 200);
    assert.equal(await stamp.text(), page, '/<id> serves the verify page');
    assert.equal((await get('/E65EE28DB5')).status, 404);
    const feed = await get('/feed');
    assert.equal(feed.status, 301);
    assert.equal(feed.headers.get('location'), '/feed/');
    assert.match(await (await get('/feed/')).text(), /<title>Post/);
    assert.match((await get('/embed/ntk-embed.js')).headers.get('content-type'), /javascript/);
    assert.equal((await get('/test/embed.test.mjs')).status, 404, 'tests are not served');
    assert.equal((await get('/nope.js')).status, 404);
    const raw = await new Promise((resolve) => {
      http.get(`${t.base}/%2e%2e/relay/server.mjs`, (res) => { res.resume(); resolve(res.statusCode); });
    });
    assert.equal(raw, 404, 'no path traversal');
    assert.equal((await fetch(`${t.base}/`, { method: 'POST' })).status, 404);
  } finally { await t.done(); }
});

test('rateLimiter: fixed windows, 0 means no limit, sweep drops old windows', () => {
  let now = 0;
  const l = rateLimiter(() => now);
  assert.ok(l.hit('a', 2, 1000).ok);
  assert.ok(l.hit('a', 2, 1000).ok);
  const third = l.hit('a', 2, 1000);
  assert.equal(third.ok, false);
  assert.equal(third.retryAfter, 1);
  assert.ok(l.hit('b', 0, 1000).ok);
  now = 1000;
  assert.ok(l.hit('a', 2, 1000).ok, 'a new window');
  now = 5000;
  l.sweep();
  assert.equal(l.size, 0);
});

test('configuration: env file, real environment wins, required names', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntk-relay-'));
  try {
    const file = path.join(dir, 'test.env');
    fs.writeFileSync(file, `# comment\nNTK_API=https://api.example/\nexport NTK_PROJECT="me.testnet/ntk"\nNTK_PAYMENT_KEY='k:1:abc' \nPORT=4000 # inline comment\n`);
    const c = loadConfig({ NTK_ENV_FILE: file, PORT: '5000', KEEP_WARM_SEC: '300' });
    assert.equal(c.api, 'https://api.example');
    assert.equal(c.project, 'me.testnet/ntk');
    assert.equal(c.paymentKey, 'k:1:abc');
    assert.equal(c.port, 5000, 'the environment wins over the file');
    assert.equal(c.host, '127.0.0.1');
    assert.equal(c.keepWarmSec, 300);
    assert.equal(c.staticDir, null);
    assert.deepEqual(parseEnvFile('A=1\n B = two \nexport C="3 4"\nbad line\n#D=5'), { A: '1', B: 'two', C: '3 4' });
    assert.throws(() => loadConfig({}), /missing NTK_API, NTK_PROJECT, NTK_PAYMENT_KEY/);
    assert.throws(() => loadConfig({ NTK_ENV_FILE: path.join(dir, 'none.env') }), /cannot read/);
    assert.throws(() => loadConfig({ NTK_API: 'ftp://x', NTK_PROJECT: 'a/b', NTK_PAYMENT_KEY: 'k' }), /NTK_API/);
    assert.throws(() => loadConfig({ NTK_API: 'https://x', NTK_PROJECT: 'a/b', NTK_PAYMENT_KEY: 'k', STATIC_DIR: dir }), /index\.html/);
    assert.throws(() => loadConfig({ NTK_API: 'https://x', NTK_PROJECT: 'a/b', NTK_PAYMENT_KEY: 'k', PORT: 'abc' }), /PORT/);
    assert.equal(loadConfig({ NTK_API: 'https://x', NTK_PROJECT: 'a/b', NTK_PAYMENT_KEY: 'k', STATIC_DIR: WEB }).staticDir, WEB);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- mainnet: /api/mainnet/, a second OutLayer project with its own payment key ----

const MAIN_KEY = 'test-owner.near:1:THIS-IS-NOT-A-REAL-MAINNET-PAYMENT-KEY-9876543210';
const MAIN_PROJECT = 'test-owner.near/ntk';

/** A relay in front of two mock OutLayers: testnet (t.mock) and mainnet (t.main, call ids from 1001). */
async function setupBoth(over = {}) {
  const main = await mockOutLayer({ key: MAIN_KEY, project: MAIN_PROJECT, first: 1001 });
  const t = await setup({ ...over, mainnet: { api: main.url, project: MAIN_PROJECT, paymentKey: MAIN_KEY } });
  return { ...t, main, done: async () => { await t.done(); await new Promise((r) => main.server.close(r)); } };
}
const postMain = (base, body, headers = {}) => fetch(`${base}/api/mainnet/call`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('mainnet not set up: every /api/mainnet/ endpoint answers 503 {"error":"mainnet is not set up"}; testnet as before', async () => {
  const t = await setup();
  try {
    const cases = [
      ['POST', '/api/mainnet/call', JSON.stringify({ input: { operation: 'info' } })],
      ['GET', `/api/mainnet/calls/${UUID(1)}`],
      ['GET', '/api/mainnet/info'],
      ['GET', '/api/mainnet/call'],
    ];
    for (const [method, p, body] of cases) {
      const res = await fetch(t.base + p, { method, body, headers: body ? { 'Content-Type': 'application/json' } : {} });
      assert.equal(res.status, 503, `${method} ${p}`);
      assert.equal(await res.text(), '{"error":"mainnet is not set up"}');
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
    }
    assert.equal((await fetch(`${t.base}/api/mainnet/call`, { method: 'OPTIONS' })).status, 204, 'CORS preflight');
    assert.equal((await fetch(`${t.base}/api/mainnet/nothing`)).status, 404);
    assert.equal((await fetch(`${t.base}/api/mainnet`)).status, 404);
    assert.equal(t.mock.requests.length, 0, 'nothing reached OutLayer');
    assert.equal(t.relay.networks.mainnet, null);
    const { call_id } = await (await post(t.base, { input: { operation: 'info' } })).json();
    assert.equal((await fetch(`${t.base}/api/calls/${call_id}`)).status, 200, 'testnet works as before');
  } finally { await t.done(); }
});

test('mainnet: forwarded to its own OutLayer with its project and payment key; calls are kept per network', async () => {
  const t = await setupBoth();
  try {
    const input = stampInput('alice.near');
    const res = await postMain(t.base, { input });
    assert.equal(res.status, 200);
    const { call_id: mainCall } = await res.json();
    assert.equal(mainCall, UUID(1001));
    const [req] = t.main.requests;
    assert.equal(req.url, `/call/${MAIN_PROJECT}`);
    assert.equal(req.headers['x-payment-key'], MAIN_KEY);
    assert.deepEqual(JSON.parse(req.body), { input, async: true });
    assert.equal(t.mock.requests.length, 0, 'testnet\'s OutLayer was not asked');

    const first = await fetch(`${t.base}/api/mainnet/calls/${mainCall}`);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { call_id: mainCall, status: 'pending' });
    assert.equal((await (await fetch(`${t.base}/api/mainnet/calls/${mainCall}`)).json()).status, 'completed');

    const { call_id: testCall } = await (await post(t.base, { input: stampInput('alice.testnet') })).json();
    assert.equal(testCall, UUID(1));
    assert.equal(t.mock.requests[0].headers['x-payment-key'], KEY, 'testnet keeps its own key');
    assert.equal((await fetch(`${t.base}/api/calls/${mainCall}`)).status, 404, 'a mainnet call is not polled through testnet');
    assert.equal((await fetch(`${t.base}/api/mainnet/calls/${testCall}`)).status, 404, 'nor a testnet call through mainnet');
    assert.equal((await fetch(`${t.base}/api/calls/${testCall}`)).status, 200);
    assert.equal(t.mock.requests.filter((r) => r.method === 'GET').length, 1, 'only the valid poll reached testnet');
    assert.equal((await fetch(`${t.base}/api/mainnet/calls/not-a-uuid`)).status, 400);
    assert.equal((await fetch(`${t.base}/api/mainnet/call`)).status, 405);
  } finally { await t.done(); }
});

test('mainnet: its own info cache', async () => {
  const t = await setupBoth();
  try {
    const main = await (await fetch(`${t.base}/api/mainnet/info`)).json();
    assert.equal(main.output.project, MAIN_PROJECT);
    assert.equal((await (await fetch(`${t.base}/api/mainnet/info`)).json()).at, main.at, 'cached');
    assert.equal(t.main.requests.filter((r) => r.method === 'POST').length, 1);
    assert.equal(t.mock.requests.length, 0, 'testnet\'s info was not fetched');
    const test_ = await (await fetch(`${t.base}/api/info`)).json();
    assert.equal(test_.output.project, PROJECT);
    assert.notEqual(t.relay.networks.mainnet.state, t.relay.networks.testnet.state);
    assert.equal(t.relay.state, t.relay.networks.testnet.state, 'relay.state is testnet\'s, as before');
  } finally { await t.done(); }
});

test('mainnet: rate limits are counted per network', async () => {
  const t = await setupBoth({ limits: { ipPerMin: 2, accountPerMin: 1000, globalPerMin: 1000 } });
  try {
    assert.equal((await post(t.base, { input: { operation: 'info' } })).status, 200);
    assert.equal((await post(t.base, { input: { operation: 'info' } })).status, 200);
    assert.equal((await post(t.base, { input: { operation: 'info' } })).status, 429, 'testnet: the IP used its 2');
    assert.equal((await postMain(t.base, { input: { operation: 'info' } })).status, 200, 'mainnet counts on its own');
    assert.equal((await postMain(t.base, { input: { operation: 'info' } })).status, 200);
    assert.equal((await postMain(t.base, { input: { operation: 'info' } })).status, 429);
  } finally { await t.done(); }
  const g = await setupBoth({ limits: { globalPerMin: 1 } });
  try {
    assert.equal((await postMain(g.base, { input: { operation: 'info' } })).status, 200);
    assert.equal((await postMain(g.base, { input: { operation: 'info' } }, { 'X-Real-IP': '198.51.100.7' })).status, 429, 'mainnet overall');
    assert.equal((await post(g.base, { input: { operation: 'info' } })).status, 200, 'testnet overall is separate');
  } finally { await g.done(); }
});

test('mainnet: errors are scrubbed of its payment key; logs name the path, never a key', async () => {
  const t = await setupBoth();
  try {
    t.main.postStatus = 402;
    t.main.postBody = { error: `insufficient balance on ${MAIN_KEY}` };
    const broke = await postMain(t.base, { input: stampInput('alice.near') });
    assert.equal(broke.status, 502);
    const text = await broke.text();
    assert.ok(!text.includes(MAIN_KEY));
    assert.match(text, /insufficient balance on <payment key>/);
    await settle();
    assert.ok(t.logs.some((l) => /POST \/api\/mainnet\/call op=stamp account=alice\.near 502 \d+ms upstream=402/.test(l)));
    const all = t.logs.join('\n');
    assert.ok(!all.includes(MAIN_KEY) && !all.includes(KEY), 'no payment key');
    assert.ok(!all.includes('SECRET-CIPHERTEXT'), 'no body');
  } finally { await t.done(); }
});

test('mainnet: prefetched at start like testnet, but never kept warm', async () => {
  const t = await setupBoth({ keepWarmSec: 0.05, prefetchInfo: true });
  try {
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(t.mock.requests.filter((r) => r.method === 'POST').length >= 2, 'testnet: prefetch and keep-warm');
    assert.equal(t.main.requests.filter((r) => r.method === 'POST').length, 1, 'mainnet: the prefetch only');
    assert.ok(t.relay.networks.mainnet.state.info);
    assert.ok(t.logs.some((l) => /mainnet info refreshed by call/.test(l)));
  } finally { await t.done(); }
});

test('configuration: mainnet is optional, all three settings or none; a mistake keeps it off and never stops testnet', () => {
  const testnet = { NTK_API: 'https://testnet-api.example', NTK_PROJECT: 'me.testnet/ntk', NTK_PAYMENT_KEY: 'k:1:abc' };
  const mainnet = { NTK_MAINNET_API: 'https://api.example/', NTK_MAINNET_PROJECT: 'me.near/ntk', NTK_MAINNET_PAYMENT_KEY: 'm:1:secret-mainnet' };
  assert.deepEqual([loadConfig(testnet).mainnet, loadConfig(testnet).mainnetProblem], [null, null]);
  assert.deepEqual(loadConfig({ ...testnet, ...mainnet }).mainnet, { api: 'https://api.example', project: 'me.near/ntk', paymentKey: 'm:1:secret-mainnet' });
  const partial = loadConfig({ ...testnet, ...mainnet, NTK_MAINNET_PROJECT: '' });
  assert.deepEqual([partial.mainnet, partial.mainnetProblem], [null, 'missing NTK_MAINNET_PROJECT']);
  assert.equal(partial.paymentKey, 'k:1:abc', 'testnet is set up all the same');
  assert.deepEqual(mainnetConfig({ ...mainnet, NTK_MAINNET_API: 'ftp://x' }), { mainnet: null, problem: 'NTK_MAINNET_API must be an http(s) URL' });
  assert.deepEqual(mainnetConfig({ ...mainnet, NTK_MAINNET_PROJECT: 'ntk' }), { mainnet: null, problem: 'NTK_MAINNET_PROJECT must look like <owner>/<name>' });
  assert.deepEqual(mainnetConfig({ NTK_MAINNET_PAYMENT_KEY: 'm:1:secret-mainnet' }).problem, 'missing NTK_MAINNET_API, NTK_MAINNET_PROJECT');
  assert.throws(() => loadConfig(mainnet), /missing NTK_API, NTK_PROJECT, NTK_PAYMENT_KEY/, 'mainnet alone is not enough');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntk-relay-'));
  try {
    const file = path.join(dir, 'both.env');
    fs.writeFileSync(file, `${Object.entries({ ...testnet, ...mainnet }).map(([k, v]) => `${k}=${v}`).join('\n')}\n`);
    const c = loadConfig({ NTK_ENV_FILE: file, NTK_MAINNET_PROJECT: 'other.near/ntk' });
    assert.deepEqual(c.mainnet, { api: 'https://api.example', project: 'other.near/ntk', paymentKey: 'm:1:secret-mainnet' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

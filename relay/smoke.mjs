#!/usr/bin/env node
// Live smoke test of a running relay and the site it serves. Costs one enclave
// call (two when the relay's info cache is still empty). Calls can take minutes.
//
//   node relay/smoke.mjs [base]          default http://127.0.0.1:3970
//   node relay/smoke.mjs https://ntk.tools
//
// Checks: the pages answer; GET /api/info gives the pinned keys; POST /api/call
// {"input": {"operation": "info"}} gives a call_id, polled until it completes.
// Exit code 0 when every check passes.
import { NTK } from '../web/lib/ntk-verify.js';

const TRANSPORT_PK = '4443a5935e077902ff3afc6a4d188c53168b8ec9bd9b0b847b4d1006ab95b729'; // docs/protocol.md
const base = (process.argv[2] || 'http://127.0.0.1:3970').replace(/\/+$/, '');
const WAIT_MS = 8 * 60_000;
const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
};
const parse = (out) => { if (typeof out !== 'string') return out; try { return JSON.parse(out); } catch { return out; } };

for (const p of ['/', '/e65ee28db5', '/feed/', '/embed/ntk-embed.js']) {
  const res = await fetch(base + p);
  check(res.status === 200, `GET ${p} -> ${res.status} ${res.headers.get('content-type')}`);
}

// The relay answers 503 while it fetches info from the enclave for the first time.
let info = null;
for (;;) {
  const res = await fetch(`${base}/api/info`);
  if (res.status === 200) { info = await res.json(); break; }
  const text = await res.text();
  if (res.status !== 503 || Date.now() - t0 > WAIT_MS) { check(false, `GET /api/info -> ${res.status} ${text.slice(0, 200)}`); break; }
  console.log(`      GET /api/info -> 503, the relay is still fetching it (${elapsed()})`);
  await sleep(10_000);
}
if (info) {
  const o = info.output || {};
  check(o.ok === true && o.stamp_pk === NTK.stampPk && o.transport_pk === TRANSPORT_PK,
    `GET /api/info -> pinned keys, project ${o.project}, cached at ${new Date(info.at).toISOString()} (${elapsed()})`);
}

const res = await fetch(`${base}/api/call`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: { operation: 'info' } }),
});
const started = await res.json().catch(() => ({}));
check(res.status === 200 && typeof started.call_id === 'string', `POST /api/call info -> ${res.status} ${JSON.stringify(started)} (${elapsed()})`);

if (started.call_id) {
  const t1 = Date.now();
  let last = '';
  let call = null;
  while (Date.now() - t1 < WAIT_MS) {
    await sleep(2000);
    const r = await fetch(`${base}/api/calls/${started.call_id}`);
    if (r.status !== 200) { console.log(`      GET /api/calls/<id> -> ${r.status}`); continue; }
    call = await r.json();
    if (call.status !== last) console.log(`      call ${started.call_id}: ${call.status} after ${((Date.now() - t1) / 1000).toFixed(0)}s`);
    last = call.status;
    if (call.status === 'completed' || call.status === 'failed') break;
  }
  const out = call && parse(call.output);
  check(call?.status === 'completed' && out?.ok === true && out.stamp_pk === NTK.stampPk,
    `GET /api/calls/<id> -> ${call?.status ?? 'no answer'} in ${((Date.now() - t1) / 1000).toFixed(0)}s` +
    `${call?.time_ms != null ? `, enclave time ${call.time_ms} ms` : ''}`);
}

console.log(failures ? `\n${failures} check(s) failed (${elapsed()})` : `\nall checks passed (${elapsed()})`);
process.exit(failures ? 1 : 0);

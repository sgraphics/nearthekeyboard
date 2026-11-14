#!/usr/bin/env node
// Live smoke test of a running relay and the site it serves. Costs one enclave
// call (two when the relay's info cache is still empty). Calls can take minutes.
//
//   node relay/smoke.mjs [base] [--network testnet|mainnet]   default http://127.0.0.1:3970, testnet
//   node relay/smoke.mjs https://ntk.tools
//   node relay/smoke.mjs https://ntk.tools --network mainnet  (/api/mainnet/; a mainnet call costs real NEAR)
//
// Checks: the pages answer; GET <relay>/info gives the network's pinned keys
// (web/lib/networks.js), its project and its network; POST <relay>/call
// {"input": {"operation": "info"}} gives a call_id, polled until it completes.
// While a network's keys are not pinned yet, it prints the keys its enclave
// reports, to be pinned. Exit code 0 when every check passes.
import { NETWORKS, isAvailable } from '../web/lib/networks.js';

const args = process.argv.slice(2);
const at = args.indexOf('--network');
const network = at >= 0 ? args[at + 1] : 'testnet';
if (!Object.hasOwn(NETWORKS, network)) {
  console.error(`--network must be one of ${Object.keys(NETWORKS).join(', ')}`);
  process.exit(2);
}
const NET = NETWORKS[network];
const pinned = isAvailable(NET);
const base = (args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--network')[0] || 'http://127.0.0.1:3970').replace(/\/+$/, '');
const relay = `${base}/api${network === 'testnet' ? '' : `/${network}`}`;
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
const keysOk = (o) => (pinned ? o.stamp_pk === NET.stampPk && o.transport_pk === NET.transportPk : typeof o.stamp_pk === 'string');

console.log(`${network}: relay ${relay}, project ${NET.project}${pinned ? '' : ' (keys not pinned yet)'}`);
for (const p of ['/', '/e65ee28db5', '/feed/', '/embed/ntk-embed.js']) {
  const res = await fetch(base + p);
  check(res.status === 200, `GET ${p} -> ${res.status} ${res.headers.get('content-type')}`);
}

// The relay answers 503 while it fetches info from the enclave for the first time
// (and, for mainnet, when it is not set up for mainnet at all).
let info = null;
for (;;) {
  const res = await fetch(`${relay}/info`);
  if (res.status === 200) { info = await res.json(); break; }
  const text = await res.text();
  if (res.status !== 503 || /not set up/.test(text) || Date.now() - t0 > WAIT_MS) {
    check(false, `GET ${relay}/info -> ${res.status} ${text.slice(0, 200)}`);
    break;
  }
  console.log(`      GET ${relay}/info -> 503, the relay is still fetching it (${elapsed()})`);
  await sleep(10_000);
}
if (info) {
  const o = info.output || {};
  check(o.ok === true && keysOk(o) && o.project === NET.project && o.network === network,
    `GET ${relay}/info -> ${pinned ? 'pinned keys' : 'keys'}, project ${o.project}, network ${o.network}, ` +
    `cached at ${new Date(info.at).toISOString()} (${elapsed()})`);
  if (!pinned && o.ok === true) {
    console.log(`      to pin in web/lib/networks.js (NETWORKS.${network}):\n        stampPk: '${o.stamp_pk}',\n        transportPk: '${o.transport_pk}',`);
  }
}

const res = await fetch(`${relay}/call`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: { operation: 'info' } }),
});
const started = await res.json().catch(() => ({}));
check(res.status === 200 && typeof started.call_id === 'string', `POST ${relay}/call info -> ${res.status} ${JSON.stringify(started)} (${elapsed()})`);

if (started.call_id) {
  const t1 = Date.now();
  let last = '';
  let call = null;
  while (Date.now() - t1 < WAIT_MS) {
    await sleep(2000);
    const r = await fetch(`${relay}/calls/${started.call_id}`);
    if (r.status !== 200) { console.log(`      GET ${relay}/calls/<id> -> ${r.status}`); continue; }
    call = await r.json();
    if (call.status !== last) console.log(`      call ${started.call_id}: ${call.status} after ${((Date.now() - t1) / 1000).toFixed(0)}s`);
    last = call.status;
    if (call.status === 'completed' || call.status === 'failed') break;
  }
  const out = call && parse(call.output);
  check(call?.status === 'completed' && out?.ok === true && keysOk(out),
    `GET ${relay}/calls/<id> -> ${call?.status ?? 'no answer'} in ${((Date.now() - t1) / 1000).toFixed(0)}s` +
    `${call?.time_ms != null ? `, enclave time ${call.time_ms} ms` : ''}`);
}

console.log(failures ? `\n${failures} check(s) failed (${elapsed()})` : `\nall checks passed (${elapsed()})`);
process.exit(failures ? 1 : 0);

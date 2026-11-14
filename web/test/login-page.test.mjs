// The wallet login page (web/login/) as files: the markup the script needs, the
// nonce placeholder that nginx fills in, a CSP that lets in exactly what the
// pinned wallets use, and a committed bundle that is the build of its sources.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WALLET_MANIFEST } from '../login/src/wallets.js';
import { NTK_LOGIN, loginPins } from '../login/src/model.js';
import { NETWORKS } from '../lib/networks.js';

// Meteor's executor talks to its own RPC on each network (NEAR_BASE_CONNECT_CONFIG_* in
// meteor-near-connect-latest.js, read 2026-11-14): test.rpc.fastnear.com, free.rpc.fastnear.com.
const METEOR_RPC = { testnet: 'https://test.rpc.fastnear.com', mainnet: 'https://free.rpc.fastnear.com' };

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const HTML = read('../login/index.html');
const MAIN = read('../login/src/main.js');
const CONF = read('../../deploy/nginx/ntk.conf');
const LOGIN_BLOCK = CONF.slice(CONF.indexOf('location /login/ {'), CONF.indexOf('}', CONF.indexOf('location /login/ {')));
const CSP = Object.fromEntries(/add_header Content-Security-Policy "([^"]*)"/.exec(LOGIN_BLOCK)[1]
  .split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));

test('the page loads one classic, deferred script with the nonce placeholder nginx replaces', () => {
  const scripts = [...HTML.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(scripts, ['<script src="/login/bundle.js" nonce="NTK_CSP_NONCE" defer>']);
  assert.equal(HTML.split('NTK_CSP_NONCE').length, 2, 'the placeholder appears once (sub_filter_once)');
  assert.ok(LOGIN_BLOCK.includes("sub_filter 'NTK_CSP_NONCE' '$request_id';"));
  assert.doesNotMatch(HTML, /\sstyle=|<style|\son[a-z]+=/i, 'no inline styles or handlers');
  assert.match(HTML, /<meta name="robots" content="noindex">/);
  assert.match(HTML, /<link rel="stylesheet" href="\/login\/login\.css">/);
});

test('every element the script looks up is in the page', () => {
  const ids = [...MAIN.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 10, `${ids.length} ids`);
  for (const id of new Set(ids)) assert.match(HTML, new RegExp(`\\sid="${id}"`), `#${id}`);
  for (const state of ['invalid', 'choose', 'connected', 'done', 'error', 'busy']) {
    assert.match(HTML, new RegExp(`data-show="[^"]*\\b${state}\\b`), `something shows in state ${state}`);
  }
});

test('the page names its network where the script can change it, and says testnet before it runs', () => {
  assert.match(HTML, /<span id="net-chip" class="chip chip-testnet" title="NEAR testnet only">TESTNET<\/span>/);
  const names = [...HTML.matchAll(/<span class="net-name">([^<]*)<\/span>/g)].map((m) => m[1]);
  const owners = [...HTML.matchAll(/<span class="net-owner">([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.ok(names.length >= 3 && names.every((n) => n === 'testnet'), `net-name: ${names}`);
  assert.deepEqual(owners, [NTK_LOGIN.receiverId]);
  assert.ok(MAIN.includes(".querySelectorAll('.net-name')") && MAIN.includes(".querySelectorAll('.net-owner')"));
  assert.ok(MAIN.includes("$('net-chip')"));
  // Every other mention of testnet is one of those, so a mainnet login never says testnet.
  const rest = HTML.replace(/<span class="net-name">testnet<\/span>/g, '').replace(/<span class="net-owner">[^<]*<\/span>/g, '')
    .replace(/<span id="net-chip"[^>]*>TESTNET<\/span>/, '');
  assert.doesNotMatch(rest, /testnet/i);
});

test("the page states what the wallet will do, in the brief's words", () => {
  const text = HTML.replace(/\s+/g, ' ');
  assert.ok(text.includes('Your wallet adds a key that can only sign NTK requests. It cannot move your funds. You can remove it any time in your wallet.'));
  assert.ok(text.includes('Only continue if you opened this page from the NTK app'));
});

test('the /login/ CSP lets in what the pinned wallets and the RPC need, and no more hosts', () => {
  const origin = (u) => new URL(u).origin;
  assert.ok(CSP['connect-src'].includes(NTK_LOGIN.rpc), 'the RPC that confirms the key');
  for (const n of Object.values(NETWORKS)) {
    assert.ok(CSP['connect-src'].includes(loginPins(n.network).rpc), `${n.network}: the RPC that confirms the key`);
    assert.ok(CSP['connect-src'].includes(METEOR_RPC[n.network]), `${n.network}: Meteor's own RPC`);
  }
  for (const w of WALLET_MANIFEST.wallets) {
    assert.ok(CSP['connect-src'].includes(origin(w.executor)), `${w.id}: its executor is fetched from ${origin(w.executor)}`);
    if (w.icon.startsWith('data:')) assert.ok(CSP['img-src'].includes('data:'), `${w.id} icon`);
    else assert.ok(CSP['img-src'].includes(origin(w.icon)), `${w.id} icon from ${origin(w.icon)}`);
    // open.nativeApp makes a hidden iframe with the app's own scheme.
    for (const scheme of w.permissions.allowsOpen.filter((u) => /^[a-z]+:\/\/$/.test(u) && !u.startsWith('http'))) {
      if (scheme.endsWith('dev://')) continue;
      assert.ok(CSP['frame-src'].includes(scheme.replace('//', '')), `${w.id}: frame-src ${scheme}`);
    }
  }
  const allowed = new Set([...Object.values(NETWORKS).map((n) => n.rpc), ...Object.values(METEOR_RPC),
    ...WALLET_MANIFEST.wallets.map((w) => origin(w.executor)),
    'wss://logout-bridge-service.intear.tech', 'https://mc.meteorwallet.app', 'wss://mc.meteorwallet.app']);
  for (const src of CSP['connect-src']) if (src !== "'self'") assert.ok(allowed.has(src), `connect-src ${src} is accounted for`);
});

test('package.json pins the connector and esbuild exactly', () => {
  const pkg = JSON.parse(read('../login/package.json'));
  for (const [name, version] of Object.entries(pkg.devDependencies)) assert.match(version, /^\d+\.\d+\.\d+$/, name);
  assert.equal(pkg.devDependencies['@hot-labs/near-connect'], '0.12.0');
  const lock = JSON.parse(read('../login/package-lock.json'));
  assert.equal(lock.packages['node_modules/@hot-labs/near-connect'].version, '0.12.0');
});

test('bundle.js is the build of web/login/src/ (when node_modules is installed)', async (t) => {
  const bundle = read('../login/bundle.js');
  assert.match(bundle, /^\/\* ntk\.tools\/login: built by web\/login\/build\.mjs/);
  assert.match(bundle, /@hot-labs\/near-connect 0\.12\.0, MIT License/);
  for (const s of ['nearthekeyboard.testnet', '100000000000000000000000', 'https://rpc.testnet.fastnear.com', 'meteor-wallet', 'intear-wallet',
    'nearthekeyboard.near', 'https://rpc.mainnet.fastnear.com']) {
    assert.ok(bundle.includes(s), `the bundle has ${s}`);
  }
  if (!fs.existsSync(new URL('../login/node_modules/esbuild/package.json', import.meta.url))) {
    return t.skip('web/login/node_modules is not installed (cd web/login && npm ci)');
  }
  const { build } = await import('../login/build.mjs');
  assert.equal(await build({ write: false }), bundle, 'run: cd web/login && node build.mjs');
});

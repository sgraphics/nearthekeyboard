// ntk.tools/donate (web/donate/): the page has every element its script uses, the
// nonce placeholder nginx fills, the busy dial, and the committed bundle is the
// one web/login/build.mjs makes from web/login/src/donate.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dialMarkup } from '../lib/dial.js';

const HTML = fs.readFileSync(new URL('../donate/index.html', import.meta.url), 'utf8');
const SCRIPT = fs.readFileSync(new URL('../login/src/donate.js', import.meta.url), 'utf8');
const bundleUrl = new URL('../donate/bundle.js', import.meta.url);

test('the page loads its bundle as a classic script with the nonce placeholder', () => {
  assert.match(HTML, /<script src="\/donate\/bundle.js" nonce="NTK_CSP_NONCE" defer><\/script>/);
  assert.match(HTML, /<link rel="stylesheet" href="\/donate\/donate.css">/);
  assert.ok(!/<script>/.test(HTML), 'no inline script');
});

test('every element the script looks up is on the page', () => {
  const ids = [...SCRIPT.matchAll(/\$\('([a-z-]+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 10);
  for (const id of new Set(ids)) assert.ok(HTML.includes(`id="${id}"`), `#${id}`);
  for (const cls of ['amount-text', 'donate-to']) assert.ok(HTML.includes(cls), `.${cls}`);
  for (const state of ['loading', 'busy', 'choose', 'connected', 'done', 'error']) {
    assert.ok(new RegExp(`data-show="[^"]*\\b${state}\\b`).test(HTML), `a part for "${state}"`);
  }
});

test('the busy dial is the one dialMarkup writes', () => {
  const dial = dialMarkup({ busy: true });
  const compact = (s) => s.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  assert.ok(compact(HTML).includes(compact(dial)), 'the dial markup');
});

test('the thank-you note and the receiving account', () => {
  assert.ok(HTML.includes('Thank you for your support.<br>— NTK Team'));
  assert.ok(HTML.includes('nearthekeyboard.near'));
});

test('the committed bundle is what build.mjs makes', async (t) => {
  const bundle = fs.readFileSync(bundleUrl, 'utf8');
  for (const s of ['nearthekeyboard.near', 'https://rpc.mainnet.fastnear.com', 'Transfer', 'meteor-wallet', 'intear-wallet']) {
    assert.ok(bundle.includes(s), `the bundle has ${s}`);
  }
  if (!fs.existsSync(new URL('../login/node_modules/esbuild/package.json', import.meta.url))) {
    return t.skip('web/login/node_modules is not installed (cd web/login && npm ci)');
  }
  const { build } = await import('../login/build.mjs');
  assert.equal(await build({ write: false, page: 'donate' }), bundle, 'run: cd web/login && node build.mjs');
});

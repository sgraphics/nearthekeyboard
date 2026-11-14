#!/usr/bin/env node
// Screenshots of every page at phone width (412 px, DevTools device emulation),
// light and dark, for checking the look by eye; console errors and CSP
// violations are listed with them. web/ is served here with the headers of
// deploy/nginx/ntk.conf. The verify pages read real stamps from OutLayer.
//
//   node web/test/shots.mjs [--out <dir>] [--only <name,name>]
//
// The login page's later states (connected, done, error) need a wallet, so they
// are shown by switching the page's state in the DOM, with sample text.
import path from 'node:path';
import os from 'node:os';
import { serveLocal, launchChrome, Cdp, openPage, sleep } from './login-check.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = path.resolve(opt('--out', path.join(os.tmpdir(), 'ntk-shots')));
const ONLY = opt('--only') ? opt('--only').split(',') : null;

const PK = 'ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG';
const LOGIN = `/login#pk=${encodeURIComponent(PK)}&return=${encodeURIComponent('ntk://auth')}&network=testnet`;
// Mainnet: the invalid state ("not available yet") until its keys are pinned in lib/networks.js, then its wallets.
const LOGIN_MAINNET = LOGIN.replace('network=testnet', 'network=mainnet');
// The README's example: "I agree with this, and I typed every word myself." and the same with "!".
const TEXT = 'SSBhZ3JlZSB3aXRoIHRoaXMsIGFuZCBJIHR5cGVkIGV2ZXJ5IHdvcmQgbXlzZWxmLg';
const EDITED = 'SSBhZ3JlZSB3aXRoIHRoaXMsIGFuZCBJIHR5cGVkIGV2ZXJ5IHdvcmQgbXlzZWxmIQ';

const loginState = (state, fill) => `(() => {
  ${fill}
  document.body.dataset.state = '${state}';
  for (const el of document.querySelectorAll('[data-show]')) el.hidden = !el.dataset.show.split(' ').includes('${state}');
})()`;

const SHOTS = [
  { name: 'start', path: '/' },
  { name: 'match', path: `/26144e35e7#t=${TEXT}` },
  { name: 'nomatch', path: `/26144e35e7#t=${EDITED}` },
  { name: 'unknown', path: '/0000000000#t=SGVsbG8' },
  { name: 'feed', path: '/feed/?embed=1' },
  { name: 'messages', path: '/messages/?embed=1' },
  { name: 'login', path: LOGIN },
  { name: 'login-connected', path: LOGIN, then: loginState('connected', "document.getElementById('account').textContent = 'ntk-alice.testnet'; document.getElementById('wallet-name').textContent = 'Meteor Wallet';") },
  { name: 'login-done', path: LOGIN, then: loginState('done', "document.getElementById('done-account').textContent = 'ntk-alice.testnet'; document.getElementById('done-detail').textContent = 'The key is on your account.';") },
  { name: 'login-error', path: LOGIN, then: loginState('error', "document.getElementById('error-text').textContent = 'The wallet did not add the key: User rejected the transaction'; document.getElementById('switch-error').hidden = false;") },
  { name: 'login-invalid', path: '/login#pk=nope' },
  { name: 'login-mainnet', path: LOGIN_MAINNET },
  { name: 'privacy', path: '/privacy/' },
  { name: 'app', path: '/app/' },
  { name: 'trailer', path: '/trailer/' },
];

async function main() {
  const local = await serveLocal();
  const chrome = await launchChrome();
  const cdp = await Cdp.connect(chrome.wsUrl);
  let reported = 0;
  try {
    for (const shot of SHOTS.filter((s) => !ONLY || ONLY.includes(s.name))) {
      for (const dark of [false, true]) {
        const page = await openPage(cdp, { dark, out: OUT });
        await page.goto(local.base + shot.path);
        await sleep(shot.path.startsWith('/login') ? 2500 : 4000); // stamps come from OutLayer
        if (shot.then) { await page.evaluate(shot.then); await sleep(300); }
        // Nothing may be wider than the phone: a block's faces must stay inside the page.
        const wide = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
        if (wide > 0) page.log.push({ where: 'page', kind: 'layout', text: `${wide}px wider than the screen` });
        const file = await page.shot(`${shot.name}-${dark ? 'dark' : 'light'}`);
        console.log(`${shot.name} ${dark ? 'dark ' : 'light'} ${file}`);
        // A stamp lookup answers 404 where there is no such stamp: on purpose on the UNKNOWN STAMP page, and on
        // every network but the stamp's own once more than one is pinned (a tag names no network).
        // /download/ (the APK, the launch video) is copied to the server by hand and is not served here (as in site.test.mjs).
        const log = page.log.filter((e) => !(e.kind === 'log.network' && /status of 404/.test(e.text) &&
          /\/public\/storage\/get\?|\/download\//.test(e.text)));
        for (const e of log) { reported++; console.log(`   [${e.kind}] (${e.where}) ${e.text.slice(0, 300)}`); }
        await page.close();
      }
    }
  } finally {
    await chrome.close(cdp);
    cdp.close();
    local.server.close();
  }
  console.log(reported ? `${reported} console errors or CSP violations` : 'no console errors, no CSP violations');
  process.exitCode = reported ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(2); });

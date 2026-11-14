// Verify page logic (web/verify/model.js): reading the address, and what the
// page shows for each verdict, built from real verifyStamp() results.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NTK, PINNED, pinsFor, verifyStamp, verifyId, verifyUrl, encodeText } from '../lib/ntk-verify.js';
import { NETWORKS } from '../lib/networks.js';
import {
  parseLocation, verifyBaseFor, boxMessage, hasText, formatUtc, issuingCall, checkList, buildView, MEANING, TITLES,
  chipText, siteNetworks,
} from '../verify/model.js';
import { testKey, pinnedMainnet, signedStamp, storageFetch } from './stamp-signer.mjs';

const { stamp: STAMP } = JSON.parse(fs.readFileSync(new URL('../../docs/test-vectors/crypto-v1.json', import.meta.url), 'utf8'));
const PUBLISHED = { id: STAMP.id, pk: STAMP.pk, record: STAMP.record, sig: STAMP.sig };
const TEXT = 'This reply was typed by me, a human, on my own phone, one key at a time.';
const CALL = '3437877d-fbaa-482b-a042-1673f4135fde';
const ID = 'e65ee28db5';

const view = async (published, prefix, opts = {}) =>
  buildView(await verifyStamp(published, prefix, { id: ID }), { id: ID, textGiven: hasText(prefix), ...opts });

test('parseLocation: the id from the path, the text from the fragment', () => {
  assert.deepEqual(parseLocation({ pathname: `/${ID}`, hash: `#t=${encodeText(TEXT)}` }), { id: ID, text: TEXT, error: null });
  assert.deepEqual(parseLocation({ pathname: `/${ID}`, hash: '' }), { id: ID, text: null, error: null });
  assert.deepEqual(parseLocation({ pathname: '/', hash: '' }), { id: null, text: null, error: null });
  assert.equal(parseLocation({ pathname: `/${ID}`, hash: `#x=1&t=${encodeText('é👍')}` }).text, 'é👍');
  for (const pathname of ['/E65EE28DB5', `/${ID}/`, '/e65ee28db', '/feed/', '/index.html', `/x/${ID}`]) {
    assert.equal(parseLocation({ pathname, hash: '' }).id, null, pathname);
  }
  const bad = parseLocation({ pathname: `/${ID}`, hash: '#t=@@@' });
  assert.equal(bad.text, null);
  assert.match(bad.error, /damaged/);
});

test('parseLocation reads what verifyUrl writes', () => {
  for (const text of [TEXT, 'a\nb', '中文 👍', '  spaced  ']) {
    const u = new URL(verifyUrl(ID, text, 'http://localhost:3970/'));
    assert.equal(parseLocation(u).text, text);
  }
});

test('verifyBaseFor: the real site, otherwise this origin', () => {
  assert.equal(verifyBaseFor({ hostname: 'ntk.tools', origin: 'https://ntk.tools' }), 'https://ntk.tools/');
  assert.equal(verifyBaseFor({ hostname: 'www.ntk.tools', origin: 'https://www.ntk.tools' }), 'https://ntk.tools/');
  assert.equal(verifyBaseFor({ hostname: 'localhost', origin: 'http://localhost:3970' }), 'http://localhost:3970/');
  assert.equal(verifyBaseFor({ hostname: '10.0.2.2', origin: 'http://10.0.2.2:3970' }), 'http://10.0.2.2:3970/');
  assert.equal(verifyBaseFor({ hostname: '', origin: 'null' }), 'https://ntk.tools/');
});

test('boxMessage puts the tag back after the text', () => {
  assert.equal(boxMessage(ID, TEXT), `${TEXT} [NTK ${ID}]`);
  assert.equal(boxMessage(ID, 'a\n'), `a\n[NTK ${ID}]`);
  assert.equal(boxMessage(ID, ''), '');
  assert.equal(boxMessage(ID, null), '');
  assert.ok(hasText(' x ') && !hasText(' \n\t ') && !hasText(null) && !hasText(''));
});

test('formatUtc and the issuing call', () => {
  assert.equal(formatUtc(1794569167718), '2026-11-13 11:26 UTC');
  assert.equal(formatUtc(undefined), 'unknown');
  assert.deepEqual(issuingCall(JSON.parse(STAMP.record)), {
    id: CALL,
    url: `https://testnet-api.outlayer.ai/attestations/by-call/${CALL}`,
    command: `outlayer-verify call ${CALL} --network testnet`,
  });
  assert.equal(issuingCall({ call_id: '../../etc' }), null);
  assert.equal(issuingCall({ call_id: CALL, network: 'Test Net' }).command, `outlayer-verify call ${CALL} --network testnet`);
});

test('MATCH: verdict, facts, covered text, all checks, the attestation', async () => {
  const v = await view(PUBLISHED, TEXT);
  assert.equal(v.verdict, 'MATCH');
  assert.equal(v.title, 'MATCH');
  assert.equal(v.tone, 'match');
  assert.equal(v.network, 'testnet');
  assert.equal(v.covered, TEXT);
  const facts = Object.fromEntries(v.facts.map((f) => [f.label, f.value]));
  assert.equal(facts['NEAR account'], 'ntk-alice.testnet');
  assert.equal(facts.Typed, '2026-11-13 11:26 UTC');
  assert.equal(facts['Typed share'], '100% typed key by key');
  assert.equal(facts['Typing match score'], '98% (needs 65%)');
  assert.deepEqual(v.score, { pct: 98, needs: 65 }, 'the scale on the display');
  assert.equal(facts['Key taps'], '73');
  assert.equal(facts['Characters covered'], '72');
  assert.equal(facts.Fingerprint, '3 enrollment sessions');
  assert.deepEqual(v.checks.map((c) => c.status), ['pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
  assert.equal(v.call.url, `https://testnet-api.outlayer.ai/attestations/by-call/${CALL}`);
  assert.equal(v.call.command, `outlayer-verify call ${CALL} --network testnet`);
  assert.equal(v.meaning, MEANING);
  assert.match(MEANING, /typed key by key on the NTK keyboard/);
  assert.match(MEANING, /fingerprint, not that it was written without help/);
  assert.match(v.summary, /ntk-alice\.testnet/);
});

test('NO MATCH: a genuine stamp, the text check fails, the checked text is shown', async () => {
  const changed = TEXT.replace('time', 'moment');
  const v = await view(PUBLISHED, changed);
  assert.equal(v.title, 'NO MATCH');
  assert.equal(v.tone, 'nomatch');
  assert.equal(v.covered, [...changed].slice(-72).join(''), 'the 72 characters the stamp covers');
  assert.equal(v.coveredLabel, 'The last 72 characters before the tag');
  assert.match(v.summary, /genuine stamp by ntk-alice\.testnet.*not the text that was stamped/);
  assert.equal(v.score, null, 'the scale shows only on a MATCH');
  assert.deepEqual(v.checks.map((c) => c.status), ['pass', 'pass', 'pass', 'pass', 'pass', 'fail']);
  assert.ok(v.call, 'a genuine stamp still links its attestation');
  const short = await view(PUBLISHED, 'too short');
  assert.equal(short.covered, null);
  assert.match(short.summary, /shorter than the 72 characters/);
});

test('no text given: the stamp is shown as genuine, the text check is skipped', async () => {
  const v = await view(PUBLISHED, null);
  assert.equal(v.verdict, 'NO_TEXT');
  assert.equal(v.title, 'NO TEXT GIVEN');
  assert.equal(v.covered, null);
  assert.equal(v.checks.at(-1).status, 'skip');
  assert.match(v.checks.at(-1).detail, /no text given/);
  assert.ok(v.facts.length > 0);
});

test('INVALID: nothing from the record is shown as fact', async () => {
  const altered = { ...PUBLISHED, record: PUBLISHED.record.replace('ntk-alice.testnet', 'ntk-mallory.testnet') };
  const v = await view(altered, TEXT);
  assert.equal(v.title, 'INVALID');
  assert.deepEqual(v.facts, []);
  assert.equal(v.call, null);
  assert.equal(v.record, null);
  assert.ok(!JSON.stringify(v).includes('mallory'), 'the altered account is not displayed');
  assert.deepEqual(v.checks.map((c) => c.status), ['pass', 'pass', 'fail', 'pass', 'pass', 'skip']);
  assert.match(v.checks[5].detail, /not valid/);
});

test('UNKNOWN STAMP and COULD NOT CHECK', async () => {
  const u = await view(null, TEXT);
  assert.equal(u.title, TITLES.UNKNOWN);
  assert.equal(u.title, 'UNKNOWN STAMP');
  assert.equal(u.meaning, null, 'no stamp, nothing to explain');
  assert.deepEqual(u.checks.map((c) => c.status), ['fail', 'skip', 'skip', 'skip', 'skip', 'skip']);
  assert.match(u.summary, /No stamp has the id e65ee28db5/);
  const e = buildView({ verdict: 'ERROR', error: 'stamp lookup failed: HTTP 502', checks: [] }, { id: ID });
  assert.equal(e.title, 'COULD NOT CHECK');
  assert.match(e.summary, /HTTP 502/);
  assert.ok(e.checks.every((c) => c.status === 'skip'));
  assert.equal(e.network, 'testnet');
});

test('a result carries its own link, built on the right base', async () => {
  const base = verifyBaseFor({ hostname: 'localhost', origin: 'http://localhost:3970' });
  const link = verifyUrl(ID, TEXT, base);
  const v = await view(PUBLISHED, TEXT, { link });
  assert.equal(v.link, `http://localhost:3970/${ID}#t=${encodeText(TEXT)}`);
  assert.equal(parseLocation(new URL(v.link)).text, TEXT, 'the link checks the same text again');
  assert.equal((await view(null, TEXT)).link, null);
});

test('checkList keeps the labels verifyStamp gives', async () => {
  const r = await verifyStamp(PUBLISHED, TEXT, { id: ID });
  assert.deepEqual(checkList(r).map((c) => c.label), r.checks.map((c) => c.label));
});

// ---- the network chip ---------------------------------------------------------

const MAIN_KEY = testKey();
const MAINNET = pinsFor(pinnedMainnet(MAIN_KEY));
const MAIN_TEXT = 'Typed on mainnet, every key of it, by me.';
const tables = (main = {}) => storageFetch({ [NETWORKS.testnet.api]: { [ID]: PUBLISHED }, [NETWORKS.mainnet.api]: main });

test('a stamp found on testnet: the chip says TESTNET, as before', async () => {
  const r = await verifyId(ID, TEXT, { networks: [NTK, MAINNET], fetchImpl: tables() });
  const v = buildView(r, { id: ID });
  assert.equal(v.verdict, 'MATCH');
  assert.equal(v.network, 'testnet');
  assert.equal(v.chip, 'TESTNET');
  assert.equal(v.call.url, `https://testnet-api.outlayer.ai/attestations/by-call/${CALL}`);
});

test('a stamp found on mainnet: the chip says MAINNET, the attestation is on the mainnet API', async () => {
  const stamp = await signedStamp(MAIN_KEY, MAIN_TEXT);
  const r = await verifyId(stamp.id, MAIN_TEXT, { networks: [NTK, MAINNET], fetchImpl: tables({ [stamp.id]: stamp }) });
  const v = buildView(r, { id: stamp.id });
  assert.equal(v.verdict, 'MATCH');
  assert.equal(v.network, 'mainnet');
  assert.equal(v.chip, 'MAINNET');
  const call = JSON.parse(stamp.record).call_id;
  assert.deepEqual(v.call, { id: call, url: `https://api.outlayer.ai/attestations/by-call/${call}`, command: `outlayer-verify call ${call} --network mainnet` });
  assert.equal(Object.fromEntries(v.facts.map((f) => [f.label, f.value])).Network, 'mainnet');
  assert.match(v.summary, /ntk-alice\.near/);
  // INVALID on mainnet (the record names the wrong network): the chip still says where it was found.
  const wrong = await signedStamp(MAIN_KEY, MAIN_TEXT, { network: 'testnet' });
  const bad = buildView(await verifyId(wrong.id, MAIN_TEXT, { networks: [NTK, MAINNET], fetchImpl: tables({ [wrong.id]: wrong }) }), { id: wrong.id });
  assert.equal(bad.verdict, 'INVALID');
  assert.equal(bad.chip, 'MAINNET');
  assert.deepEqual(bad.facts, []);
});

test('found nowhere: the chip and the summary name every network that was asked', async () => {
  const both = buildView(await verifyId('0000000000', TEXT, { networks: [NTK, MAINNET], fetchImpl: tables() }), { id: '0000000000' });
  assert.equal(both.verdict, 'UNKNOWN');
  assert.equal(both.chip, 'TESTNET · MAINNET');
  assert.equal(both.summary, 'No stamp has the id 0000000000 on NEAR testnet or mainnet. Check the tag for a typo.');
  const one = buildView(await verifyId('0000000000', TEXT, { networks: [NTK], fetchImpl: tables() }), { id: '0000000000' });
  assert.equal(one.chip, 'TESTNET');
  assert.equal(one.summary, 'No stamp has the id 0000000000. Check the tag for a typo.', 'unchanged with testnet alone');
  const err = buildView({ verdict: 'ERROR', error: 'offline', checks: [], networks: ['testnet', 'mainnet'] }, { id: ID });
  assert.equal(err.chip, 'TESTNET · MAINNET');
});

test('the site bar and footer: index.html names the pinned networks before the script runs', () => {
  assert.equal(chipText(['testnet']), 'TESTNET');
  assert.equal(siteNetworks(['testnet']).title, 'Stamps on NEAR testnet only');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const names = PINNED.map((p) => p.network);
  const now = siteNetworks(names);
  const cls = names.length === 1 ? `chip chip-${names[0]}` : 'chip';
  assert.ok(html.includes(`<span id="site-net" class="${cls}" title="${now.title}">${now.chip}</span>`), 'the chip before the script runs');
  assert.ok(html.includes(`<span id="foot-net">${now.footer}</span>`), 'the footer before the script runs');
  assert.deepEqual(siteNetworks(['testnet', 'mainnet']),
    { chip: 'TESTNET · MAINNET', title: 'Stamps on NEAR testnet and mainnet', footer: 'NEAR testnet and mainnet' });
  assert.deepEqual(siteNetworks(PINNED.map((p) => p.network)).chip, chipText(PINNED.map((p) => p.network)));
});

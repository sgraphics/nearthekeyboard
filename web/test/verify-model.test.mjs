// Verify page logic (web/verify/model.js): reading the address, and what the
// page shows for each verdict, built from real verifyStamp() results.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verifyStamp, verifyUrl, encodeText } from '../lib/ntk-verify.js';
import {
  parseLocation, verifyBaseFor, boxMessage, hasText, formatUtc, issuingCall, checkList, buildView, MEANING, TITLES,
} from '../verify/model.js';

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

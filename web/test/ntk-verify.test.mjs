// The reference verifier, web/lib/ntk-verify.js: text rule v2 against the shared
// test vectors, and every verdict on the real stamp e65ee28db5 (a v1 stamp,
// published by the live enclave; its JSON is in docs/test-vectors/crypto-v1.json).
// Offline by default. NTK_LIVE=1 also fetches the stamp from OutLayer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  NTK, canonicalText, charCount, coveredText, findTags, sha256Hex, encodeText, decodeText,
  verifyUrl, stampUrl, fetchStamp, verifyStamp, verifyText,
} from '../lib/ntk-verify.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const TEXT_V2 = read('../../docs/test-vectors/text-v2.json');
const { stamp: STAMP } = read('../../docs/test-vectors/crypto-v1.json');
const PUBLISHED = { id: STAMP.id, pk: STAMP.pk, record: STAMP.record, sig: STAMP.sig };
const TEXT = 'This reply was typed by me, a human, on my own phone, one key at a time.';
const CHANGED = 'This reply was typed by me, a human, on my own phone, one key at a moment.';
const LIVE = process.env.NTK_LIVE === '1';

/** A fetch that answers stamp lookups from a table. */
const fakeFetch = (table) => async (url) => {
  const id = decodeURIComponent(new URL(url).searchParams.get('key')).replace('stamp:', '');
  const v = table[id];
  if (v === undefined) return new Response('not found', { status: 404 });
  if (typeof v === 'number') return new Response('error', { status: v });
  return new Response(JSON.stringify(v), { status: 200 });
};

test('text rule v2: canonical text, length and hash match the shared vectors', async () => {
  for (const v of TEXT_V2.canonical) {
    assert.equal(canonicalText(v.input), v.canonical, v.name);
    assert.equal(charCount(v.canonical), v.chars, v.name);
    assert.equal(await sha256Hex(v.canonical), v.sha256, v.name);
  }
});

test('text rule v2: covered text matches the shared vectors', () => {
  for (const v of TEXT_V2.covered) assert.equal(coveredText(v.prefix, v.chars, v.v), v.covered, v.name);
});

test('findTags: the short form, the old form with an account, and nothing else', () => {
  const s = 'a [NTK e65ee28db5] b [NTK @ntk-alice.testnet 0123456789] c [NTK E65EE28DB5] [NTK e65ee28db]';
  const tags = findTags(s);
  assert.deepEqual(tags.map((t) => [t.id, t.account]), [['e65ee28db5', null], ['0123456789', 'ntk-alice.testnet']]);
  assert.equal(s.slice(tags[0].index, tags[0].index + tags[0].length), '[NTK e65ee28db5]');
});

test('encodeText / decodeText round-trip, and verify URLs keep the text in the fragment', () => {
  for (const s of ['', 'plain', 'é👍 中文', 'a\r\nb\tc']) assert.equal(decodeText(encodeText(s)), s);
  assert.doesNotMatch(encodeText('??>>~~'), /[+/=]/, 'base64url, no padding');
  assert.equal(verifyUrl('e65ee28db5'), 'https://ntk.tools/e65ee28db5');
  assert.equal(verifyUrl('e65ee28db5', 'Hi', 'http://localhost:3970/'), `http://localhost:3970/e65ee28db5#t=${encodeText('Hi')}`);
  assert.equal(stampUrl('e65ee28db5'),
    'https://testnet-api.outlayer.ai/public/storage/get?project=nearthekeyboard.testnet%2Fntk&key=stamp%3Ae65ee28db5&format=raw');
});

test('the live stamp e65ee28db5 with its text: MATCH, every check passes', async () => {
  const r = await verifyStamp(PUBLISHED, TEXT, { id: 'e65ee28db5' });
  assert.equal(r.verdict, 'MATCH');
  assert.deepEqual(r.checks.map((c) => [c.key, c.ok]),
    [['found', true], ['key', true], ['signature', true], ['id', true], ['project', true], ['text', true]]);
  assert.equal(r.covered, TEXT);
  assert.equal(r.record.account, 'ntk-alice.testnet');
  assert.equal(r.record.v, 1);
  assert.equal(r.record.text_sha256, await sha256Hex(TEXT));
});

test('one word changed: NO_MATCH, the stamp itself still checks out', async () => {
  const r = await verifyStamp(PUBLISHED, CHANGED, { id: 'e65ee28db5' });
  assert.equal(r.verdict, 'NO_MATCH');
  assert.deepEqual(r.checks.filter((c) => !c.ok).map((c) => c.key), ['text']);
});

test('text earlier in the block and spacing around it do not matter (v1: trim)', async () => {
  const r = await verifyStamp(PUBLISHED, `Alice @ntk_alice 1h\n  ${TEXT} `, { id: 'e65ee28db5' });
  assert.equal(r.verdict, 'MATCH');
  assert.equal(r.covered, TEXT);
});

test('a prefix shorter than the stamped text: NO_MATCH with no covered text', async () => {
  const r = await verifyStamp(PUBLISHED, 'one key at a time.', { id: 'e65ee28db5' });
  assert.equal(r.verdict, 'NO_MATCH');
  assert.equal(r.covered, null);
});

test('altered record, foreign key, wrong id: INVALID', async () => {
  const altered = { ...PUBLISHED, record: PUBLISHED.record.replace('"score_pct":98', '"score_pct":99') };
  assert.equal((await verifyStamp(altered, TEXT)).verdict, 'INVALID');
  const foreign = { ...PUBLISHED, pk: 'ed25519:3WTypo2uYrwMHJ5yFFwUPX6T25n39PwNwke7pz22P4Ut' };
  assert.equal((await verifyStamp(foreign, TEXT)).verdict, 'INVALID');
  assert.equal((await verifyStamp(PUBLISHED, TEXT, { id: '0123456789' })).verdict, 'INVALID');
  const badSig = { ...PUBLISHED, sig: `A${PUBLISHED.sig.slice(1)}` };
  assert.equal((await verifyStamp(badSig, TEXT)).verdict, 'INVALID');
});

test('no stamp under the id: UNKNOWN', async () => {
  const r = await verifyStamp(null, TEXT, { id: '0123456789' });
  assert.equal(r.verdict, 'UNKNOWN');
  assert.deepEqual(r.checks.map((c) => [c.key, c.ok]), [['found', false]]);
});

test('verifyText checks every tag against the text before it, with a stubbed fetch', async () => {
  const fetchImpl = fakeFetch({ e65ee28db5: PUBLISHED, '0000000000': 500 });
  const results = await verifyText(`${TEXT} [NTK e65ee28db5] then [NTK 0123456789] and [NTK 0000000000]`, { fetchImpl });
  assert.deepEqual(results.map((r) => [r.tag.id, r.verdict]),
    [['e65ee28db5', 'MATCH'], ['0123456789', 'UNKNOWN'], ['0000000000', 'ERROR']]);
  assert.match(results[2].error, /HTTP 500/);
  const changed = await verifyText(`${CHANGED} [NTK e65ee28db5]`, { fetchImpl });
  assert.equal(changed[0].verdict, 'NO_MATCH');
  assert.equal((await verifyText('no tags', { fetchImpl })).length, 0);
});

test('fetchStamp refuses an id that is not 10 lowercase hex characters', async () => {
  await assert.rejects(fetchStamp('E65EE28DB5', { fetchImpl: fakeFetch({}) }), /10 lowercase hex/);
  assert.equal(NTK.stampPk, STAMP.pk, 'the vector stamp carries the pinned key');
});

// A real v2 stamp (enclave 0.2.0), saved from OutLayer public storage on 2026-11-13.
const V2 = read('./fixtures/stamp-26144e35e7.json');
const V2_TEXT = 'I agree with this, and I typed every word myself.';

test('the v2 stamp 26144e35e7: spacing may vary (text rule v2), words, case and punctuation may not', async () => {
  const check = async (prefix) => (await verifyStamp(V2, prefix, { id: '26144e35e7' })).verdict;
  const r = await verifyStamp(V2, V2_TEXT, { id: '26144e35e7' });
  assert.equal(r.verdict, 'MATCH');
  assert.equal(r.record.v, 2);
  assert.equal(r.record.text_chars, 49);
  assert.equal(r.record.text_sha256, TEXT_V2.canonical.find((v) => v.name === 'the demo reply').sha256);
  assert.equal(await check('I agree  with this,\nand I typed every word\tmyself.  '), 'MATCH');
  assert.equal(await check(`Alice wrote:\n\n${V2_TEXT} `), 'MATCH');
  assert.equal(await check(`First part [NTK e65ee28db5] ${V2_TEXT}`), 'MATCH');
  assert.equal(await check(V2_TEXT.replace('every', 'each')), 'NO_MATCH');
  assert.equal(await check(V2_TEXT.replace('I agree', 'i agree')), 'NO_MATCH');
  assert.equal(await check(V2_TEXT.replace(/\.$/, '!')), 'NO_MATCH');
  assert.equal(await check('I agree with this,and I typed every word myself.'), 'NO_MATCH', 'a removed space is a change');
});

test('live: e65ee28db5 and 26144e35e7 from OutLayer public storage (NTK_LIVE=1)', { skip: !LIVE && 'set NTK_LIVE=1 to fetch from OutLayer' }, async () => {
  const [match] = await verifyText(`${TEXT} [NTK e65ee28db5]`);
  assert.equal(match.verdict, 'MATCH');
  const [noMatch] = await verifyText(`${CHANGED} [NTK e65ee28db5]`);
  assert.equal(noMatch.verdict, 'NO_MATCH');
  const [unknown] = await verifyText(`${TEXT} [NTK 0000000000]`);
  assert.equal(unknown.verdict, 'UNKNOWN');
  const [v2] = await verifyText(`${V2_TEXT} [NTK 26144e35e7]`);
  assert.equal(v2.verdict, 'MATCH');
  assert.deepEqual(await fetchStamp('26144e35e7'), V2, 'the saved fixture is what OutLayer publishes');
});

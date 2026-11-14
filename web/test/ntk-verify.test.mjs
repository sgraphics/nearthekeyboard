// The reference verifier, web/lib/ntk-verify.js: text rule v2 against the shared
// test vectors, and every verdict on the real stamp e65ee28db5 (a v1 stamp,
// published by the live enclave; its JSON is in docs/test-vectors/crypto-v1.json).
// Offline by default. NTK_LIVE=1 also fetches the stamp from OutLayer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  NTK, PINNED, pinsFor, canonicalText, charCount, coveredText, findTags, sha256Hex, encodeText, decodeText,
  verifyUrl, stampUrl, fetchStamp, findStamp, verifyStamp, verifyId, verifyText,
} from '../lib/ntk-verify.js';
import { NETWORKS, availableNetworks } from '../lib/networks.js';
import { testKey, pinnedMainnet, signedStamp, storageFetch } from './stamp-signer.mjs';

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

// ---- networks: a tag names none, so a verifier looks the id up on every pinned one ----

const TESTNET_API = NETWORKS.testnet.api;
const MAINNET_API = NETWORKS.mainnet.api;
const MAIN_KEY = testKey(); // stands in for the mainnet enclave's stamp key until the real one is pinned
const MAINNET = pinsFor(pinnedMainnet(MAIN_KEY));
const BOTH = [NTK, MAINNET];
const MAIN_TEXT = 'Typed on mainnet, every key of it, by me.';

test('the pins: testnet is NTK and comes first; PINNED holds exactly the networks with both keys', () => {
  assert.equal(PINNED[0], NTK);
  assert.deepEqual(PINNED.map((p) => p.network), availableNetworks().map((n) => n.network));
  assert.deepEqual(NTK, { project: 'nearthekeyboard.testnet/ntk', network: 'testnet', api: 'https://testnet-api.outlayer.ai',
    stampPk: 'ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG', verifyBase: 'https://ntk.tools/' }, 'unchanged');
  assert.deepEqual(pinsFor(NETWORKS.mainnet), { project: 'nearthekeyboard.near/ntk', network: 'mainnet', api: 'https://api.outlayer.ai',
    stampPk: NETWORKS.mainnet.stampPk, verifyBase: 'https://ntk.tools/' });
  assert.equal(stampUrl('26144e35e7', MAINNET),
    'https://api.outlayer.ai/public/storage/get?project=nearthekeyboard.near%2Fntk&key=stamp%3A26144e35e7&format=raw');
});

test('found on testnet: both networks are asked at once, the testnet pins check it', async () => {
  const fetchImpl = storageFetch({ [TESTNET_API]: { '26144e35e7': V2 }, [MAINNET_API]: {} });
  const r = await verifyId('26144e35e7', V2_TEXT, { networks: BOTH, fetchImpl });
  assert.equal(r.verdict, 'MATCH');
  assert.equal(r.network, 'testnet');
  assert.equal(r.pins, NTK);
  assert.deepEqual(r.networks, ['testnet', 'mainnet']);
  assert.deepEqual(fetchImpl.calls.map((u) => new URL(u).origin).sort(), [MAINNET_API, TESTNET_API].sort());
  assert.equal(fetchImpl.maxInFlight, 2, 'the two lookups ran in parallel');
});

test('found on mainnet: MATCH with the mainnet pins (its key, its project, network mainnet)', async () => {
  const stamp = await signedStamp(MAIN_KEY, MAIN_TEXT);
  const fetchImpl = storageFetch({ [TESTNET_API]: {}, [MAINNET_API]: { [stamp.id]: stamp } });
  const r = await verifyId(stamp.id, `Earlier text. ${MAIN_TEXT} `, { networks: BOTH, fetchImpl });
  assert.equal(r.verdict, 'MATCH');
  assert.equal(r.network, 'mainnet');
  assert.equal(r.pins, MAINNET);
  assert.equal(r.record.network, 'mainnet');
  assert.equal(r.covered, MAIN_TEXT);
  assert.deepEqual(r.checks.map((c) => [c.key, c.ok]),
    [['found', true], ['key', true], ['signature', true], ['id', true], ['project', true], ['text', true]]);
  assert.equal(fetchImpl.maxInFlight, 2);
  // verifyText checks tags of both networks in one text.
  const text = `${V2_TEXT} [NTK 26144e35e7] and then ${MAIN_TEXT} [NTK ${stamp.id}]`;
  const both = storageFetch({ [TESTNET_API]: { '26144e35e7': V2 }, [MAINNET_API]: { [stamp.id]: stamp } });
  assert.deepEqual((await verifyText(text, { networks: BOTH, fetchImpl: both })).map((x) => [x.tag.id, x.verdict, x.network]),
    [['26144e35e7', 'MATCH', 'testnet'], [stamp.id, 'MATCH', 'mainnet']]);
  // The mainnet stamp checked against the testnet pins is not an NTK stamp there.
  assert.equal((await verifyStamp(stamp, MAIN_TEXT, { id: stamp.id })).verdict, 'INVALID');
});

test('mainnet not pinned: skipped, never asked; the lookup is on testnet alone', async () => {
  const unpinned = pinsFor({ ...NETWORKS.mainnet, stampPk: null, transportPk: null });
  const fetchImpl = storageFetch({ [TESTNET_API]: { '26144e35e7': V2 } }); // a request to mainnet would be an error
  const r = await verifyId('26144e35e7', V2_TEXT, { networks: [NTK, unpinned], fetchImpl });
  assert.equal(r.verdict, 'MATCH');
  assert.deepEqual(r.networks, ['testnet']);
  assert.deepEqual(fetchImpl.calls.map((u) => new URL(u).origin), [TESTNET_API]);
  const unknown = await verifyId('0123456789', V2_TEXT, { networks: [NTK, unpinned], fetchImpl });
  assert.equal(unknown.verdict, 'UNKNOWN');
  assert.equal(unknown.network, null);
  assert.deepEqual(unknown.networks, ['testnet']);
  if (!NETWORKS.mainnet.stampPk) assert.ok(PINNED.every((p) => p.network !== 'mainnet'), 'mainnet is off until pinned');
});

test('a record whose network does not match its pins: INVALID, though the key and signature are right', async () => {
  // Signed by the mainnet key, published on mainnet, but the record says testnet.
  const stamp = await signedStamp(MAIN_KEY, MAIN_TEXT, { network: 'testnet' });
  const fetchImpl = storageFetch({ [TESTNET_API]: {}, [MAINNET_API]: { [stamp.id]: stamp } });
  const r = await verifyId(stamp.id, MAIN_TEXT, { networks: BOTH, fetchImpl });
  assert.equal(r.verdict, 'INVALID');
  assert.equal(r.network, 'mainnet');
  assert.deepEqual(r.checks.filter((c) => !c.ok).map((c) => c.key), ['project']);
  assert.equal(r.checks.find((c) => c.key === 'project').detail,
    'nearthekeyboard.near/ntk, testnet (NTK on mainnet is nearthekeyboard.near/ntk)');
  assert.equal(r.covered, null);
  // The testnet project named in a stamp of the mainnet key: INVALID too.
  const crossed = await signedStamp(MAIN_KEY, MAIN_TEXT, { project: NTK.project });
  assert.equal((await verifyStamp(crossed, MAIN_TEXT, { id: crossed.id, pins: MAINNET })).verdict, 'INVALID');
  // And the real testnet stamp checked with pins that say mainnet (same key, same project): INVALID.
  assert.equal((await verifyStamp(V2, V2_TEXT, { id: '26144e35e7', pins: { ...NTK, network: 'mainnet' } })).verdict, 'INVALID');
});

test('lookup failures: ERROR only when no network has the stamp', async () => {
  const stamp = await signedStamp(MAIN_KEY, MAIN_TEXT);
  const down = storageFetch({ [TESTNET_API]: { [stamp.id]: 503 }, [MAINNET_API]: {} });
  const e = await verifyId(stamp.id, MAIN_TEXT, { networks: BOTH, fetchImpl: down });
  assert.equal(e.verdict, 'ERROR');
  assert.equal(e.error, 'testnet: stamp lookup failed: HTTP 503');
  assert.deepEqual(e.networks, ['testnet', 'mainnet']);
  const found = storageFetch({ [TESTNET_API]: { [stamp.id]: 503 }, [MAINNET_API]: { [stamp.id]: stamp } });
  assert.equal((await verifyId(stamp.id, MAIN_TEXT, { networks: BOTH, fetchImpl: found })).verdict, 'MATCH');
  const { found: f, missing, errors } = await findStamp(stamp.id, { networks: BOTH, fetchImpl: down });
  assert.deepEqual([f.length, missing.map((p) => p.network), errors.map((x) => x.pins.network)], [0, ['mainnet'], ['testnet']]);
  await assert.rejects(verifyId('XYZ', '', { networks: BOTH, fetchImpl: down }), /10 lowercase hex/);
});

test('the same id on both networks: the genuine stamp wins', async () => {
  const stamp = await signedStamp(MAIN_KEY, MAIN_TEXT);
  const fetchImpl = storageFetch({ [TESTNET_API]: { [stamp.id]: stamp }, [MAINNET_API]: { [stamp.id]: stamp } });
  const r = await verifyId(stamp.id, MAIN_TEXT, { networks: BOTH, fetchImpl });
  assert.equal(r.verdict, 'MATCH');
  assert.equal(r.network, 'mainnet', 'not testnet, where its key is not the pinned one');
});

test('the old API: verifyText and verifyStamp with `pins` check that one network', async () => {
  const fetchImpl = storageFetch({ [TESTNET_API]: { '26144e35e7': V2 } });
  const [r] = await verifyText(`${V2_TEXT} [NTK 26144e35e7]`, { pins: NTK, fetchImpl });
  assert.equal(r.verdict, 'MATCH');
  assert.equal(r.network, 'testnet');
  assert.deepEqual(fetchImpl.calls.map((u) => new URL(u).origin), [TESTNET_API]);
  assert.equal((await verifyStamp(V2, V2_TEXT, { id: '26144e35e7' })).verdict, 'MATCH', 'NTK by default');
});

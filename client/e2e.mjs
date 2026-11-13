// End-to-end test of the NTK enclave on OutLayer (testnet), with synthetic typists.
// Run: node e2e.mjs        (needs ~/.ntk/testnet.env and the test accounts' keys)
//
// What it shows: measurements travel sealed to the enclave; the fingerprint stays
// inside; only a typing session that matches it gets a stamp signed by the
// enclave's key; anyone can verify a stamp with no access to the fingerprint; and
// the attestation proves which code ran.
import { KeyPair } from 'near-api-js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NtkClient, loadEnv, verifyStamp, authFor, seal } from './ntk.mjs';
import { Typist, ENROLL_TEXTS, STAMP_TEXT } from './synth.mjs';
import { keyPairFor } from './near.mjs';

const env = loadEnv('testnet');
const ntk = new NtkClient({ api: env.NTK_API, project: env.NTK_PROJECT, paymentKey: env.NTK_PAYMENT_KEY });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
async function expectError(name, fn, pattern) {
  try {
    const out = await fn();
    const err = out?.error;
    check(name, err && pattern.test(err), err ? `refused: ${err}` : `NOT refused: ${JSON.stringify(out).slice(0, 160)}`);
  } catch (e) {
    check(name, pattern.test(e.message), `refused: ${e.message.slice(0, 160)}`);
  }
}
const noFingerprintIn = (o) => !/"(dwell|flight|off_x|off_y|mean|var)"\s*:/.test(JSON.stringify(o));

// Two typists with different rhythm and different ways of hitting keys.
const aliceTypes = new Typist('alice', { seed: 11, dwell: 88, flight: 95, travel: 22, ox: 0.10, oy: 0.14 });
const bobTypes = new Typist('bob', { seed: 29, dwell: 118, flight: 150, travel: 30, ox: -0.12, oy: -0.06 });

// Identities: alice is a named testnet account (key checked on chain from inside the
// enclave); bob is an implicit account (the key is the account).
const ALICE = process.env.NTK_TEST_ACCOUNT || 'ntk-alice.testnet';
const alice = { accountId: ALICE, keyPair: keyPairFor(ALICE) };
const bobKey = KeyPair.fromRandom('ed25519');
const bob = { accountId: Buffer.from(bobKey.getPublicKey().data).toString('hex'), keyPair: bobKey };

console.log(`\nNTK end-to-end on ${env.NTK_PROJECT} (${env.NTK_API})\n`);

// 1. The enclave's keys. A verifier pins stamp_pk once; the keyboard seals to transport_pk.
const info = await ntk.info();
check('info: enclave answers with its stamp key and transport key', info.ok && info.stamp_pk && info.transport_pk,
  `stamp_pk ${info.stamp_pk}, transport_pk ${info.transport_pk.slice(0, 16)}…, project ${info.project}`);
const pinnedStampPk = info.stamp_pk;
const T = info.transport_pk;

// 2. Clean slate for alice (also exercises forget).
const forgot = await ntk.request('forget', alice);
check('forget: alice deletes her fingerprint (clean slate)', forgot.ok, `deleted=${forgot.deleted}`);
const st0 = await ntk.request('status', alice);
check('status: alice is not enrolled', st0.ok && st0.enrolled === false);

// 3. Enrollment: three sessions each, sealed to the enclave.
for (const [who, typist] of [[alice, aliceTypes], [bob, bobTypes]]) {
  let last;
  for (let i = 0; i < ENROLL_TEXTS.length; i++) {
    last = await ntk.request('enroll', { ...who, transportPk: T, session: typist.session(ENROLL_TEXTS[i], 100 + i) });
    if (!last.ok) break;
  }
  check(`enroll: ${typist.name} enrolls ${ENROLL_TEXTS.length} sessions`, last.ok && last.ready,
    last.ok ? `sessions=${last.sessions} taps=${last.taps} ready=${last.ready}` : last.error);
  check(`enroll: no fingerprint data comes back (${typist.name})`, noFingerprintIn(last));
}

// 4. Alice types a new text herself -> MATCH, signed stamp.
const genuine = await ntk.request('stamp', { ...alice, transportPk: T, session: aliceTypes.session(STAMP_TEXT, 501) });
const stampCall = ntk.calls.at(-1);
check('stamp: alice typing as alice -> MATCH', genuine.verdict === 'MATCH',
  genuine.verdict === 'MATCH' ? `${genuine.tag}  score ${JSON.parse(genuine.stamp.record).score_pct}%  ${JSON.stringify(genuine.detail)}` : JSON.stringify(genuine));

// 5. Anyone verifies it: fetch by id from OutLayer public storage, check against the pinned key.
let published;
if (genuine.verdict === 'MATCH') {
  published = await ntk.publicStamp(genuine.id);
  const v = verifyStamp(published, pinnedStampPk, STAMP_TEXT);
  check('verify: public stamp fetched by id verifies against the pinned enclave key and the text', v.ok, JSON.stringify(v.checks));
  const forged = verifyStamp(published, pinnedStampPk, STAMP_TEXT.replace('human', 'robot'));
  check('verify: the same stamp does not verify for edited text', !forged.checks.text);
  const r = v.record;
  check('verify: the stamp names the account, text hash, score and the call that issued it',
    r.account === alice.accountId && r.call_id === stampCall.call_id, `call_id ${r.call_id}`);
}

// 6. Bob types on alice's phone (alice's key signs, bob's fingers type) -> NO_MATCH.
const impostor = await ntk.request('stamp', { ...alice, transportPk: T, session: bobTypes.session(STAMP_TEXT, 502) });
check('stamp: someone else typing on alice\'s account -> NO_MATCH, no signature', impostor.verdict === 'NO_MATCH' && !impostor.stamp,
  `${impostor.reason ?? impostor.error} (score ${impostor.score_pct}%)`);

// 7. Bob's key cannot speak for alice's account.
await expectError('auth: bob\'s key claiming alice\'s account is refused',
  () => ntk.request('stamp', { accountId: alice.accountId, keyPair: bob.keyPair, transportPk: T, session: aliceTypes.session(STAMP_TEXT, 503) }),
  /not an access key/);

// 8. Replaying alice's exact stamp request is refused.
await expectError('replay: re-sending alice\'s signed stamp request is refused',
  () => ntk.call(stampCall.input).then((r) => r.output), /replayed|out-of-order/);

// 9. A sealed session cannot be moved to another operation or account.
const enrollSealed = seal(T, aliceTypes.session(STAMP_TEXT, 504), 'enroll', alice.accountId);
await expectError('transport: a session sealed for enroll does not open as a stamp',
  () => ntk.request('stamp', { ...alice, sealedOverride: enrollSealed }), /does not open/);
await expectError('transport: a session sealed for alice does not open for bob',
  () => ntk.request('enroll', { ...bob, sealedOverride: seal(T, aliceTypes.session(STAMP_TEXT, 505), 'enroll', alice.accountId) }), /does not open/);

// 10. Tampered ciphertext (re-signed by alice so only the ciphertext is wrong).
const good = seal(T, aliceTypes.session(STAMP_TEXT, 506), 'stamp', alice.accountId);
const bytes = Buffer.from(good.ct, 'base64'); bytes[10] ^= 1;
await expectError('transport: a tampered sealed session is refused',
  () => ntk.request('stamp', { ...alice, sealedOverride: { ...good, ct: bytes.toString('base64') } }), /does not open/);

// 11. Pasted text: the session mostly inserts text instead of typing it.
const pasted = aliceTypes.session('Sure.', 507);
pasted.events.push({ ins: ' ' + STAMP_TEXT + ' ' + ENROLL_TEXTS[0] });
pasted.events.push(...aliceTypes.session(' ok thanks a lot for the help with this', 508).events);
const pasteRes = await ntk.request('stamp', { ...alice, transportPk: T, session: pasted });
check('stamp: mostly pasted text -> NO_MATCH', pasteRes.verdict === 'NO_MATCH', `${pasteRes.reason} (typed ${pasteRes.typed_pct}%)`);

// 12. Too short to say anything.
const short = await ntk.request('stamp', { ...alice, transportPk: T, session: aliceTypes.session('ok cool', 509) });
check('stamp: a 7-character reply -> NO_MATCH (too short to tell)', short.verdict === 'NO_MATCH', short.reason);

// 13. Bob, an implicit account, stamps his own typing.
const bobStamp = await ntk.request('stamp', { ...bob, transportPk: T, session: bobTypes.session(STAMP_TEXT, 510) });
check('stamp: bob (implicit account) typing as bob -> MATCH', bobStamp.verdict === 'MATCH', bobStamp.tag ?? bobStamp.reason ?? bobStamp.error);

// 14. Status reports progress, never the fingerprint.
const st1 = await ntk.request('status', alice);
check('status: counts only, no fingerprint data', st1.ok && noFingerprintIn(st1),
  `sessions=${st1.sessions} taps=${st1.taps} stamps=${st1.stamps} failed_24h=${st1.failed_24h}`);

// 15. Which keys may speak for an account: a function-call key alice gave some other
// app must not; a key she issued to NTK may. (Optional: runs only when
// ~/.ntk/alice-fc-keys.json exists; the README describes the file.)
const fcFile = path.join(os.homedir(), '.ntk', 'alice-fc-keys.json');
if (fs.existsSync(fcFile)) {
  const fc = JSON.parse(fs.readFileSync(fcFile, 'utf8'));
  await expectError('auth: a function-call key alice issued to another app (wrap.testnet) cannot act for her',
    () => ntk.request('status', { accountId: alice.accountId, keyPair: KeyPair.fromString(fc.fc_other_app.private_key) }), /another app/);
  const viaNtkKey = await ntk.request('status', { accountId: alice.accountId, keyPair: KeyPair.fromString(fc.fc_ntk.private_key) });
  check('auth: a function-call key alice issued to NTK (nearthekeyboard.testnet) can act for her', viaNtkKey.ok && viaNtkKey.enrolled, viaNtkKey.error ?? 'accepted');
}

// 16. Another payer cannot open a parallel fingerprint store. (Optional: runs only
// when ~/.ntk/alice-payer.env exists; the README describes the file.)
const payerFile = path.join(os.homedir(), '.ntk', 'alice-payer.env');
if (fs.existsSync(payerFile)) {
  const otherKey = fs.readFileSync(payerFile, 'utf8').match(/ALICE_PAYMENT_KEY=(\S+)/)[1];
  const other = new NtkClient({ api: env.NTK_API, project: env.NTK_PROJECT, paymentKey: otherKey });
  const otherInfo = await other.info();
  check('payer: another payer gets the same stamp key (one key for every caller)…', otherInfo.stamp_pk === pinnedStampPk, otherInfo.stamp_pk);
  await expectError('payer: …but cannot enroll: only runs paid by the project owner touch fingerprints',
    () => other.request('enroll', { ...alice, transportPk: otherInfo.transport_pk, session: aliceTypes.session(ENROLL_TEXTS[0], 600) }),
    /paid by its project owner/);
}

// 17. Independent attestation check of the stamp call: Intel TDX quote, approved build,
// and that the quote commits to exactly this request and this response.
let attestation = null;
if (stampCall && genuine.verdict === 'MATCH') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntk-verify-'));
  const inFile = path.join(dir, 'input.json');
  const outFile = path.join(dir, 'output.json');
  fs.writeFileSync(inFile, JSON.stringify(stampCall.input));
  fs.writeFileSync(outFile, JSON.stringify(stampCall.output));
  try {
    const out = execFileSync('outlayer-verify', ['call', stampCall.call_id, '--network', 'testnet', '--api', env.NTK_API,
      '--rpc', 'https://rpc.testnet.fastnear.com', '--input', inFile, '--output', outFile, '--json'], { encoding: 'utf8', timeout: 240000 });
    attestation = JSON.parse(out);
  } catch (e) {
    attestation = { error: (e.stdout || e.message).toString().slice(0, 600) };
  }
  // execFileSync throws on a non-zero exit (1 = a layer failed, 2 = unproven), so reaching here means exit 0.
  const layers = ['authenticity', 'identity', 'binding', 'input', 'output'];
  const passed = attestation && !attestation.error && layers.every((l) => attestation[l]?.verdict === 'pass');
  check('attestation: outlayer-verify proves the stamp call ran this wasm in Intel TDX, bound to this exact input/output', passed,
    passed ? layers.map((l) => `${l}=pass`).join(' ') + ` (task ${attestation.task_id}, TCB ${attestation.tcb_status})`
      : JSON.stringify(attestation).slice(0, 300));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
const report = {
  at: new Date().toISOString(), project: env.NTK_PROJECT, api: env.NTK_API,
  stamp_pk: pinnedStampPk, transport_pk: T,
  example_stamp: published ?? null, example_tag: genuine.tag ?? null,
  calls: ntk.calls.map(({ op, call_id, attestation_url }) => ({ op, call_id, attestation_url })),
  attestation, results,
};
fs.writeFileSync(new URL('./e2e-report.json', import.meta.url), JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);

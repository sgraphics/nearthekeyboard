// End-to-end test of the NTK enclave on OutLayer (testnet), with synthetic typists.
// Run: node e2e.mjs        (needs ~/.ntk/testnet.env and the test accounts' keys)
//
// What it shows: measurements travel sealed to the enclave; the fingerprint stays
// inside; only a typing session that matches it gets a stamp signed by the
// enclave's key; anyone can verify a stamp with no access to the fingerprint,
// with the reference verifier (web/lib/ntk-verify.js, text rule v2); refusals
// carry stable codes; and the attestation proves which code ran.
//
// Calls are asynchronous and polled (docs/protocol.md), because one call can
// take minutes. Calls that touch different state run side by side; each part's
// checks are printed when the parts running with it are done.
// NTK_POLL_TIMEOUT_MS changes the 6-minute limit per call.
import { KeyPair } from 'near-api-js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NtkClient, loadEnv, seal, PINNED, POLL_TIMEOUT_MS } from './ntk.mjs';
import { NTK, verifyStamp, coveredText, canonicalText, sha256Hex, fetchStamp } from '../web/lib/ntk-verify.js';
import { Typist, TYPISTS, ENROLL_TEXTS, ENROLL_MODES, STAMP_TEXT, DEMO_REPLY } from './synth.mjs';
import { keyPairFor } from './near.mjs';

const env = loadEnv('testnet');
const timeoutMs = Number(process.env.NTK_POLL_TIMEOUT_MS) || POLL_TIMEOUT_MS;
const started = Date.now();
const clock = () => `${((Date.now() - started) / 60000).toFixed(1)} min`;
const ntk = new NtkClient({
  api: env.NTK_API, project: env.NTK_PROJECT, paymentKey: env.NTK_PAYMENT_KEY, timeoutMs,
  log: (m) => console.log(`        ${clock()}  ${m}`),
});
const enclaveVersion = fs.readFileSync(new URL('../enclave/Cargo.toml', import.meta.url), 'utf8').match(/^version\s*=\s*"([^"]+)"/m)[1];
/** A stamp issued by v0.1 (record v1, whole text, trim only), shown in the README. */
const V1_STAMP = { id: 'e65ee28db5', text: STAMP_TEXT };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function record(r) {
  results.push(r);
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
}
const check = (name, pass, detail = '') => record({ name, pass: !!pass, detail: String(detail) });

/**
 * Runs parts side by side. Each part's checks are printed when all parts are
 * done, in the order the parts are listed. A part whose call fails records one
 * failed check and stops.
 */
async function together(parts) {
  const lanes = parts.map(() => []);
  await Promise.all(parts.map(async ([label, fn], i) => {
    const laneCheck = (name, pass, detail = '') => lanes[i].push({ name, pass: !!pass, detail: String(detail) });
    try {
      await fn(laneCheck);
    } catch (e) {
      laneCheck(`${label}: a call failed, so the rest of this part did not run`, false, String(e.message).slice(0, 300));
    }
  }));
  lanes.flat().forEach(record);
}

/** A refusal: the enclave answers `ok: false` with this code and a text matching `pattern`. */
async function expectError(check, name, fn, code, pattern) {
  const out = await fn();
  const pass = out?.ok === false && out.code === code && pattern.test(out.error ?? '');
  check(name, pass, out?.ok === false ? `refused: ${out.code} ${out.error}` : `NOT refused: ${JSON.stringify(out).slice(0, 160)}`);
}
const noFingerprintIn = (o) => !/"(dwell|flight|off_x|off_y|mean|var)"\s*:/.test(JSON.stringify(o));

// Two typists with different rhythm and different ways of hitting keys.
const aliceTypes = new Typist('alice', TYPISTS.alice);
const bobTypes = new Typist('bob', TYPISTS.bob);

// Identities: alice is a named testnet account (key checked on chain from inside the
// enclave); bob is an implicit account (the key is the account).
const ALICE = process.env.NTK_TEST_ACCOUNT || 'ntk-alice.testnet';
const alice = { accountId: ALICE, keyPair: keyPairFor(ALICE) };
const bobKey = KeyPair.fromRandom('ed25519');
const bob = { accountId: Buffer.from(bobKey.getPublicKey().data).toString('hex'), keyPair: bobKey };

// Optional key files (the README describes them). Their values are never printed.
const fcFile = path.join(os.homedir(), '.ntk', 'alice-fc-keys.json');
const fc = fs.existsSync(fcFile) ? JSON.parse(fs.readFileSync(fcFile, 'utf8')) : null;
const payerFile = path.join(os.homedir(), '.ntk', 'alice-payer.env');
const otherPaymentKey = fs.existsSync(payerFile) ? fs.readFileSync(payerFile, 'utf8').match(/ALICE_PAYMENT_KEY=(\S+)/)?.[1] : null;

const report = {
  at: new Date().toISOString(), project: env.NTK_PROJECT, api: env.NTK_API,
  enclave: null, stamp_pk: null, transport_pk: null,
  example_stamp: null, example_tag: null, demo_stamp: null, attestation: null,
};
let T; // the enclave's transport key, from info

async function enroll(check, who, typist) {
  let last;
  for (let i = 0; i < ENROLL_TEXTS.length; i++) {
    const session = { ...typist.session(ENROLL_TEXTS[i], 100 + i), mode: ENROLL_MODES[i] };
    last = await ntk.request('enroll', { ...who, transportPk: T, session });
    if (!last.ok) break;
  }
  check(`enroll: ${typist.name} enrolls ${ENROLL_TEXTS.length} sessions`, last.ok && last.ready,
    last.ok ? `sessions=${last.sessions} taps=${last.taps} ready=${last.ready}` : `${last.code} ${last.error}`);
  check(`enroll: no fingerprint data comes back (${typist.name})`, noFingerprintIn(last));
  check(`enroll: the sessions are counted per mode, counts only (${typist.name})`,
    last.ok && last.modes?.compose === 2 && last.modes?.copy === 1, `modes=${JSON.stringify(last.modes)}`);
}

async function main() {
  console.log(`\nNTK end-to-end on ${env.NTK_PROJECT} (${env.NTK_API}), enclave ${enclaveVersion} expected, ` +
    `each call polled for up to ${Math.round(timeoutMs / 1000)} s\n`);

  // 1. The enclave's keys. A verifier pins stamp_pk once; the keyboard seals to transport_pk.
  const info = await ntk.info();
  check('info: enclave answers with its stamp key and transport key', info.ok && info.stamp_pk && info.transport_pk,
    `stamp_pk ${info.stamp_pk}, transport_pk ${String(info.transport_pk).slice(0, 16)}…, project ${info.project}`);
  Object.assign(report, { enclave: info.ntk, stamp_pk: info.stamp_pk, transport_pk: info.transport_pk });
  const official = env.NTK_PROJECT === NTK.project;
  check(`info: the enclave is version ${enclaveVersion}${official ? ' and keeps the pinned stamp key and transport key' : ''}`,
    info.ntk === enclaveVersion && (!official || (info.stamp_pk === PINNED.stampPk && info.transport_pk === PINNED.transportPk)),
    `ntk ${info.ntk}`);
  // A verifier of this project pins its stamp key; a test deployment of your own has its own.
  const pins = official ? NTK : { ...NTK, project: env.NTK_PROJECT, api: env.NTK_API, stampPk: info.stamp_pk };
  T = info.transport_pk;

  // 2. Clean slate for alice (also exercises forget), then enrollment: three
  //    sessions each, sealed to the enclave, with their mode. Alice, bob and the
  //    refusals that touch no fingerprint run side by side.
  await together([
    ['alice', async (check) => {
      const forgot = await ntk.request('forget', alice);
      check('forget: alice deletes her fingerprint (clean slate)', forgot.ok, `deleted=${forgot.deleted}`);
      const st0 = await ntk.request('status', alice);
      check('status: alice is not enrolled', st0.ok && st0.enrolled === false);
      await expectError(check, 'stamp: before enrolling -> refused, not enrolled',
        () => ntk.request('stamp', { ...alice, transportPk: T, session: aliceTypes.session(STAMP_TEXT, 499) }),
        'E_NOT_ENROLLED', /enroll first/);
      await enroll(check, alice, aliceTypes);
    }],
    ['bob', (check) => enroll(check, bob, bobTypes)],
    // Which keys may speak for an account: a function-call key alice gave some other app must not.
    fc && ['function-call key for another app', (check) => expectError(check,
      'auth: a function-call key alice issued to another app (wrap.testnet) cannot act for her',
      () => ntk.request('status', { accountId: alice.accountId, keyPair: KeyPair.fromString(fc.fc_other_app.private_key) }),
      'E_AUTH_KEY_OTHER_APP', /another app/)],
    // Another payer cannot open a parallel fingerprint store.
    otherPaymentKey && ['another payer', async (check) => {
      const other = new NtkClient({ api: env.NTK_API, project: env.NTK_PROJECT, paymentKey: otherPaymentKey, timeoutMs, log: ntk.log });
      const otherInfo = await other.info();
      check('payer: another payer gets the same stamp key (one key for every caller)…', otherInfo.stamp_pk === info.stamp_pk, otherInfo.stamp_pk);
      await expectError(check, 'payer: …but cannot enroll: only runs paid by the project owner touch fingerprints',
        () => other.request('enroll', { ...alice, transportPk: otherInfo.transport_pk, session: aliceTypes.session(ENROLL_TEXTS[0], 600) }),
        'E_PAYER', /paid by its project owner/);
    }],
  ].filter(Boolean));

  // 3. Alice types a new text herself -> MATCH, a signed stamp and the short tag.
  const genuine = await ntk.request('stamp', { ...alice, transportPk: T, session: aliceTypes.session(STAMP_TEXT, 501) });
  const stampCall = ntk.calls.findLast((c) => c.output === genuine);
  const matched = genuine.verdict === 'MATCH';
  check('stamp: alice typing as alice -> MATCH', matched,
    matched ? `${genuine.tag}  score ${JSON.parse(genuine.stamp.record).score_pct}%  ${JSON.stringify(genuine.detail)}` : JSON.stringify(genuine));
  check('stamp: the tag is the short form [NTK <id>]', /^[0-9a-f]{10}$/.test(genuine.id ?? '') && genuine.tag === `[NTK ${genuine.id}]`, genuine.tag);
  report.example_tag = genuine.tag ?? null;

  // 4. Anyone verifies it with the reference verifier: fetched by id from OutLayer's
  //    public storage, checked against the pinned key, the text by rule v2.
  if (matched) {
    const published = await fetchStamp(genuine.id, { pins });
    report.example_stamp = published;
    const v = await verifyStamp(published, STAMP_TEXT, { id: genuine.id, pins });
    check('verify: public stamp fetched by id verifies against the pinned enclave key and the text', v.verdict === 'MATCH',
      `${v.verdict}: ${v.checks.map((c) => `${c.key}=${c.ok ? 'pass' : 'FAIL'}`).join(' ')}`);
    const edited = await verifyStamp(published, STAMP_TEXT.replace('human', 'robot'), { id: genuine.id, pins });
    check('verify: the same stamp does not verify for edited text', edited.verdict === 'NO_MATCH', `${edited.verdict} for "…me, a robot, on…"`);
    const r = v.record;
    check('verify: the stamp names the account, text hash, score and the call that issued it',
      r.account === alice.accountId && r.call_id === stampCall?.call_id, `call_id ${r.call_id}`);
    check('verify: record v2 has the hash and length of the canonical text and the enclave version',
      r.v === 2 && r.text_chars === [...STAMP_TEXT].length && r.text_sha256 === await sha256Hex(canonicalText(STAMP_TEXT)) && r.enclave === enclaveVersion,
      `v=${r.v} text_chars=${r.text_chars} enclave=${r.enclave}`);
    const before = `Earlier text, a name.  ${STAMP_TEXT.replace(', a human,', ',  a human,').replace(' one key', '\none key')} `;
    const around = await verifyStamp(published, before, { id: genuine.id, pins });
    check('verify (rule v2): MATCH with earlier text, double spaces and a newline before the tag; it covers exactly the stamped text',
      around.verdict === 'MATCH' && around.covered === STAMP_TEXT && coveredText(before, r.text_chars, r.v) === STAMP_TEXT,
      `${around.verdict}, covers "${around.covered}"`);
  }
  const v1 = await verifyStamp(await fetchStamp(V1_STAMP.id), V1_STAMP.text, { id: V1_STAMP.id });
  check(`verify: the v0.1 stamp ${V1_STAMP.id} (record v1) still verifies -> MATCH`, v1.verdict === 'MATCH', `${v1.verdict}, record v${v1.record?.v}`);

  // 5. Side by side: alice's further stamps (one after another: each one updates her
  //    fingerprint), the refusals (none touches a fingerprint), bob's stamp.
  await together([
    ['alice', async (check) => {
      // Bob types on alice's phone (alice's key signs, bob's fingers type) -> NO_MATCH.
      const impostor = await ntk.request('stamp', { ...alice, transportPk: T, session: bobTypes.session(STAMP_TEXT, 502) });
      check('stamp: someone else typing on alice\'s account -> NO_MATCH, no signature',
        impostor.verdict === 'NO_MATCH' && !impostor.stamp && impostor.code === 'R_MISMATCH',
        `${impostor.code} ${impostor.reason ?? impostor.error} (score ${impostor.score_pct}%)`);
      // Pasted text: the session mostly inserts text instead of typing it.
      const pasted = aliceTypes.session('Sure.', 507);
      pasted.events.push({ ins: ' ' + STAMP_TEXT + ' ' + ENROLL_TEXTS[0] });
      pasted.events.push(...aliceTypes.session(' ok thanks a lot for the help with this', 508).events);
      const pasteRes = await ntk.request('stamp', { ...alice, transportPk: T, session: pasted });
      check('stamp: mostly pasted text -> NO_MATCH', pasteRes.verdict === 'NO_MATCH' && pasteRes.code === 'R_PASTED',
        `${pasteRes.code} ${pasteRes.reason ?? pasteRes.error} (typed ${pasteRes.typed_pct}%)`);
      // Too short to say anything.
      const short = await ntk.request('stamp', { ...alice, transportPk: T, session: aliceTypes.session('ok cool', 509) });
      check('stamp: a 7-character reply -> NO_MATCH (too short to tell)', short.verdict === 'NO_MATCH' && short.code === 'R_TOO_SHORT',
        `${short.code} ${short.reason ?? short.error}`);
      // The demo feed's reply, typed by alice: a real stamp for the demo.
      const demo = await ntk.request('stamp', { ...alice, transportPk: T, session: aliceTypes.session(DEMO_REPLY, 512) });
      check('stamp: alice types the demo reply -> MATCH', demo.verdict === 'MATCH', demo.tag ?? `${demo.code} ${demo.reason ?? demo.error}`);
      if (demo.verdict === 'MATCH') {
        report.demo_stamp = { id: demo.id, tag: demo.tag, text: DEMO_REPLY };
        const dv = await verifyStamp(await fetchStamp(demo.id, { pins }), `${DEMO_REPLY} `, { id: demo.id, pins });
        check('verify: the demo stamp is MATCH for the demo reply', dv.verdict === 'MATCH' && dv.covered === DEMO_REPLY,
          `${dv.verdict}, ${demo.tag} covers "${dv.covered}"`);
      }
      // Status reports progress, never the fingerprint.
      const st1 = await ntk.request('status', alice);
      check('status: counts only, no fingerprint data', st1.ok && noFingerprintIn(st1),
        `sessions=${st1.sessions} taps=${st1.taps} stamps=${st1.stamps} failed_24h=${st1.failed_24h} modes=${JSON.stringify(st1.modes)}`);
    }],
    // Bob's key cannot speak for alice's account.
    ['bob\'s key for alice', (check) => expectError(check, 'auth: bob\'s key claiming alice\'s account is refused',
      () => ntk.request('stamp', { accountId: alice.accountId, keyPair: bob.keyPair, transportPk: T, session: aliceTypes.session(STAMP_TEXT, 503) }),
      'E_AUTH_KEY_NOT_FOUND', /not an access key/)],
    // Replaying alice's exact stamp request is refused.
    stampCall && ['replay', (check) => expectError(check, 'replay: re-sending alice\'s signed stamp request is refused',
      () => ntk.call(stampCall.input).then((r) => r.output), 'E_REPLAY', /replayed|out-of-order/)],
    // A sealed session cannot be moved to another operation or account.
    ['sealed for enroll', (check) => expectError(check, 'transport: a session sealed for enroll does not open as a stamp',
      () => ntk.request('stamp', { ...alice, sealedOverride: seal(T, aliceTypes.session(STAMP_TEXT, 504), 'enroll', alice.accountId) }),
      'E_SEALED_OPEN', /does not open/)],
    ['sealed for alice', (check) => expectError(check, 'transport: a session sealed for alice does not open for bob',
      () => ntk.request('enroll', { ...bob, sealedOverride: seal(T, aliceTypes.session(STAMP_TEXT, 505), 'enroll', alice.accountId) }),
      'E_SEALED_OPEN', /does not open/)],
    // Tampered ciphertext (re-signed by alice so only the ciphertext is wrong).
    ['tampered', (check) => {
      const good = seal(T, aliceTypes.session(STAMP_TEXT, 506), 'stamp', alice.accountId);
      const bytes = Buffer.from(good.ct, 'base64');
      bytes[10] ^= 1;
      return expectError(check, 'transport: a tampered sealed session is refused',
        () => ntk.request('stamp', { ...alice, sealedOverride: { ...good, ct: bytes.toString('base64') } }), 'E_SEALED_OPEN', /does not open/);
    }],
    // Bob, an implicit account, stamps his own typing.
    ['bob', async (check) => {
      const bobStamp = await ntk.request('stamp', { ...bob, transportPk: T, session: bobTypes.session(STAMP_TEXT, 510) });
      check('stamp: bob (implicit account) typing as bob -> MATCH', bobStamp.verdict === 'MATCH' && bobStamp.tag === `[NTK ${bobStamp.id}]`,
        bobStamp.tag ?? `${bobStamp.code} ${bobStamp.reason ?? bobStamp.error}`);
    }],
    // A key alice issued to NTK may act for her.
    fc && ['function-call key for NTK', async (check) => {
      const viaNtkKey = await ntk.request('status', { accountId: alice.accountId, keyPair: KeyPair.fromString(fc.fc_ntk.private_key) });
      check('auth: a function-call key alice issued to NTK (nearthekeyboard.testnet) can act for her', viaNtkKey.ok && viaNtkKey.enrolled,
        viaNtkKey.error ? `${viaNtkKey.code} ${viaNtkKey.error}` : 'accepted');
    }],
  ].filter(Boolean));

  // 6. Independent attestation check of the stamp call: Intel TDX quote, approved build,
  //    and that the quote commits to exactly this request and this response.
  if (stampCall && matched) {
    report.attestation = await attest(stampCall);
    const a = report.attestation;
    const layers = ['authenticity', 'identity', 'binding', 'input', 'output'];
    const passed = a && !a.error && layers.every((l) => a[l]?.verdict === 'pass');
    check('attestation: outlayer-verify proves the stamp call ran this wasm in Intel TDX, bound to this exact input/output', passed,
      passed ? layers.map((l) => `${l}=pass`).join(' ') + ` (task ${a.task_id}, TCB ${a.tcb_status})` : JSON.stringify(a).slice(0, 300));
  }
}

/** outlayer-verify on one call, with its exact input and output; one retry, since the quote can lag the call. */
async function attest(call) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntk-verify-'));
  try {
    const inFile = path.join(dir, 'input.json');
    const outFile = path.join(dir, 'output.json');
    fs.writeFileSync(inFile, JSON.stringify(call.input));
    fs.writeFileSync(outFile, JSON.stringify(call.output));
    for (let attempt = 1; ; attempt++) {
      try {
        // A non-zero exit throws (1 = a layer failed, 2 = unproven), so returning here means exit 0.
        const out = execFileSync('outlayer-verify', ['call', call.call_id, '--network', 'testnet', '--api', env.NTK_API,
          '--rpc', 'https://rpc.testnet.fastnear.com', '--input', inFile, '--output', outFile, '--json'], { encoding: 'utf8', timeout: 240000 });
        return JSON.parse(out);
      } catch (e) {
        if (attempt >= 2) return { error: (e.stdout || e.message).toString().slice(0, 600) };
        await sleep(30000);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (e) {
  check('suite: a call failed, so the rest of the suite did not run', false, String(e.message).slice(0, 400));
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed in ${clock()}`);
if (report.demo_stamp) console.log(`demo stamp: ${report.demo_stamp.text} ${report.demo_stamp.tag}`);
fs.writeFileSync(new URL('./e2e-report.json', import.meta.url), JSON.stringify({
  ...report,
  minutes: Number(((Date.now() - started) / 60000).toFixed(1)),
  calls: ntk.calls.map(({ op, call_id, attestation_url, ms, time_ms }) => ({ op, call_id, attestation_url, ms, time_ms })),
  results,
}, null, 2));
process.exit(failed.length ? 1 : 0);

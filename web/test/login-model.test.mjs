// The wallet login's logic (web/login/src/model.js): what the app's link may
// carry, the one transaction the wallet is asked for (checked against a mocked
// wallet), the on-chain check, and the address the browser goes back to.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  NTK_LOGIN, decodeBase58, parsePublicKey, parseReturnUrl, parseRequest, isAccountId,
  addKeyAction, addKeyTransaction, redirectUrl, viewAccessKeyBody, keyStateFromRpc,
  fetchKeyState, outcomeFailure, outcomeSucceeded, errorText, addNtkKey,
} from '../login/src/model.js';
import { WALLET_IDS, WALLET_MANIFEST } from '../login/src/wallets.js';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = `1${s}`; }
  return s;
}
const bytes = (len, fill = 7) => new Uint8Array(len).fill(fill);

// The NTK stamp key: a real ed25519 key, 32 bytes.
const PK = 'ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG';
const ACCOUNT = 'ntk-alice.testnet';
const hashOf = (q) => `#${new URLSearchParams(q)}`;

// ---- the link -------------------------------------------------------------

test('base58: decodes, keeps leading zero bytes, refuses other characters', () => {
  assert.equal(decodeBase58(PK.slice(8)).length, 32);
  const withZeros = new Uint8Array([0, 0, 5, 200]);
  assert.deepEqual(decodeBase58(b58(withZeros)), withZeros);
  assert.deepEqual(decodeBase58('1'.repeat(32)), new Uint8Array(32));
  for (const bad of ['0abc', 'Oabc', 'Iabc', 'labc', 'ab+c']) assert.throws(() => decodeBase58(bad), bad);
});

test('the key: ed25519, base58, exactly 32 bytes', () => {
  assert.deepEqual(parsePublicKey(PK), { ok: true, publicKey: PK });
  assert.equal(parsePublicKey(`ed25519:${b58(bytes(32, 0))}`).ok, true, 'all-zero key: 32 ones');
  assert.equal(parsePublicKey(`ed25519:${b58(bytes(32, 255))}`).ok, true);
  const fails = {
    missing: [undefined, 'no key'],
    empty: ['', 'no key'],
    'no prefix': [PK.slice(8), 'ed25519'],
    'other curve': [`secp256k1:${PK.slice(8)}`, 'ed25519'],
    'upper-case prefix': [`ED25519:${PK.slice(8)}`, 'ed25519'],
    'not base58': ['ed25519:0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OI', 'ed25519'],
    'space inside': [`ed25519:${PK.slice(8, 20)} ${PK.slice(20)}`, 'ed25519'],
    '31 bytes': [`ed25519:${b58(bytes(31))}`, '31 bytes'],
    '33 bytes': [`ed25519:${b58(bytes(33))}`, '33 bytes'],
    '64 bytes (a secret key)': [`ed25519:${b58(bytes(64))}`, '64 bytes'],
  };
  for (const [name, [value, words]] of Object.entries(fails)) {
    const r = parsePublicKey(value);
    assert.equal(r.ok, false, name);
    assert.ok(r.error.includes(words), `${name}: ${r.error}`);
  }
});

test('the return address: ntk:// only', () => {
  for (const ok of ['ntk://auth', 'ntk://auth/', 'ntk://auth/done', 'ntk://auth?state=Ab-9_x', 'ntk://auth?a=1&b=2']) {
    assert.deepEqual(parseReturnUrl(ok), { ok: true, url: ok }, ok);
  }
  for (const bad of [undefined, '', 'https://ntk.tools/', 'http://evil.example/ntk://auth', 'javascript:alert(1)',
    'intent://auth#Intent;scheme=ntk;end', 'NTK://auth', 'ntk:auth', 'ntk://', 'ntk:///auth', 'ntk://auth#x',
    'ntk://auth?x=<b>', 'ntk://au th', ' ntk://auth', 'ntk://auth\n', `ntk://${'a'.repeat(260)}`, 'ntkx://auth', 'data:text/html,hi']) {
    assert.equal(parseReturnUrl(bad).ok, false, String(bad));
  }
});

test('the request in the fragment: the app\'s exact link, and what goes wrong', () => {
  // What the app opens: values URL-encoded.
  const link = `#pk=${encodeURIComponent(PK)}&return=${encodeURIComponent('ntk://auth')}&network=testnet`;
  assert.deepEqual(parseRequest(link), { ok: true, publicKey: PK, returnUrl: 'ntk://auth', network: 'testnet' });
  // Not encoded works too, and network defaults to testnet.
  assert.deepEqual(parseRequest(`#pk=${PK}&return=ntk://auth`), { ok: true, publicKey: PK, returnUrl: 'ntk://auth', network: 'testnet' });
  assert.equal(parseRequest(hashOf({ pk: PK, return: 'ntk://auth', network: 'testnet', debug: '1' })).ok, true, 'extra fields are ignored');

  const r = parseRequest(hashOf({ pk: 'ed25519:abc', return: 'https://evil.example/', network: 'mainnet' }));
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors.join(' '), /bytes long|not valid/);
  assert.match(r.errors.join(' '), /ntk:\/\//);
  assert.match(r.errors.join(' '), /testnet only/);
  assert.deepEqual(parseRequest('').errors.length, 2, 'nothing at all: no key, no return address');
  assert.equal(parseRequest(undefined).ok, false);
});

test('account ids', () => {
  for (const ok of [ACCOUNT, 'a1', 'alice.testnet', 'sub.alice.testnet', 'a-b_c.testnet', 'f'.repeat(64), `0x${'a'.repeat(40)}`]) {
    assert.ok(isAccountId(ok), ok);
  }
  for (const bad of ['', 'a', 'Alice.testnet', 'alice..testnet', '.alice', 'alice.', 'al ice', 'a'.repeat(65), 'alice@testnet', null, 42]) {
    assert.ok(!isAccountId(bad), String(bad));
  }
});

// ---- the transaction ---------------------------------------------------------

test('the transaction: from the account to itself, ONE AddKey, a function-call key for NTK, 0.1 NEAR allowance', () => {
  const tx = addKeyTransaction(ACCOUNT, PK);
  assert.equal(tx.signerId, ACCOUNT);
  assert.equal(tx.receiverId, ACCOUNT, 'sent to the account itself');
  assert.equal(tx.actions.length, 1, 'one action');
  const [action] = tx.actions;
  assert.equal(action.type, 'AddKey');
  assert.equal(action.params.publicKey, PK);
  assert.equal(action.params.gasKeyInfo, undefined, 'a plain key, not a gas key');
  const { permission } = action.params.accessKey;
  assert.notEqual(permission, 'FullAccess');
  assert.equal(permission.receiverId, 'nearthekeyboard.testnet');
  assert.deepEqual(permission.methodNames, [], 'any method of that receiver');
  assert.equal(permission.allowance, '100000000000000000000000');
  assert.equal(BigInt(permission.allowance), 10n ** 24n / 10n, '0.1 NEAR in yoctoNEAR');
  assert.equal(NTK_LOGIN.allowanceNear, '0.1');
  // The exact JSON the wallets receive (Meteor converts it with near-api-js, Intear parses it with serde).
  assert.equal(JSON.stringify(action),
    `{"type":"AddKey","params":{"publicKey":"${PK}","accessKey":{"permission":{"receiverId":"nearthekeyboard.testnet","allowance":"100000000000000000000000","methodNames":[]}}}}`);
  assert.throws(() => addKeyTransaction('Not An Account', PK));
  assert.throws(() => addKeyAction('ed25519:short'));
});

test('the transaction passes the connector unchanged, for both wallets', (t) => {
  const pkg = new URL('../login/node_modules/@hot-labs/near-connect/build/index.js', import.meta.url);
  if (!fs.existsSync(pkg)) return t.skip('web/login/node_modules is not installed (cd web/login && npm ci)');
  const nc = createRequire(import.meta.url)(pkg.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const { actions } = addKeyTransaction(ACCOUNT, PK);
  // SandboxWallet.signAndSendTransaction runs exactly these two before it posts to the wallet's iframe.
  assert.deepEqual(nc.nearActionsToConnectorActions(actions), actions);
  for (const w of WALLET_MANIFEST.wallets) assert.doesNotThrow(() => nc.assertGasKeyActionsSupported(w.features, actions, w.name), w.id);
});

test('back to the app: <return>?account_id=…&public_key=<urlencoded>', () => {
  const url = redirectUrl('ntk://auth', ACCOUNT, PK);
  assert.equal(url, `ntk://auth?account_id=${ACCOUNT}&public_key=ed25519%3A${PK.slice(8)}`);
  const u = new URL(url); // what the app does with it
  assert.equal(u.protocol, 'ntk:');
  assert.equal(u.searchParams.get('account_id'), ACCOUNT);
  assert.equal(u.searchParams.get('public_key'), PK);
  assert.equal(redirectUrl('ntk://auth?state=x', ACCOUNT, PK), `ntk://auth?state=x&account_id=${ACCOUNT}&public_key=ed25519%3A${PK.slice(8)}`);
  assert.equal(redirectUrl('ntk://auth', 'f'.repeat(64), PK).startsWith(`ntk://auth?account_id=${'f'.repeat(64)}&`), true);
  assert.throws(() => redirectUrl('https://evil.example/', ACCOUNT, PK), /ntk:\/\//);
  assert.throws(() => redirectUrl('ntk://auth', 'Evil Account', PK), /account/);
  assert.throws(() => redirectUrl('ntk://auth', ACCOUNT, 'ed25519:abc'), /public key/);
});

// ---- the chain -----------------------------------------------------------------

// Answers as FastNEAR's testnet RPC gives them (2026-11-13).
const RPC = {
  missing: { jsonrpc: '2.0', id: 'x', result: { block_hash: 'h', block_height: 1, error: `access key ${PK} does not exist while viewing`, logs: [] } },
  missingNew: { jsonrpc: '2.0', id: 'x', error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCESS_KEY', info: {} }, code: -32000, message: 'Server error', data: 'Access key not found' } },
  noAccount: { jsonrpc: '2.0', id: 'x', error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCOUNT', info: {} }, code: -32000, message: 'Server error' } },
  ntk: { jsonrpc: '2.0', id: 'x', result: { nonce: 1, permission: { FunctionCall: { allowance: '100000000000000000000000', method_names: [], receiver_id: 'nearthekeyboard.testnet' } }, block_height: 2, block_hash: 'h' } },
  other: { jsonrpc: '2.0', id: 'x', result: { nonce: 1, permission: { FunctionCall: { allowance: '250000000000000000000000', method_names: [], receiver_id: 'wrap.testnet' } }, block_height: 2, block_hash: 'h' } },
  full: { jsonrpc: '2.0', id: 'x', result: { nonce: 1, permission: 'FullAccess', block_height: 2, block_hash: 'h' } },
  busy: { jsonrpc: '2.0', id: 'x', error: { name: 'INTERNAL_ERROR', cause: { name: 'INTERNAL_ERROR' }, code: -32000, message: 'Server error', data: 'timeout' } },
};

test('reading the key on chain: the request and what each answer means', () => {
  assert.deepEqual(viewAccessKeyBody(ACCOUNT, PK).params, { request_type: 'view_access_key', finality: 'optimistic', account_id: ACCOUNT, public_key: PK });
  assert.equal(keyStateFromRpc(RPC.missing).state, 'missing');
  assert.equal(keyStateFromRpc(RPC.missingNew).state, 'missing');
  assert.equal(keyStateFromRpc(RPC.noAccount).state, 'missing');
  assert.deepEqual(keyStateFromRpc(RPC.ntk), { state: 'ntk', allowance: '100000000000000000000000', methodNames: [] });
  assert.deepEqual(keyStateFromRpc(RPC.other), { state: 'other', receiverId: 'wrap.testnet' });
  assert.equal(keyStateFromRpc(RPC.full).state, 'full');
  assert.equal(keyStateFromRpc(RPC.busy).state, 'error');
  assert.equal(keyStateFromRpc(null).state, 'error');
  assert.equal(keyStateFromRpc({ result: {} }).state, 'error');
});

/** A fetch that answers the RPC from a script of states, and records each request. */
function fakeRpc(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const next = script.length > 1 ? script.shift() : script[0];
    if (next === 'down') throw new TypeError('fetch failed');
    if (next === 'http500') return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => RPC[next] };
  };
  return { fetchImpl, calls };
}

/** A wallet that records what it is asked to sign. */
function fakeWallet(answer) {
  const calls = [];
  return {
    calls,
    manifest: { id: 'meteor-wallet', name: 'Meteor Wallet' },
    async signAndSendTransaction(params) {
      calls.push(JSON.parse(JSON.stringify(params)));
      if (answer instanceof Error || typeof answer === 'string') throw answer;
      return typeof answer === 'function' ? answer() : answer;
    },
  };
}

const SUCCESS = { status: { SuccessValue: '' }, transaction: { hash: 'h' } };
const run = (wallet, rpc, extra = {}) => addNtkKey({
  wallet, accountId: ACCOUNT, publicKey: PK, fetchImpl: rpc.fetchImpl, sleep: async () => {}, polls: 5, ...extra,
});

test('the mocked wallet is asked for exactly the one transaction, and the key is confirmed on chain', async () => {
  const wallet = fakeWallet(SUCCESS);
  const rpc = fakeRpc(['missing', 'missing', 'ntk']);
  const steps = [];
  const r = await run(wallet, rpc, { onStep: (s) => steps.push(s) });
  assert.deepEqual(r, { ok: true, already: false });
  assert.deepEqual(steps, ['precheck', 'wallet', 'confirm']);
  assert.equal(wallet.calls.length, 1);
  const [tx] = wallet.calls;
  assert.deepEqual(tx, addKeyTransaction(ACCOUNT, PK));
  assert.equal(tx.receiverId, ACCOUNT);
  assert.equal(tx.actions[0].type, 'AddKey');
  assert.equal(tx.actions[0].params.publicKey, PK);
  assert.equal(tx.actions[0].params.accessKey.permission.receiverId, 'nearthekeyboard.testnet');
  assert.equal(tx.actions[0].params.accessKey.permission.allowance, '100000000000000000000000');
  assert.equal(rpc.calls.length, 3, 'one check before, polls after');
  for (const c of rpc.calls) {
    assert.equal(c.url, 'https://rpc.testnet.fastnear.com');
    assert.deepEqual(c.body.params, { request_type: 'view_access_key', finality: 'optimistic', account_id: ACCOUNT, public_key: PK });
  }
});

test('a key already on the account: no wallet at all', async () => {
  for (const state of ['ntk', 'full']) {
    const wallet = fakeWallet(SUCCESS);
    assert.deepEqual(await run(wallet, fakeRpc([state])), { ok: true, already: true }, state);
    assert.equal(wallet.calls.length, 0, state);
  }
});

test('the key already there for another receiver: refused, no wallet', async () => {
  const wallet = fakeWallet(SUCCESS);
  const r = await run(wallet, fakeRpc(['other']));
  assert.equal(r.ok, false);
  assert.match(r.error, /wrap\.testnet/);
  assert.equal(wallet.calls.length, 0);
});

test('the user rejects in the wallet: the error, after a short look at the chain', async () => {
  const wallet = fakeWallet(new Error('User rejected the transaction'));
  const rpc = fakeRpc(['missing']);
  const r = await run(wallet, rpc);
  assert.equal(r.ok, false);
  assert.match(r.error, /User rejected the transaction/);
  assert.ok(rpc.calls.length <= 4, `${rpc.calls.length} RPC calls`);
});

test('the wallet throws after it sent the transaction (window closed): the chain decides', async () => {
  const r = await run(fakeWallet(new Error('Wallet closed')), fakeRpc(['missing', 'missing', 'ntk']));
  assert.deepEqual(r, { ok: true, already: false });
});

test('a failed transaction: its reason; unless the key is there after all', async () => {
  const fail = (kind) => ({ status: { Failure: { ActionError: { index: 0, kind } } } });
  let r = await run(fakeWallet(fail({ LackBalanceForState: { account_id: ACCOUNT, amount: '1' } })), fakeRpc(['missing']));
  assert.equal(r.ok, false);
  assert.match(r.error, /LackBalanceForState/);
  r = await run(fakeWallet(fail({ AddKeyAlreadyExists: { account_id: ACCOUNT, public_key: PK } })), fakeRpc(['missing', 'ntk']));
  assert.deepEqual(r, { ok: true, already: false });
});

test('the RPC is down: a wallet success still returns (the app checks again), a wallet error does not', async () => {
  assert.deepEqual(await run(fakeWallet(SUCCESS), fakeRpc(['down'])), { ok: true, already: false, unconfirmed: true });
  let r = await run(fakeWallet(new Error('User rejected the transaction')), fakeRpc(['down']));
  assert.equal(r.ok, false);
  r = await run(fakeWallet(undefined), fakeRpc(['http500']));
  assert.equal(r.ok, false);
  assert.match(r.error, /could not be confirmed/);
});

test('the wallet returns nothing and no key appears: an error, not a redirect', async () => {
  const rpc = fakeRpc(['missing']);
  const r = await run(fakeWallet(undefined), rpc);
  assert.equal(r.ok, false);
  assert.match(r.error, /not on your account/);
  assert.equal(rpc.calls.length, 1 + 5, 'it waited the whole poll');
});

test('fetchKeyState and the small helpers', async () => {
  assert.equal((await fetchKeyState(ACCOUNT, PK, { fetchImpl: fakeRpc(['ntk']).fetchImpl })).state, 'ntk');
  assert.match((await fetchKeyState(ACCOUNT, PK, { fetchImpl: fakeRpc(['down']).fetchImpl })).error, /did not answer/);
  assert.match((await fetchKeyState(ACCOUNT, PK, { fetchImpl: fakeRpc(['http500']).fetchImpl })).error, /HTTP 500/);
  assert.equal(outcomeFailure(SUCCESS), null);
  assert.equal(outcomeFailure(undefined), null);
  assert.match(outcomeFailure({ status: { Failure: { InvalidTxError: 'Expired' } } }), /Expired/);
  assert.ok(outcomeSucceeded(SUCCESS));
  assert.ok(!outcomeSucceeded({ status: 'NotStarted' }));
  assert.equal(errorText('plain'), 'plain');
  assert.equal(errorText(new Error('boom')), 'boom');
  assert.equal(errorText({ code: 4001 }), '{"code":4001}');
  assert.equal(errorText(null), 'unknown error');
});

// ---- the wallets ---------------------------------------------------------------

test('the pinned wallets: Meteor and Intear, testnet, able to sign and send', () => {
  assert.deepEqual([...WALLET_IDS], ['meteor-wallet', 'intear-wallet']);
  assert.deepEqual(WALLET_MANIFEST.wallets.map((w) => w.id), WALLET_IDS);
  for (const w of WALLET_MANIFEST.wallets) {
    assert.equal(w.type, 'sandbox', w.id);
    assert.equal(w.features.testnet, true, `${w.id} works on testnet`);
    assert.equal(w.features.signAndSendTransaction, true, w.id);
    assert.ok(!w.permissions.walletConnect, `${w.id} needs no WalletConnect project`);
    assert.match(w.executor, /^https:\/\//, w.id);
  }
});

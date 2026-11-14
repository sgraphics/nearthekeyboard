// The NEAR networks (web/lib/networks.js): testnet's pins as they have always
// been, mainnet's addresses, mainnet switched off until both of its keys are
// pinned, and docs/protocol.md's Constants table saying the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  NETWORKS, DEFAULT_NETWORK, isAvailable, hasStampKey, hasTransportKey, availableNetworks, joinNames,
} from '../lib/networks.js';

const STAMP_PK = 'ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG';
const TRANSPORT_PK = '4443a5935e077902ff3afc6a4d188c53168b8ec9bd9b0b847b4d1006ab95b729';

test('testnet: the default, available, with the pins it has always had', () => {
  assert.equal(DEFAULT_NETWORK, 'testnet');
  assert.deepEqual({ ...NETWORKS.testnet }, {
    network: 'testnet', api: 'https://testnet-api.outlayer.ai', project: 'nearthekeyboard.testnet/ntk',
    owner: 'nearthekeyboard.testnet', rpc: 'https://rpc.testnet.fastnear.com', stampPk: STAMP_PK, transportPk: TRANSPORT_PK,
  });
  assert.ok(isAvailable(NETWORKS.testnet));
  assert.equal(availableNetworks()[0], NETWORKS.testnet, 'the default comes first');
  assert.ok(Object.isFrozen(NETWORKS) && Object.isFrozen(NETWORKS.testnet) && Object.isFrozen(NETWORKS.mainnet));
});

test('mainnet: its addresses; available exactly when both keys are pinned', () => {
  const m = NETWORKS.mainnet;
  assert.deepEqual([m.network, m.api, m.project, m.owner, m.rpc],
    ['mainnet', 'https://api.outlayer.ai', 'nearthekeyboard.near/ntk', 'nearthekeyboard.near', 'https://rpc.mainnet.fastnear.com']);
  assert.equal(m.project.split('/')[0], m.owner, 'the owner is the project\'s account');
  assert.equal(isAvailable(m), m.stampPk != null && m.transportPk != null);
  assert.deepEqual(availableNetworks().map((n) => n.network), isAvailable(m) ? ['testnet', 'mainnet'] : ['testnet']);
  const pinned = { ...m, stampPk: STAMP_PK, transportPk: 'cd'.repeat(32) };
  assert.ok(isAvailable(pinned));
  assert.deepEqual(availableNetworks({ mainnet: pinned, testnet: NETWORKS.testnet }).map((n) => n.network), ['testnet', 'mainnet']);
  for (const half of [{ ...pinned, stampPk: null }, { ...pinned, transportPk: null }, { ...m, stampPk: null, transportPk: null }]) {
    assert.equal(isAvailable(half), false, 'one key alone does not switch it on');
  }
});

test('every pinned key is well-formed: a mistyped key fails here instead of leaving a network silently off', () => {
  for (const n of Object.values(NETWORKS)) {
    assert.ok(n.stampPk === null || hasStampKey(n), `${n.network}: stampPk is null or ed25519:<base58>, not ${n.stampPk}`);
    assert.ok(n.transportPk === null || hasTransportKey(n), `${n.network}: transportPk is null or 64 lowercase hex, not ${n.transportPk}`);
    assert.equal(n.stampPk === null, n.transportPk === null, `${n.network}: pin both keys, or neither`);
  }
  assert.ok(!hasStampKey({ stampPk: 'HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG' }), 'the ed25519: prefix is part of it');
  assert.ok(!hasStampKey({ stampPk: 'ed25519:0OIl' }));
  assert.ok(!hasTransportKey({ transportPk: TRANSPORT_PK.toUpperCase() }));
  assert.ok(!hasTransportKey({ transportPk: TRANSPORT_PK.slice(2) }));
});

test('joinNames', () => {
  assert.equal(joinNames(['testnet']), 'testnet');
  assert.equal(joinNames(['testnet', 'mainnet']), 'testnet and mainnet');
  assert.equal(joinNames(['testnet', 'mainnet'], 'or'), 'testnet or mainnet');
  assert.equal(joinNames(['a', 'b', 'c']), 'a, b and c');
  assert.equal(joinNames([]), '');
});

test('docs/protocol.md: the Constants table has the same values, mainnet keys "to be pinned" until they are', () => {
  const doc = fs.readFileSync(new URL('../../docs/protocol.md', import.meta.url), 'utf8');
  const rows = Object.fromEntries([...doc.matchAll(/^\| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \|$/gm)].map((m) => [m[1], [m[2], m[3]]]));
  const cell = (v, prefix = '') => (v == null ? 'to be pinned' : `${prefix}\`${v}\``);
  const want = (n) => ({
    'OutLayer project': cell(n.project),
    'Project owner': cell(n.owner),
    'OutLayer API': cell(n.api),
    'NEAR RPC': cell(n.rpc),
    'Stamp key (pinned)': cell(n.stampPk),
    'Transport key (pinned)': cell(n.transportPk, 'X25519 '),
  });
  assert.deepEqual(rows.Name, ['Testnet', 'Mainnet'], 'a column per network');
  for (const [i, n] of [NETWORKS.testnet, NETWORKS.mainnet].entries()) {
    for (const [name, value] of Object.entries(want(n))) assert.equal(rows[name]?.[i], value, `${n.network}: ${name}`);
  }
  assert.deepEqual(rows.Relay, ['`https://ntk.tools/api`', '`https://ntk.tools/api/mainnet`']);
});

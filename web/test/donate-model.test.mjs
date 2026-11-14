// The donation page's logic (web/login/src/donate-model.js): only the offered
// amounts, exact yoctoNEAR, one Transfer to the project's mainnet account.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DONATE_TO, DONATE_NETWORK, AMOUNTS, DEFAULT_AMOUNT, parseAmount, yoctoFor, donationTransaction, outcomeTxHash, explorerUrl,
} from '../login/src/donate-model.js';

test('the offered amounts and where they go', () => {
  assert.deepEqual([...AMOUNTS], [5, 25, 50]);
  assert.equal(DEFAULT_AMOUNT, 25);
  assert.equal(DONATE_TO, 'nearthekeyboard.near');
  assert.equal(DONATE_NETWORK, 'mainnet');
});

test('a link picks one of the offered amounts; anything else gives the default', () => {
  assert.equal(parseAmount('#amount=5'), 5);
  assert.equal(parseAmount('#amount=50'), 50);
  assert.equal(parseAmount('amount=25'), 25);
  assert.equal(parseAmount('#x=1&amount=5'), 5);
  for (const h of ['', '#', '#amount=', '#amount=500', '#amount=5000', '#amount=7', '#amount=-5', '#amount=5.5', '#amount=05x', '#xamount=5', null]) {
    assert.equal(parseAmount(h), DEFAULT_AMOUNT, String(h));
  }
});

test('yoctoNEAR is exact, for offered amounts only', () => {
  assert.equal(yoctoFor(5), '5000000000000000000000000');
  assert.equal(yoctoFor(25), '25000000000000000000000000');
  assert.equal(yoctoFor(50), '50000000000000000000000000');
  for (const n of [0, 1, 7, 500, 5.5, '5']) assert.throws(() => yoctoFor(n), /not an offered amount/);
});

test('one transaction, one Transfer action, to the project account', () => {
  assert.deepEqual(donationTransaction('alice.near', 25), {
    signerId: 'alice.near',
    receiverId: 'nearthekeyboard.near',
    actions: [{ type: 'Transfer', params: { deposit: '25000000000000000000000000' } }],
  });
});

test('the transaction hash from a wallet answer, and its explorer link', () => {
  const hash = '6Yv1sG2EbXzwHt8dJ8LFFi9RaUbyhzkmb3yp6VqP1y9K';
  assert.equal(outcomeTxHash({ transaction: { hash } }), hash);
  assert.equal(outcomeTxHash([{ transaction_outcome: { id: hash } }]), hash);
  for (const o of [null, undefined, {}, { transaction: { hash: 'not a hash' } }, 'x']) assert.equal(outcomeTxHash(o), null);
  assert.equal(explorerUrl(hash), `https://nearblocks.io/txns/${hash}`);
});

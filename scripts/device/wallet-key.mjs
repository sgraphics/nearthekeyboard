#!/usr/bin/env node
// Test the app's side of the wallet login without a wallet (TODO.md 3.4, T.4).
// Does what the login page's wallet does: makes a fresh testnet account with the
// faucet (its key goes to ~/.near-credentials/testnet/, never into the repo),
// adds the app's public key to it as a function-call key for
// nearthekeyboard.testnet, and prints the link the login page would open.
//
//   node scripts/device/wallet-key.mjs <app public key "ed25519:…"> [account]
//   adb shell am start -a android.intent.action.VIEW -d "'<printed link>'"
//
// The app's key: bash scripts/device/wallet-login.sh does all of it.
import { createTestnetAccount, account, provider } from '../../client/near.mjs';
import crypto from 'node:crypto';

const [pk, name] = process.argv.slice(2);
if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(pk || '')) {
  console.error('usage: node scripts/device/wallet-key.mjs <ed25519:public key> [account.testnet]');
  process.exit(2);
}
const accountId = name || `ntkw-${crypto.randomBytes(4).toString('hex')}.testnet`;
const RECEIVER = 'nearthekeyboard.testnet';

const made = await createTestnetAccount(accountId);
console.error(`${made.created ? 'created' : 'using'} ${accountId}`);
const res = await account(accountId).addFunctionCallAccessKey({ publicKey: pk, contractId: RECEIVER, methodNames: [] });
console.error(`added the key as a function-call key for ${RECEIVER}: tx ${res.transaction?.hash ?? res.transaction_outcome?.id ?? '?'}`);
// The app checks with finality "final", a few blocks after the transaction: wait for that too.
let key = null;
for (let i = 0; i < 20 && !key; i++) {
  try {
    key = await provider.query({ request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: pk });
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
  }
}
if (!key) throw new Error('the key did not show up on chain');
console.error(`on chain (final): ${JSON.stringify(key.permission)}`);
console.log(`ntk://auth?account_id=${encodeURIComponent(accountId)}&public_key=${encodeURIComponent(pk)}`);

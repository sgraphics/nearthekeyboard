#!/usr/bin/env node
// Test the app's side of the wallet login without a wallet (TODO.md 3.4, T.4).
// Does what the login page's wallet does: makes a fresh testnet account (its
// key goes to ~/.near-credentials/testnet/, never into the repo), adds the
// app's public key to it as a function-call key for nearthekeyboard.testnet,
// and prints the link the login page would open.
//
//   node scripts/device/wallet-key.mjs <app public key "ed25519:…"> [account]
//   NTK_PARENT=<funded.testnet> node scripts/device/wallet-key.mjs <key>
//   adb shell am start -a android.intent.action.VIEW -d "'<printed link>'"
//
// The account comes from the public testnet faucet, which allows only a few per
// address and day (HTTP 429 after that). With NTK_PARENT set to a funded
// testnet account whose key is in ~/.near-credentials, a sub-account of it is
// made instead (0.5 NEAR). bash scripts/device/wallet-login.sh does all of it.
import { createTestnetAccount, account, provider, saveCredentials } from '../../client/near.mjs';
import crypto from 'node:crypto';
// near-api-js is installed in client/ (the same copy client/near.mjs uses).
const { KeyPair } = await import(new URL('../../client/node_modules/near-api-js/lib/index.js', import.meta.url));

const [pk, name] = process.argv.slice(2);
if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(pk || '')) {
  console.error('usage: node scripts/device/wallet-key.mjs <ed25519:public key> [account]');
  process.exit(2);
}
const parent = process.env.NTK_PARENT || '';
const hex = crypto.randomBytes(4).toString('hex');
const accountId = name || (parent ? `ntkr-${hex}.${parent}` : `ntkw-${hex}.testnet`);
const RECEIVER = 'nearthekeyboard.testnet';

if (parent) {
  const kp = KeyPair.fromRandom('ed25519');
  saveCredentials(accountId, kp); // save first: never lose a key for an account that may get created
  await account(parent).createSubAccount({
    accountOrPrefix: accountId, publicKey: kp.getPublicKey().toString(), nearToTransfer: 5n * 10n ** 23n,
  });
  console.error(`created ${accountId} from ${parent}`);
} else {
  try {
    const made = await createTestnetAccount(accountId);
    console.error(`${made.created ? 'created' : 'using'} ${accountId}`);
  } catch (e) {
    if (/429/.test(e.message)) console.error('the faucet is rate-limited: set NTK_PARENT=<a funded testnet account in ~/.near-credentials>');
    throw e;
  }
}
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

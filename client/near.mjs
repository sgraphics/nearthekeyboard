// Small NEAR testnet helpers for the NTK test client (near-api-js v7).
// Keys live in the standard legacy keychain ~/.near-credentials/<network>/<account>.json,
// never in this repository.
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from 'near-api-js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const NETWORK = process.env.NEAR_NETWORK || 'testnet';
export const RPC_URL = process.env.NEAR_RPC || (NETWORK === 'mainnet'
  ? 'https://rpc.mainnet.fastnear.com' : 'https://rpc.testnet.fastnear.com');
const FAUCET_URL = 'https://helper.nearprotocol.com/account';

export const provider = new JsonRpcProvider({ url: RPC_URL });

const credDir = path.join(os.homedir(), '.near-credentials', NETWORK);
const credPath = (accountId) => path.join(credDir, `${accountId}.json`);

export function loadCredentials(accountId) {
  const p = credPath(accountId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function saveCredentials(accountId, keyPair) {
  fs.mkdirSync(credDir, { recursive: true });
  const body = { account_id: accountId, public_key: keyPair.getPublicKey().toString(), private_key: keyPair.toString() };
  fs.writeFileSync(credPath(accountId), JSON.stringify(body), { mode: 0o600 });
  return body;
}

export function keyPairFor(accountId) {
  const c = loadCredentials(accountId);
  if (!c) throw new Error(`no credentials for ${accountId} in ${credDir}`);
  return KeyPair.fromString(c.private_key || c.secret_key);
}

export function account(accountId) {
  return new Account(accountId, provider, new KeyPairSigner(keyPairFor(accountId)));
}

export async function accountExists(accountId) {
  try {
    await provider.query({ request_type: 'view_account', finality: 'final', account_id: accountId });
    return true;
  } catch { return false; }
}

// Create a top-level testnet account funded by the public testnet faucet.
export async function createTestnetAccount(accountId) {
  if (NETWORK !== 'testnet') throw new Error('faucet accounts exist only on testnet');
  if (await accountExists(accountId)) {
    if (!loadCredentials(accountId)) throw new Error(`${accountId} exists but its key is not in ${credDir}`);
    return { accountId, created: false };
  }
  const kp = KeyPair.fromRandom('ed25519');
  saveCredentials(accountId, kp); // save first: never lose a key for an account that may get created
  const res = await fetch(FAUCET_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`faucet ${res.status}: ${text.slice(0, 300)}`);
  for (let i = 0; i < 20 && !(await accountExists(accountId)); i++) await new Promise((r) => setTimeout(r, 1500));
  return { accountId, created: true };
}

export async function view(contractId, methodName, args = {}) {
  return provider.callFunction({ contractId, method: methodName, args });
}

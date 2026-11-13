// Wallet login for the NTK app, without the DOM: what the app asks for, the one
// transaction the wallet is asked to send, how the result is checked on chain,
// and where the browser goes back to. Every function here is pure or takes its
// network access as an argument, so `node --test` covers it (web/test/).
//
// The contract with the Android app:
//   the app opens  https://ntk.tools/login#pk=<ed25519:base58>&return=ntk%3A%2F%2Fauth&network=testnet
//   the page ends  ntk://auth?account_id=<account>&public_key=<urlencoded pk>   (only after the key is on chain)

/** What this page asks the wallet for. */
export const NTK_LOGIN = Object.freeze({
  network: 'testnet',
  // The one receiver a function-call key may name for the enclave to accept it (docs/protocol.md).
  receiverId: 'nearthekeyboard.testnet',
  // 0.1 NEAR in yoctoNEAR (10^23): the most the key can ever spend on fees.
  allowanceYocto: '100000000000000000000000',
  allowanceNear: '0.1',
  rpc: 'https://rpc.testnet.fastnear.com',
});

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Bitcoin-alphabet base58 to bytes; throws on a character outside the alphabet. */
export function decodeBase58(s) {
  let n = 0n;
  for (const c of String(s)) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error(`"${c}" is not a base58 character`);
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of String(s)) { if (c !== '1') break; bytes.unshift(0); }
  return new Uint8Array(bytes);
}

/** `ed25519:<base58 of 32 bytes>`. Returns { ok, publicKey } or { ok: false, error }. */
export function parsePublicKey(value) {
  if (typeof value !== 'string' || value === '') return { ok: false, error: 'The link has no key (pk).' };
  const m = /^ed25519:([1-9A-HJ-NP-Za-km-z]+)$/.exec(value);
  if (!m) return { ok: false, error: 'The key in the link is not an ed25519 key written as ed25519:<base58>.' };
  let bytes;
  try { bytes = decodeBase58(m[1]); } catch { return { ok: false, error: 'The key in the link is not valid base58.' }; }
  if (bytes.length !== 32) return { ok: false, error: `The key in the link is ${bytes.length} bytes long, not 32.` };
  return { ok: true, publicKey: value };
}

// ntk://<host>[/<path>][?<query>]: the app's own scheme only, no fragment, nothing that needs escaping.
const RETURN_RE = /^ntk:\/\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~%-]*)*(?:\?[A-Za-z0-9._~%&=-]*)?$/;

/** The address to go back to. Only `ntk://` addresses are allowed. */
export function parseReturnUrl(value) {
  if (typeof value !== 'string' || value === '') return { ok: false, error: 'The link has no return address (return).' };
  if (value.length > 256 || !RETURN_RE.test(value)) {
    return { ok: false, error: 'The return address in the link is not an ntk:// address, so this page will not send you there.' };
  }
  return { ok: true, url: value };
}

/**
 * The request in the address fragment: `#pk=…&return=…&network=testnet`.
 * The fragment never reaches a server. Returns { ok, publicKey, returnUrl, network } or { ok: false, errors }.
 */
export function parseRequest(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const errors = [];
  const pk = parsePublicKey(q.get('pk'));
  if (!pk.ok) errors.push(pk.error);
  const ret = parseReturnUrl(q.get('return'));
  if (!ret.ok) errors.push(ret.error);
  const network = q.get('network') || NTK_LOGIN.network;
  if (network !== NTK_LOGIN.network) errors.push(`NTK runs on NEAR testnet only; the link asks for "${network}".`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, publicKey: pk.publicKey, returnUrl: ret.url, network };
}

const ACCOUNT_RE = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
/** A NEAR account id (named, implicit or eth-implicit). */
export const isAccountId = (s) => typeof s === 'string' && ACCOUNT_RE.test(s);

/** `ed25519:Co9DWJ3t…UBcPBz`: enough of a key to compare by eye. */
export const shortKey = (pk) => (pk.length > 30 ? `${pk.slice(0, 16)}…${pk.slice(-6)}` : pk);

/**
 * The one action: AddKey with a function-call permission for NTK's receiver,
 * any method, and a capped fee allowance. In the connector's action format
 * (@hot-labs/near-connect ConnectorAction, the same shape as NEAR Wallet Selector's).
 */
export function addKeyAction(publicKey, pins = NTK_LOGIN) {
  if (!parsePublicKey(publicKey).ok) throw new Error('not an ed25519 public key');
  return {
    type: 'AddKey',
    params: {
      publicKey,
      accessKey: {
        permission: {
          receiverId: pins.receiverId,
          allowance: pins.allowanceYocto,
          methodNames: [],
        },
      },
    },
  };
}

/** ONE transaction from the account to itself with ONE action, for wallet.signAndSendTransaction(). */
export function addKeyTransaction(accountId, publicKey, pins = NTK_LOGIN) {
  if (!isAccountId(accountId)) throw new Error(`not a NEAR account id: ${accountId}`);
  return { signerId: accountId, receiverId: accountId, actions: [addKeyAction(publicKey, pins)] };
}

/** Back to the app: `<return>?account_id=<account>&public_key=<urlencoded pk>`. Throws on anything invalid. */
export function redirectUrl(returnUrl, accountId, publicKey) {
  if (!parseReturnUrl(returnUrl).ok) throw new Error('not an ntk:// return address');
  if (!isAccountId(accountId)) throw new Error(`not a NEAR account id: ${accountId}`);
  if (!parsePublicKey(publicKey).ok) throw new Error('not an ed25519 public key');
  const sep = returnUrl.includes('?') ? (/[?&]$/.test(returnUrl) ? '' : '&') : '?';
  return `${returnUrl}${sep}account_id=${encodeURIComponent(accountId)}&public_key=${encodeURIComponent(publicKey)}`;
}

/** The JSON-RPC body that reads one access key. */
export function viewAccessKeyBody(accountId, publicKey) {
  return {
    jsonrpc: '2.0',
    id: 'ntk-login',
    method: 'query',
    params: { request_type: 'view_access_key', finality: 'optimistic', account_id: accountId, public_key: publicKey },
  };
}

/**
 * What an RPC answer to viewAccessKeyBody says about the key:
 *   ntk      a function-call key for NTK's receiver: done
 *   full     a full-access key: the enclave accepts it too
 *   other    a function-call key for another receiver: NTK cannot use it
 *   missing  not on the account (or no such account)
 *   error    no usable answer
 */
export function keyStateFromRpc(json, pins = NTK_LOGIN) {
  const r = json && json.result;
  // A missing key comes back either as result.error (nearcore's older form, what FastNEAR sends today)
  // or as a JSON-RPC error whose cause is UNKNOWN_ACCESS_KEY or UNKNOWN_ACCOUNT.
  const err = (json && json.error) || (r && r.error);
  if (err) {
    const text = typeof err === 'string' ? err : JSON.stringify(err);
    if (/does not exist|UNKNOWN_ACCESS_KEY|UNKNOWN_ACCOUNT|has never been observed/i.test(text)) return { state: 'missing' };
    return { state: 'error', error: text.slice(0, 200) };
  }
  if (!r || r.permission == null) return { state: 'error', error: 'the RPC answer has no access key' };
  if (r.permission === 'FullAccess') return { state: 'full' };
  const fc = r.permission.FunctionCall;
  if (fc && fc.receiver_id === pins.receiverId) return { state: 'ntk', allowance: fc.allowance ?? null, methodNames: fc.method_names || [] };
  return { state: 'other', receiverId: fc ? fc.receiver_id : Object.keys(r.permission)[0] };
}

/** Read the key's state from the chain. `fetchImpl` is the browser's fetch (or a test double). */
export async function fetchKeyState(accountId, publicKey, { fetchImpl = globalThis.fetch, pins = NTK_LOGIN } = {}) {
  try {
    const res = await fetchImpl(pins.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(viewAccessKeyBody(accountId, publicKey)),
    });
    if (!res.ok) return { state: 'error', error: `the NEAR RPC answered HTTP ${res.status}` };
    return keyStateFromRpc(await res.json(), pins);
  } catch (e) {
    return { state: 'error', error: `the NEAR RPC did not answer (${errorText(e)})` };
  }
}

/** A readable line from whatever a wallet threw or returned as an error. */
export function errorText(e) {
  if (e == null) return 'unknown error';
  if (typeof e === 'string') return e;
  if (typeof e.message === 'string' && e.message) return e.message;
  try { return JSON.stringify(e).slice(0, 300); } catch { return String(e); }
}

/** The failure in a FinalExecutionOutcome, as text; null when the outcome shows none. */
export function outcomeFailure(outcome) {
  const st = outcome && outcome.status;
  if (st && typeof st === 'object' && st.Failure) {
    const f = st.Failure;
    const kind = f.ActionError && f.ActionError.kind;
    if (kind && typeof kind === 'object') return `the transaction failed: ${Object.keys(kind)[0]}`;
    return `the transaction failed: ${JSON.stringify(f).slice(0, 200)}`;
  }
  return null;
}

/** True when an outcome says it succeeded (a FinalExecutionOutcome with SuccessValue). */
export const outcomeSucceeded = (outcome) =>
  !!(outcome && outcome.status && typeof outcome.status === 'object' && 'SuccessValue' in outcome.status);

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The whole step: check the chain, ask the wallet for the one transaction,
 * then confirm on chain that the key is there with NTK's receiver.
 * `onStep` hears 'precheck', 'wallet' and 'confirm'.
 * Returns { ok: true, already, unconfirmed? } or { ok: false, error }.
 */
export async function addNtkKey({
  wallet, accountId, publicKey, fetchImpl = globalThis.fetch, pins = NTK_LOGIN,
  sleep = sleepMs, polls = 10, pollMs = 1500, onStep = () => {},
}) {
  const tx = addKeyTransaction(accountId, publicKey, pins);
  onStep('precheck');
  const before = await fetchKeyState(accountId, publicKey, { fetchImpl, pins });
  if (before.state === 'ntk' || before.state === 'full') return { ok: true, already: true };
  if (before.state === 'other') return { ok: false, error: otherKeyError(before) };

  onStep('wallet');
  let outcome = null;
  let walletError = null;
  try {
    outcome = await wallet.signAndSendTransaction(tx);
  } catch (e) {
    walletError = errorText(e);
  }
  const failure = outcomeFailure(outcome);
  onStep('confirm');

  // The wallet's answer is not the proof: the key on chain is. A wallet may also
  // throw after it sent the transaction (its window closed), so check either way.
  let after = { state: 'error', error: 'not checked' };
  const tries = failure ? 1 : walletError ? Math.min(3, polls) : polls;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(pollMs);
    after = await fetchKeyState(accountId, publicKey, { fetchImpl, pins });
    if (after.state !== 'missing' && after.state !== 'error') break;
  }
  if (after.state === 'ntk' || after.state === 'full') return { ok: true, already: false };
  if (after.state === 'other') return { ok: false, error: otherKeyError(after) };
  if (walletError) return { ok: false, error: `The wallet did not add the key: ${walletError}` };
  if (failure) return { ok: false, error: `The wallet sent the transaction, but ${failure}.` };
  // The RPC cannot be reached, but the wallet reports success: the app checks the chain again itself.
  if (after.state === 'error' && outcomeSucceeded(outcome)) return { ok: true, already: false, unconfirmed: true };
  if (after.state === 'error') return { ok: false, error: `The key could not be confirmed on chain: ${after.error}` };
  return { ok: false, error: 'The wallet finished, but the key is not on your account.' };
}

function otherKeyError(st) {
  return `This key is already on your account, but for ${st.receiverId || 'another app'}, so NTK cannot use it. ` +
    'Open NTK and log in again: it makes a new key.';
}

// ntk.tools/donate: the logic of the donation page; donate.js builds the DOM.
// A donation is ONE NEAR mainnet transaction with ONE Transfer action, from the
// donor's own account to the project's account. Only the amounts the keyboard
// offers are accepted, so a link cannot ask the wallet for any other amount.
// Runs in browsers (bundled by ../build.mjs) and in Node for the tests.

export const DONATE_TO = 'nearthekeyboard.near';
export const DONATE_NETWORK = 'mainnet';
export const DONATE_RPC = 'https://rpc.mainnet.fastnear.com';
export const AMOUNTS = Object.freeze([5, 25, 50]);
export const DEFAULT_AMOUNT = 25;
const YOCTO_PER_NEAR = 10n ** 24n;

/** The amount a link asks for (`#amount=5`, 25 or 50); anything else gives the default. */
export function parseAmount(hash) {
  const m = /(?:^|&)amount=([0-9]{1,3})(?:&|$)/.exec(String(hash || '').replace(/^#/, ''));
  const n = m ? Number(m[1]) : NaN;
  return AMOUNTS.includes(n) ? n : DEFAULT_AMOUNT;
}

/** NEAR to yoctoNEAR, as the decimal string a Transfer action carries. Offered amounts only. */
export function yoctoFor(near) {
  if (!AMOUNTS.includes(near)) throw new Error(`not an offered amount: ${near}`);
  return (BigInt(near) * YOCTO_PER_NEAR).toString();
}

/** ONE transaction with ONE Transfer action to the project, for wallet.signAndSendTransaction(). */
export function donationTransaction(signerId, near) {
  return { signerId, receiverId: DONATE_TO, actions: [{ type: 'Transfer', params: { deposit: yoctoFor(near) } }] };
}

/** The transaction hash in a wallet's answer (a FinalExecutionOutcome, or a list of them); null when there is none. */
export function outcomeTxHash(outcome) {
  const o = Array.isArray(outcome) ? outcome[0] : outcome;
  const hash = o && ((o.transaction && o.transaction.hash) || (o.transaction_outcome && o.transaction_outcome.id));
  return typeof hash === 'string' && /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(hash) ? hash : null;
}

/** Where anyone can see a mainnet transaction. */
export const explorerUrl = (hash) => `https://nearblocks.io/txns/${hash}`;

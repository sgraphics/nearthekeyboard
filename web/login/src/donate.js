// ntk.tools/donate: the keyboard's DONATE ribbon opens this page with #amount=5,
// 25 or 50. The page connects the donor's own wallet through NEAR Connector
// (@hot-labs/near-connect), the same two wallets as the login, and asks it to send
// ONE NEAR mainnet transaction: a Transfer of that amount to the project's account.
// The logic lives in donate-model.js; this file only builds the DOM. Bundled into
// ../../donate/bundle.js by ../build.mjs.
import { NearConnector } from '@hot-labs/near-connect';
import { isAccountId, accountOnNetwork, errorText, outcomeFailure } from './model.js';
import { WALLET_IDS, WALLET_MANIFEST } from './wallets.js';
import {
  DONATE_TO, DONATE_NETWORK, DONATE_RPC, AMOUNTS, parseAmount, donationTransaction, outcomeTxHash, explorerUrl,
} from './donate-model.js';

// nginx gives this script a fresh nonce per response (deploy/nginx/ntk.conf); the
// connector puts it on the inline scripts of each wallet's sandboxed iframe.
const NONCE = (() => {
  const n = document.currentScript && document.currentScript.nonce;
  return typeof n === 'string' && /^[0-9a-f]{32}$/.test(n) ? n : undefined;
})();

const WALLET_NOTES = {
  'meteor-wallet': 'Android app, web wallet or browser extension',
  'intear-wallet': 'Web wallet',
};

const $ = (id) => document.getElementById(id);

/** Element builder: strings become text nodes, never HTML. */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c != null && c !== false && c !== '') el.append(c);
  return el;
}

/** Show the parts of the page for one state: elements carry data-show="<state> …". */
function show(state, busyText = '') {
  document.body.dataset.state = state;
  for (const el of document.querySelectorAll('[data-show]')) el.hidden = !el.dataset.show.split(' ').includes(state);
  $('busy-text').textContent = busyText;
}

let retryAction = null;
function showError(text, retry) {
  $('error-text').textContent = text;
  retryAction = retry;
  show('error');
}

let amount = parseAmount(window.location.hash);
let connector = null;
let current = null; // { wallet, accountId }
let lastSignIn = null;

function renderAmounts() {
  $('amounts').replaceChildren(...AMOUNTS.map((n) => {
    const on = n === amount;
    const btn = h('button', { type: 'button', class: `btn amount${on ? ' is-on' : ''}`, 'aria-pressed': on ? 'true' : 'false' }, `${n} NEAR`);
    btn.addEventListener('click', () => {
      amount = n;
      window.history.replaceState(null, '', `#amount=${n}`);
      renderAmounts();
    });
    return h('li', {}, btn);
  }));
  for (const el of document.querySelectorAll('.amount-text')) el.textContent = `${amount} NEAR`;
}

function walletButton(wallet) {
  const m = wallet.manifest;
  const btn = h('button', { type: 'button', class: 'btn wallet', 'data-wallet': m.id },
    h('img', { class: 'wallet-icon', src: m.icon, alt: '', width: 40, height: 40, referrerpolicy: 'no-referrer' }),
    h('span', { class: 'wallet-text' },
      h('span', { class: 'wallet-name' }, m.name),
      h('span', { class: 'wallet-note' }, WALLET_NOTES[m.id] || '')));
  btn.addEventListener('click', () => connect(wallet));
  return h('li', {}, btn);
}

function renderWallets() {
  const wallets = connector.availableWallets.filter((w) => WALLET_IDS.includes(w.manifest.id));
  wallets.sort((a, b) => WALLET_IDS.indexOf(a.manifest.id) - WALLET_IDS.indexOf(b.manifest.id));
  $('wallets').replaceChildren(...wallets.map(walletButton));
  $('no-wallets').hidden = wallets.length > 0;
}

function showConnected() {
  $('account').textContent = current.accountId;
  $('wallet-name').textContent = current.wallet.manifest.name;
  show('connected');
}

async function connect(wallet) {
  const name = wallet.manifest.name;
  show('busy', `Opening ${name}…`);
  lastSignIn = null;
  try {
    const connected = await connector.connect({ walletId: wallet.manifest.id });
    const accounts = (lastSignIn && lastSignIn.accounts) || (await connected.getAccounts());
    const accountId = accounts && accounts[0] && accounts[0].accountId;
    if (!isAccountId(accountId)) throw new Error(`${name} did not give an account`);
    if (!accountOnNetwork(accountId, DONATE_NETWORK)) {
      throw new Error(`${accountId} is not a NEAR mainnet account. Choose a mainnet account in ${name}`);
    }
    current = { wallet: connected, accountId };
    showConnected();
  } catch (e) {
    showError(`Could not connect ${name}: ${errorText(e)}`, () => show('choose'));
  }
}

async function send() {
  const { wallet, accountId } = current;
  const sent = amount;
  show('busy', `Waiting for ${wallet.manifest.name}. Check ${sent} NEAR to ${DONATE_TO} and approve it there.`);
  let outcome;
  try {
    outcome = await wallet.signAndSendTransaction(donationTransaction(accountId, sent));
  } catch (e) {
    return showError(`The wallet did not send it: ${errorText(e)}`, () => showConnected());
  }
  const failure = outcomeFailure(outcome);
  if (failure) return showError(`The wallet sent it, but ${failure}.`, () => showConnected());
  const hash = outcomeTxHash(outcome);
  $('done-amount').textContent = `${sent} NEAR`;
  const link = $('tx-link');
  link.hidden = !hash;
  if (hash) link.setAttribute('href', explorerUrl(hash));
  show('done');
}

async function switchAccount() {
  const wallet = current && current.wallet;
  current = null;
  show('busy', 'Disconnecting…');
  if (wallet) await connector.disconnect(wallet).catch(() => {});
  renderWallets();
  show('choose');
}

async function start() {
  renderAmounts();
  for (const el of document.querySelectorAll('.donate-to')) el.textContent = DONATE_TO;
  show('busy', 'Loading wallets…');
  connector = new NearConnector({
    network: DONATE_NETWORK,
    manifest: structuredClone(WALLET_MANIFEST),
    providers: { mainnet: [DONATE_RPC], testnet: [] },
    features: { signAndSendTransaction: true },
    footerBranding: null,
    autoConnect: false,
    cspNonce: NONCE,
  });
  connector.on('wallet:signIn', (e) => { lastSignIn = e; });
  connector.on('selector:walletsChanged', () => { if (document.body.dataset.state === 'choose') renderWallets(); });
  await connector.whenManifestLoaded;

  // A wallet connected on an earlier visit: offer it straight away, on mainnet only.
  try {
    show('busy', 'Looking for a connected wallet…');
    const restored = await Promise.race([
      connector.getConnectedWallet(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ]);
    const accountId = restored.accounts[0] && restored.accounts[0].accountId;
    if (WALLET_IDS.includes(restored.wallet.manifest.id) && accountOnNetwork(accountId, DONATE_NETWORK)) {
      current = { wallet: restored.wallet, accountId };
      return showConnected();
    }
  } catch { /* none: choose one */ }
  renderWallets();
  show('choose');
}

$('send').addEventListener('click', () => send());
$('switch').addEventListener('click', () => switchAccount());
$('retry').addEventListener('click', () => { if (retryAction) retryAction(); });
$('copy-to').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(DONATE_TO);
    $('copy-to').textContent = 'Copied';
  } catch { /* the address stays visible to copy by hand */ }
});

start().catch((e) => showError(`The page could not start: ${errorText(e)}`, () => window.location.reload()));

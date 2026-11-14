// ntk.tools/login: the NTK app opens this page to get a key that can act for the
// user's NEAR account. The page connects the user's own wallet through NEAR
// Connector (@hot-labs/near-connect), asks it to send ONE transaction that adds
// the app's key (a function-call key for the NTK project's owner: nearthekeyboard.testnet,
// or nearthekeyboard.near when the link says network=mainnet), checks the key on
// that network's chain and goes back to the app. The logic lives in model.js; this
// file only builds the DOM. Bundled into ../bundle.js by ../build.mjs.
import { NearConnector } from '@hot-labs/near-connect';
import {
  NTK_LOGIN, loginPins, parseRequest, addNtkKey, redirectUrl, shortKey, isAccountId, accountOnNetwork, errorText,
} from './model.js';
import { availableNetworks } from '../../lib/networks.js';
import { WALLET_IDS, WALLET_MANIFEST } from './wallets.js';

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

function showError(text, retry, { canSwitch = false } = {}) {
  $('error-text').textContent = text;
  retryAction = retry;
  $('switch-error').hidden = !canSwitch;
  show('error');
}

let retryAction = null;
let connector = null;
let current = null; // { wallet, accountId }
let lastSignIn = null;

const request = parseRequest(window.location.hash);
const debug = /(^|[#&])debug=1(&|$)/.test(window.location.hash);
// The network the app asked for: its project owner receives the key, its RPC confirms it.
const pins = request.network ? loginPins(request.network) : NTK_LOGIN;

/** The page names its network: the chip, and every .net-name / .net-owner in the text. */
function renderNetwork() {
  const chip = $('net-chip');
  if (chip) { // a page cached from before it had an id is left as it is
    chip.textContent = pins.network.toUpperCase();
    chip.title = `NEAR ${pins.network}${availableNetworks().length === 1 ? ' only' : ''}`;
    chip.className = `chip chip-${pins.network}`;
  }
  for (const el of document.querySelectorAll('.net-name')) el.textContent = pins.network;
  for (const el of document.querySelectorAll('.net-owner')) el.textContent = pins.receiverId;
}

function renderFacts(req) {
  const facts = $('key-facts');
  facts.replaceChildren(
    h('div', { class: 'fact fact-wide' }, h('dt', {}, 'Key from the app'), h('dd', { class: 'mono', title: req.publicKey }, shortKey(req.publicKey))),
    h('div', { class: 'fact fact-wide' }, h('dt', {}, 'It can only call'), h('dd', { class: 'mono' }, pins.receiverId)),
    h('div', { class: 'fact' }, h('dt', {}, 'Fee allowance'), h('dd', {}, `${pins.allowanceNear} NEAR at most`)),
    h('div', { class: 'fact' }, h('dt', {}, 'Network'), h('dd', {}, `NEAR ${pins.network}`)),
  );
}

function renderInvalid(errors) {
  $('invalid-list').replaceChildren(...errors.map((e) => h('li', {}, e)));
  show('invalid');
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
    if (!accountOnNetwork(accountId, pins.network)) {
      throw new Error(`${accountId} is not a NEAR ${pins.network} account. Choose a ${pins.network} account in ${name}`);
    }
    current = { wallet: connected, accountId };
    showConnected();
  } catch (e) {
    showError(`Could not connect ${name}: ${errorText(e)}`, () => show('choose'));
  }
}

async function addKey() {
  const { wallet, accountId } = current;
  const name = wallet.manifest.name;
  const result = await addNtkKey({
    wallet,
    accountId,
    publicKey: request.publicKey,
    pins,
    onStep: (step) => show('busy', {
      precheck: `Looking at the keys of ${accountId}…`,
      wallet: `Waiting for ${name}. Check the key and approve it there.`,
      confirm: `Checking that the key is on ${accountId}…`,
    }[step] || ''),
  });
  if (!result.ok) return showError(result.error, addKey, { canSwitch: true });
  done(accountId, result);
}

function done(accountId, result) {
  const url = redirectUrl(request.returnUrl, accountId, request.publicKey);
  $('done-account').textContent = accountId;
  $('done-detail').textContent = result.already
    ? 'The key was already on your account.'
    : result.unconfirmed
      ? 'Your wallet says the key was added; NTK checks it again.'
      : 'The key is on your account.';
  $('open-app').setAttribute('href', url);
  show('done');
  // A browser may block an app link that no tap started; the button is there for that.
  setTimeout(() => { window.location.href = url; }, 700);
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
  renderNetwork();
  if (!request.ok) return renderInvalid(request.errors);
  renderFacts(request);
  show('busy', 'Loading wallets…');
  connector = new NearConnector({
    network: pins.network,
    manifest: structuredClone(WALLET_MANIFEST),
    providers: { mainnet: [], testnet: [], [pins.network]: [pins.rpc] },
    features: { signAndSendTransaction: true },
    footerBranding: null,
    autoConnect: false,
    cspNonce: NONCE,
    logger: debug ? { log: (...a) => console.log('[near-connect]', ...a) } : undefined,
  });
  connector.on('wallet:signIn', (e) => { lastSignIn = e; });
  connector.on('selector:walletsChanged', () => { if (document.body.dataset.state === 'choose') renderWallets(); });
  await connector.whenManifestLoaded;

  // A wallet connected on an earlier visit: offer it straight away.
  try {
    show('busy', 'Looking for a connected wallet…');
    const restored = await Promise.race([
      connector.getConnectedWallet(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ]);
    const accountId = restored.accounts[0] && restored.accounts[0].accountId;
    // Only on the network asked for: the session may be from the other one.
    if (WALLET_IDS.includes(restored.wallet.manifest.id) && accountOnNetwork(accountId, pins.network)) {
      current = { wallet: restored.wallet, accountId };
      return showConnected();
    }
  } catch { /* none: choose one */ }
  renderWallets();
  show('choose');
}

$('add-key').addEventListener('click', () => addKey());
$('switch').addEventListener('click', () => switchAccount());
$('switch-error').addEventListener('click', () => switchAccount());
$('retry').addEventListener('click', () => { if (retryAction) retryAction(); });

start().catch((e) => showError(`The page could not start: ${errorText(e)}`, () => window.location.reload()));

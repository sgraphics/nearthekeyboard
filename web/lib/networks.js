// The NEAR networks NTK runs on: where each network's NTK lives and which
// enclave keys it pins. The one place for these values on the web side: the
// verifier (lib/ntk-verify.js), the verify page, the wallet login (bundled into
// login/bundle.js) and the relay's smoke test read them from here.
// docs/protocol.md lists the same values. Browsers and Node 20+, no build step.
//
// Testnet is the default. Mainnet is switched off until its enclave keys are
// pinned below: while either key is null, mainnet is "not available yet" on
// every page, and stamps are looked up on testnet only.

export const NETWORKS = Object.freeze({
  testnet: Object.freeze({
    network: 'testnet',
    api: 'https://testnet-api.outlayer.ai', // OutLayer: calls, public storage (stamps), attestations
    project: 'nearthekeyboard.testnet/ntk',
    owner: 'nearthekeyboard.testnet', // the receiver of the app's function-call key
    rpc: 'https://rpc.testnet.fastnear.com',
    stampPk: 'ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG',
    transportPk: '4443a5935e077902ff3afc6a4d188c53168b8ec9bd9b0b847b4d1006ab95b729',
  }),
  mainnet: Object.freeze({
    network: 'mainnet',
    api: 'https://api.outlayer.ai',
    project: 'nearthekeyboard.near/ntk',
    owner: 'nearthekeyboard.near',
    rpc: 'https://rpc.mainnet.fastnear.com',
    // ===== TO BE PINNED: the mainnet enclave's keys ================================
    // From its `info` output (GET https://ntk.tools/api/mainnet/info, or
    // `node relay/smoke.mjs https://ntk.tools --network mainnet`): stamp_pk and
    // transport_pk. Fill in both, rebuild the login bundle (cd web/login && node
    // build.mjs) and run the tests. Both null = mainnet switched off.
    stampPk: null, // 'ed25519:<base58>'
    transportPk: null, // '<64 lowercase hex characters>'
    // ================================================================================
  }),
});

/** The network a link or a page means when it names none. */
export const DEFAULT_NETWORK = 'testnet';

const STAMP_PK_RE = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TRANSPORT_PK_RE = /^[0-9a-f]{64}$/;

/** True when the stamp key is pinned and well-formed (`ed25519:<base58>`). */
export const hasStampKey = (net) => !!net && typeof net.stampPk === 'string' && STAMP_PK_RE.test(net.stampPk);

/** True when the transport key is pinned and well-formed (64 lowercase hex). */
export const hasTransportKey = (net) => !!net && typeof net.transportPk === 'string' && TRANSPORT_PK_RE.test(net.transportPk);

/** NTK runs on a network once both of its enclave keys are pinned. */
export const isAvailable = (net) => hasStampKey(net) && hasTransportKey(net);

/** The networks NTK runs on, the default first. */
export function availableNetworks(networks = NETWORKS) {
  const all = Object.values(networks).filter(isAvailable);
  return [...all.filter((n) => n.network === DEFAULT_NETWORK), ...all.filter((n) => n.network !== DEFAULT_NETWORK)];
}

/** ['testnet'] -> 'testnet'; ['testnet', 'mainnet'] -> 'testnet and mainnet' (or 'testnet or mainnet'). */
export function joinNames(names, word = 'and') {
  const list = [...names];
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} ${word} ${list.at(-1)}`;
}

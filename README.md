![Near The Keyboard](brand/out/banner/ntk-social-1280x640-light.png)

# NTK — Near The Keyboard

A phone keyboard that lets a person prove "I typed this by hand".

While you type, the keyboard measures **how** you type and sends those
measurements, sealed, into an enclave on [NEAR OutLayer](https://outlayer.ai)
(Intel TDX). The enclave keeps your typing fingerprint where nobody can read
it, not even you. When a new text matches the fingerprint, the enclave signs a
stamp, and a short tag such as `[NTK 26144e35e7]` goes into the text. Anyone
can check the stamp against the text at <https://ntk.tools>, without an account
and without seeing the fingerprint.

Built at NEAR HACKATHON (tracks: Privacy & Private AI, Open Innovation).
Testnet only.

## The problem

Text online no longer says who wrote it: anyone can paste a model's answer and
post it as their own. How a text was typed is evidence the finished text does
not carry. But typing rhythm is biometric data, so it must not sit on a server
or in an app where someone can copy it.

## Status

Updated 2026-11-13. What is still open is in [TODO.md](TODO.md).

| Part | Path | State |
|---|---|---|
| Enclave v0.2.0 (Rust, wasm32-wasip2) | `enclave/` | Live on OutLayer testnet as `nearthekeyboard.testnet/ntk`; 16 unit tests |
| Protocol client, end-to-end suite | `client/` | 36 of 36 checks against the live enclave (2026-11-13), synthetic typists |
| Verify page, demo feed, web embed | `web/` | Live at <https://ntk.tools>; 57 tests |
| Relay (holds the payment key) | `relay/` | Live at `https://ntk.tools/api`; 22 tests |
| Android keyboard | `android/` | In progress |
| Stamp buttons in other Android apps | `android/` | In progress |
| NEAR AI Cloud: composed or copied | — | Not started; needs an API key |

The typing data in the tests is synthetic (invented typists). It shows that
the pipeline measures, stores, compares and signs correctly. It is not
evidence that the matching works on real people.

## Try it

### 1. Check a stamp in the browser (no account, no install)

Do: open
<https://ntk.tools/26144e35e7#t=SSBhZ3JlZSB3aXRoIHRoaXMsIGFuZCBJIHR5cGVkIGV2ZXJ5IHdvcmQgbXlzZWxmLg>.

See: **MATCH**, six passed checks (the stamp exists, the pinned enclave key
signed it, the signature is valid, the id belongs to it, the NTK project
issued it, the text matches), the covered text "I agree with this, and I
typed every word myself.", the account `ntk-alice.testnet`, the match score
and a link to the attestation of the call that issued it.

Do: open the same link with the full stop changed to "!":
<https://ntk.tools/26144e35e7#t=SSBhZ3JlZSB3aXRoIHRoaXMsIGFuZCBJIHR5cGVkIGV2ZXJ5IHdvcmQgbXlzZWxmIQ>.

See: **NO MATCH**. The stamp is genuine, but the text is not the one that was
stamped.

The text after `#` never reaches a server; only the stamp id does. This stamp
was made by the test suite's synthetic typist, not by a person.

### 2. Tap a stamp in a feed

Do: open <https://ntk.tools/feed/?embed=1>, then tap the stamp button at the
end of a reply.

See: the verify page opens and shows MATCH for that reply. Replies you post
in the box stay in your browser.

### 3. Check a stamp from the command line

Needs Node 20+.

```bash
node client/verify.mjs "I agree with this, and I typed every word myself. [NTK 26144e35e7]"
```

See: `[NTK 26144e35e7]  MATCH` and the six checks. Change a word: `NO MATCH`,
exit code 1.

### 4. Read the published stamp yourself

```bash
curl -s "https://testnet-api.outlayer.ai/public/storage/get?project=nearthekeyboard.testnet%2Fntk&key=stamp%3A26144e35e7&format=raw"
```

See: JSON with `"id":"26144e35e7"`, the stamp key
`ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG`, a signature `sig`, and
the signed `record` (itself a JSON string): `"v":2`, the account, `text_sha256`,
`text_chars` 49, the scores and the issuing `call_id`. The record never
contains the text or any timing.

### 5. Run the tests

```bash
cd enclave && cargo test --release          # 16 passed
cd .. && node --test web/test/ relay/test/  # 79 tests: 78 pass, 1 live test skipped
```

### 6. Rebuild the binary that is live

Needs Rust with the `wasm32-wasip2` target.

```bash
cd enclave && cargo build --target wasm32-wasip2 --release
sha256sum target/wasm32-wasip2/release/ntk-enclave.wasm
```

See: on the author's machine (Windows, Rust 1.91.1) this prints
`4d3e32583b92651fcfc11229cf0380e7ca40247e970fdd817e73957d9ada853b`, the active
version of the project on chain. Other machines may print a different hash
until the build is pinned (TODO.md, section 1). The version list is public:

```bash
curl -s https://rpc.testnet.fastnear.com -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"outlayer.testnet","method_name":"list_versions","args_base64":"eyJwcm9qZWN0X2lkIjoibmVhcnRoZWtleWJvYXJkLnRlc3RuZXQvbnRrIn0="}}'
```

See: `result.result` is a byte array holding JSON with four versions; the one
with `"is_active":true` has `wasm_hash` `4d3e3258…`.

### 7. Run the end-to-end suite on your own deployment

The live project serves only calls its owner pays for (see Guarantees), so the
suite needs your own copy of the enclave. You need:

- Node 20+;
- a NEAR testnet account whose key is in
  `~/.near-credentials/testnet/<account>.json`;
- the OutLayer CLI (`cargo install --git https://github.com/out-layer/outlayer-cli`;
  on Windows, drop its unused `openssl` dependency) and a testnet payment key
  made with that same account
  ([OutLayer getting started](https://app.outlayer.ai/docs/getting-started));
- `outlayer-verify`
  (`cargo install --git https://github.com/out-layer/outlayer-verify outlayer-verify`).

```bash
outlayer upload enclave/target/wasm32-wasip2/release/ntk-enclave.wasm
outlayer deploy ntk <FastFS URL printed by upload>
```

Create `~/.ntk/testnet.env` (outside the repository):

```
NTK_API=https://testnet-api.outlayer.ai
NTK_PROJECT=<your-account>.testnet/ntk
NTK_PAYMENT_KEY=<your OutLayer payment key>
```

```bash
cd client && npm install
NTK_TEST_ACCOUNT=<your-account>.testnet node e2e.mjs
```

See: `32/32 checks passed` and `client/e2e-report.json` with every call id and
example stamps. Four more checks run when two optional files exist, which
gives 36:

- `~/.ntk/alice-fc-keys.json`: `{"fc_other_app": {"contractId", "public_key", "private_key"}, "fc_ntk": {…}}`,
  two function-call keys of the test account, one issued to some other contract
  and one issued to the project owner's account.
- `~/.ntk/alice-payer.env`: `ALICE_PAYMENT_KEY=<a payment key of another account>`.

Calls are asynchronous: the client submits and polls, because one call can
take from under a second to a few minutes on testnet. A run makes about 30
calls at $0.001 of test USDC each and took 3 minutes on 2026-11-13.

### 8. Run the site and relay locally

```bash
NTK_ENV_FILE=~/.ntk/testnet.env STATIC_DIR=web node relay/server.mjs
```

See: `http://127.0.0.1:3970/` serves the verify page and `/feed/` the demo
feed; `node relay/smoke.mjs` checks the relay end to end.

## How it works

```
keyboard                                  enclave on OutLayer (Intel TDX)
────────                                  ───────────────────────────────
per key tap: dwell, flight, offset
seal the session to the enclave's key ──▶ open it (the key exists only inside the enclave)
sign the request with a NEAR key      ──▶ check the signature, and on chain that the key
        (through the relay, which         belongs to the account
         pays for the call)               enroll: fold the session into the fingerprint,
                                                  kept sealed in the enclave's storage
                                          stamp:  replay the keystrokes into the text,
                                                  compare with the fingerprint; on a match
                                                  sign the stamp and publish it by id
put " [NTK <id>]" into the text       ◀── stamp

anyone: fetch the stamp by its id, check the signature with the pinned stamp key,
        make the text before the tag canonical, hash its last text_chars characters
```

Per key tap the keyboard reports three things:

1. **dwell**: how long the key is held down, per key;
2. **flight**: the time from releasing one key to pressing the next, per key pair;
3. **offset**: where the finger lands relative to the key's centre (x and y as a
   fraction of the key's size), per key.

The fingerprint is running statistics only (count, mean, variance) per key and
per key pair.

The full protocol is in [docs/protocol.md](docs/protocol.md), with shared test
vectors in `docs/test-vectors/` that the enclave, the web verifier and the
keyboard all check themselves against. In short:

- **Operations.** `info`, `enroll`, `stamp`, `status`, `forget`. Every error
  carries a stable code.
- **Transport.** A session is sealed with an ephemeral X25519 key, HKDF-SHA256
  and ChaCha20-Poly1305; the additional data names the operation and the
  account.
- **Identity.** Each request carries a NEP-413 signature (the format of NEAR
  wallets' `signMessage`) over `{ntk, op, account, payload, ts}`, where
  `payload` is the hash of the sealed session.
- **Stamp.** The enclave signs `NTK-STAMP/v1\n` + the record with its ed25519
  key and publishes it under `stamp:<id>`; the id is the first 10 hex
  characters of SHA-256(signature).
- **Text rule v2.** Whitespace runs become one space and the ends are
  trimmed. A stamp covers the `text_chars` characters right before its tag, so
  a name or earlier text in the same post does not break it.

```json
{"v":2,"kind":"ntk-stamp","account":"ntk-alice.testnet","text_sha256":"af5559…","text_chars":49,"taps":51,
 "typed_pct":100,"score_pct":95,"threshold_pct":65,"profile_sessions":4,"issued_at_ms":1794578550884,
 "project":"nearthekeyboard.testnet/ntk","network":"testnet","call_id":"39445da2-…","enclave":"0.2.0"}
```

## What NEAR does here

- **NEAR accounts are the identity.** A stamp says which NEAR account typed the
  text. The user signs each request with a key of that account. The enclave
  checks on chain that the key belongs to the account, through OutLayer's NEAR
  RPC host function, and accepts a full-access key or a function-call key the
  account issued to NTK. A key issued to any other app is refused.
- **OutLayer runs the code that sees the measurements.** OutLayer runs the
  enclave in Intel TDX. Its keystore gives only this project's runs the key
  that seals fingerprints and the key that signs stamps. Every call has a TDX
  attestation naming the code hash, input hash and output hash.
- **The chain records which code may use those keys.** The project's version
  list is in the `outlayer.testnet` contract (Try it, step 6).
- **Stamps are public records.** They sit in OutLayer's public storage and are
  read by id without an account.
- **NEAR AI Cloud is not used yet.** It is planned for one job: judging, inside
  a private model, whether a text was composed or copied (TODO.md, section 7).

## What is stored where

| Where | What |
|---|---|
| Enclave storage, sealed | Per account: the fingerprint statistics, counts of sessions (per mode), taps and stamps, the time of the last request and of failed attempts. Raw sessions are not kept. |
| OutLayer public storage | Stamp records: account, text hash, character and tap counts, scores, time, call id. No text and no timing. |
| The relay | Nothing. It forwards sealed, signed requests and logs method, operation, account, status and duration. |
| The verify page | Nothing. The text to check stays in the browser; only the stamp id is fetched. |

## Guarantees and limits

Shown by the end-to-end suite on testnet:

- Measurements leave the client sealed to a key that exists only inside the
  enclave run. The relay and OutLayer's API see ciphertext.
- A sealed session opens only for the operation and account it was sealed for,
  and a tampered one does not open.
- The fingerprint is stored sealed under a keystore key. No operation returns
  it; `status` gives counts only.
- Only a key of the account can act for it: a full-access key, or a
  function-call key issued to NTK.
- A signed request cannot be replayed.
- Only runs the project owner pays for touch fingerprints, so there is one
  store and no parallel one.
- A stamp is issued only when the session matches the fingerprint (65% or
  more), has at least 40 key taps, and at least 80% of the text was typed
  rather than pasted or inserted. Failed attempts get a coarse score only and
  are capped at 20 per day.
- The stamped text hash is computed by the enclave from the keystrokes, not
  supplied by the client. An edited text fails verification.
- Anyone can verify a stamp with the pinned stamp key,
  `ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG`.
- Each stamp names its OutLayer call id. `outlayer-verify` confirms that call's
  Intel TDX quote, the approved worker build, and that the quote commits to the
  exact input and output.

Limits, not solved:

- **Upgrades.** The keys belong to the project, so whoever owns
  `nearthekeyboard.testnet` could publish a version that reads fingerprints or
  signs anything. Every version is public on chain. Freezing the owner account
  or handing the project to a DAO closes this.
- **Input authenticity.** The enclave cannot tell finger taps from invented
  timing sent by a modified keyboard. Android key attestation of the app is the
  planned answer. Reading touches below the app level needs OS or OEM support.
- **Retyping.** Someone who copies AI text by hand from another screen types
  with their own rhythm and gets a stamp. A stamp says "typed by hand by this
  account", not "written without help".
- **Copying a stamped text.** A stamp names the NEAR account that typed the
  text, not the account that posted it. Anyone can repost a stamped text with
  its tag; the check then shows the original typist.
- **Linkability.** Every stamp names the NEAR account, so posting a stamped
  text links that account to wherever the text is posted.
- **Short texts.** Under 40 key taps there is no stamp, because a short reply
  says too little about who typed it.
- **Metadata.** The account name, the operation and the time of each request
  are not sealed. The relay and OutLayer's API see who stamps and when, though
  not the typing.
- **Accuracy.** Tested only on synthetic typists. On three synthetic typists
  the 65% threshold let a deliberately similar typist through 14 times in 42,
  so it is likely too loose; it needs real typing data (TODO.md, 2.6).
- **Stamp ids.** Ten hex characters. OutLayer's public storage has no atomic
  insert, so two stamps made at the same moment with the same id could
  collide; the enclave re-signs when it sees an id taken.
- **The relay.** It only answers polls for calls it started itself, so after a
  relay restart the keyboard signs a fresh request. Behind Cloudflare its
  per-address limits see few distinct addresses; per-account limits still
  apply.
- **Trust base.** Intel TDX, OutLayer's worker and keystore, the list of
  approved worker builds that OutLayer's admin maintains, and the NEAR RPC
  answer to `view_access_key`.

## Planned user flow

Being built; this is the target for the hackathon demo.

1. Install NTK, switch the phone to it, and log in with NEAR. The wallet adds a
   key that can only speak to NTK.
2. Enroll by typing answers to a few prompts. The fingerprint is created inside
   the enclave.
3. Type in any app. Each text field starts a new recording that stays in the
   keyboard's memory.
4. Tap **Sign**. The session goes sealed to the enclave, and on a match the
   keyboard inserts `[NTK <id>]`.
5. Readers who have NTK see the tag as a button. A tap opens the verify page,
   which shows MATCH or NO MATCH for the text next to the tag.

## Layout

```
enclave/   Rust WASI component: model.rs (features, fingerprint, scoring, text rule),
           crypto.rs (transport, NEP-413, stamps), enclave.rs (OutLayer glue, error codes),
           harness.rs (scores real typing sessions for tuning), manifest.json (keys,
           storage and network policy, embedded in the wasm)
client/    Node client and tests: ntk.mjs (protocol, async calls), verify.mjs (check
           stamps), e2e.mjs (end-to-end suite), synth.mjs and synth-export.mjs
           (synthetic typists), vectors.mjs (writes docs/test-vectors/)
web/       ntk.tools: the verify page (/, /<id>), the demo feed (/feed/), the web
           embed (/embed/), lib/ntk-verify.js (the reference verifier), vendor/
relay/     server.mjs: holds the payment key, forwards the five operations; smoke.mjs
deploy/    deploy.sh, nginx site and systemd unit for the server
docs/      protocol.md and the shared test vectors
brand/     build.mjs draws the logo, banners, icons and badge into brand/out/
video/     tools/record.sh (long screen recordings), tools/fwd.mjs (VHS fast-forward)
scripts/   check-secrets.mjs: fails if a key or token is about to be committed
TODO.md    Everything still to build, with priorities
```

Being built: `android/`, `scripts/device/`.

## Hackathon notes

- All code was written inside the hackathon window; the first commit is dated
  2026-11-13. There is no earlier code base.
- The same author also enters a second, independent project (rule Q-015):
  Realsies, <https://github.com/sgraphics/realsies>. The two projects share no
  code.
- Third-party code: OutLayer SDK (`outlayer` 0.2.1, MIT/Apache-2.0), RustCrypto
  and dalek crates, `serde`, `hex`, `base64`, `bs58`, `@noble/*` (MIT; the
  verify page vendors `@noble/ed25519` 3.2.0), `near-api-js` (MIT/Apache-2.0),
  Inter (SIL Open Font License, in `brand/fonts/`), `@resvg/resvg-js`
  (MPL-2.0, brand build only). OutLayer's documentation:
  <https://app.outlayer.ai/docs/getting-started>.
- The code was written with AI coding agents (Claude Code).
- No keys are in this repository. Secrets are read from files outside it or
  from environment variables.

## License

MIT, see [LICENSE](LICENSE).

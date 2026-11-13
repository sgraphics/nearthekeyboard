# NTK — Near The Keyboard

A phone keyboard that lets a person prove "I typed this by hand".

While you type, the keyboard measures **how** you type and sends those
measurements, sealed, into an enclave on [NEAR OutLayer](https://outlayer.ai)
(Intel TDX). The enclave keeps your typing fingerprint where nobody can read
it, not even you. When a new text matches the fingerprint, the enclave signs a
stamp, and a short tag such as `[NTK e65ee28db5]` goes into the text. Anyone can
check the stamp against the text, without an account and without seeing the
fingerprint.

Built at NEAR HACKATHON (Privacy & Private AI track). Testnet only.

## The problem

Text online no longer says who wrote it: anyone can paste a model's answer and
post it as their own. How a text was typed is evidence the finished text does
not carry. But typing rhythm is biometric data, so it must not sit on a server
or in an app where someone can copy it.

## Status

Updated 2026-11-13. Only the first two rows exist. The rest is planned in
[TODO.md](TODO.md).

| Part | Path | State |
|---|---|---|
| Enclave (Rust, wasm32-wasip2) | `enclave/` | Live on OutLayer testnet as `nearthekeyboard.testnet/ntk`; 7 unit tests |
| Protocol client and end-to-end suite | `client/` | 26 checks against the live enclave, with synthetic typists; last full pass 2026-11-13 11:26 UTC |
| Android keyboard: NEAR login, enrollment, Sign key | `android/` | Not started |
| Relay that holds the payment key | `relay/` | Not started |
| Verify page | `web/verify/` | Not started |
| Stamp buttons in other Android apps | `android/` | Not started |
| NEAR AI Cloud: was the text composed or copied | `enclave/` | Not started |

The typing data in the tests is synthetic (two invented typists). It shows that
the pipeline measures, stores, compares and signs correctly. It is not evidence
that the matching works on real people. The enclave returns the tag as
`[NTK @<account> <id>]` today; the short form `[NTK <id>]` is planned.

## Try it

### 1. Check a real stamp (no account, no key)

Do:

```bash
curl -s "https://testnet-api.outlayer.ai/public/storage/get?project=nearthekeyboard.testnet%2Fntk&key=stamp%3Ae65ee28db5&format=raw"
```

See: JSON with `"id":"e65ee28db5"`, `"pk":"ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG"`
(the enclave's stamp key), a signature `sig`, and the signed `record`. The
record is itself a JSON string; it names the account `ntk-alice.testnet`, a
`score_pct` of 98 and the `text_sha256`
`ff70b908dd7fd61ad557b4890f9fa5ad65c85c1cfcd13ac06783a35c40d56afc`.

Do:

```bash
printf %s 'This reply was typed by me, a human, on my own phone, one key at a time.' | sha256sum
```

See: the same `ff70b908…` hash. Change one letter and the hash no longer matches
the stamp. This stamp was produced by the test suite's synthetic typist, not by
a person. The signature check (ed25519 over `NTK-STAMP/v1\n` + record) is
`verifyStamp()` in `client/ntk.mjs`.

### 2. Run the enclave's unit tests

Needs Rust.

```bash
cd enclave && cargo test --release
```

See: `test result: ok. 7 passed`.

### 3. Rebuild the binary that is live

Needs the `wasm32-wasip2` target (`rustup target add wasm32-wasip2`).

```bash
cd enclave && cargo build --target wasm32-wasip2 --release
sha256sum target/wasm32-wasip2/release/ntk-enclave.wasm
```

See: on the author's machine (Windows, Rust 1.91.1) this prints
`5faa7afacd3f2574a79bfb8fa5c3ffed0793e86acc48b79a7943a3bbcdb14bef`, the active
version of the project on chain. Other machines may print a different hash
until the build is pinned (TODO.md, section 1). The project's version list is
public:

```bash
curl -s https://rpc.testnet.fastnear.com -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"outlayer.testnet","method_name":"list_versions","args_base64":"eyJwcm9qZWN0X2lkIjoibmVhcnRoZWtleWJvYXJkLnRlc3RuZXQvbnRrIn0="}}'
```

See: `result.result` is a byte array holding JSON with three versions; the one
with `"is_active":true` has `wasm_hash` `5faa7a…`.

### 4. Run the end-to-end suite on your own deployment

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

See: `22/22 checks passed`, and `client/e2e-report.json` with every call id and
an example stamp. Four more checks run when two optional files exist, which
gives the 26:

- `~/.ntk/alice-fc-keys.json`: `{"fc_other_app": {"contractId", "public_key", "private_key"}, "fc_ntk": {…}}`,
  two function-call keys of the test account, one issued to some other contract
  and one issued to the project owner's account.
- `~/.ntk/alice-payer.env`: `ALICE_PAYMENT_KEY=<a payment key of another account>`.

A run makes about 25 calls at $0.001 of test USDC each. The suite calls
OutLayer synchronously: when a call takes longer than about 100 s, OutLayer's
gateway answers 524 and the run stops. That happened on 2026-11-13 from about
12:00 UTC (TODO.md, section 1).

## How it works

```
keyboard                                  enclave on OutLayer (Intel TDX)
────────                                  ───────────────────────────────
per key tap: dwell, flight, offset
seal the session to the enclave's key ──▶ open it (the key exists only inside the enclave)
sign the request with a NEAR key      ──▶ check the signature, and on chain that the key
                                          belongs to the account
                                          enroll: fold the session into the fingerprint,
                                                  kept sealed in the enclave's storage
                                          stamp:  replay the keystrokes into the text,
                                                  compare with the fingerprint; on a match
                                                  sign the stamp and publish it by id
put the tag into the text             ◀── tag and stamp

anyone: fetch the stamp by its id, check the signature with the pinned stamp key,
        hash the text and compare
```

Per key tap the keyboard reports three things:

1. **dwell**: how long the key is held down, per key;
2. **flight**: the time from releasing one key to pressing the next, per key pair;
3. **offset**: where the finger lands relative to the key's centre (x and y as a
   fraction of the key's size), per key.

The fingerprint is running statistics only (count, mean, variance) per key and
per key pair.

Protocol, as implemented in `enclave/src/` and `client/ntk.mjs`:

- **Operations.** `info`, `enroll`, `stamp`, `status`, `forget`. The input is
  `{"operation", "auth", "sealed"}`.
- **Transport.** A session is sealed with an ephemeral X25519 key, HKDF-SHA256
  and ChaCha20-Poly1305. The additional data names the operation and the
  account.
- **Identity.** Each request carries a NEP-413 signature (the format of NEAR
  wallets' `signMessage`) over `{ntk, op, account, payload, ts}`, where
  `payload` is the hash of the sealed session.
- **Stamp.** The enclave signs `NTK-STAMP/v1\n` + the record below with its
  ed25519 key and publishes it under `stamp:<id>`. The id is the first 10 hex
  characters of the SHA-256 of the signature.

```json
{"v":1,"kind":"ntk-stamp","account":"ntk-alice.testnet","text_sha256":"ff70b9…","text_chars":72,"taps":73,
 "typed_pct":100,"score_pct":98,"threshold_pct":65,"profile_sessions":3,"issued_at_ms":1794569167718,
 "project":"nearthekeyboard.testnet/ntk","network":"testnet","call_id":"3437877d-…","enclave":"0.1.0"}
```

The text hash is of the text with CR removed and surrounding whitespace
trimmed. The enclave returns the tag as `[NTK @<account> <id>]` today. The
planned form is `[NTK <id>]`: the record already names the account and is
looked up by id alone.

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
  list is in the `outlayer.testnet` contract (Try it, step 3).
- **Stamps are public records.** They sit in OutLayer's public storage and are
  read by id without an account.
- **NEAR AI Cloud is not used yet.** It is planned for one job: judging, inside
  a private model, whether a text was composed or copied (TODO.md, section 7).

## What is stored where

| Where | What |
|---|---|
| Enclave storage, sealed | Per account: the fingerprint statistics, counts of sessions, taps and stamps, the time of the last request and of failed attempts. Raw sessions are not kept. |
| OutLayer public storage | Stamp records: account, text hash, character and tap counts, scores, time, call id. No text and no timing. |
| The test client | Nothing. Keys are read from `~/.ntk` and `~/.near-credentials`. |

## Guarantees and limits

Shown by the end-to-end suite on testnet:

- Measurements leave the client sealed to a key that exists only inside the
  enclave run. A relay and OutLayer's API see ciphertext.
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
  are not sealed. A relay and OutLayer's API see who stamps and when, though
  not the typing.
- **Accuracy.** Tested only on synthetic typists. Thresholds need real typing
  data.
- **Trust base.** Intel TDX, OutLayer's worker and keystore, the list of
  approved worker builds that OutLayer's admin maintains, and the NEAR RPC
  answer to `view_access_key`.

## Planned user flow

Not built yet; this is the target for the hackathon demo.

1. Install NTK, switch the phone to it, and log in with NEAR. The wallet adds a
   key that can only speak to NTK.
2. Enroll by typing answers to a few prompts. The fingerprint is created inside
   the enclave.
3. Type in any app. Each text field starts a new recording that stays in the
   keyboard's memory.
4. Tap **Sign**. The session goes sealed to the enclave, and on a match the
   keyboard inserts `[NTK e65ee28db5]`.
5. Readers who have NTK see the tag as a button. A tap opens the verify page,
   which shows MATCH or NO MATCH for the text next to the tag.

## Layout

```
enclave/   Rust WASI component: model.rs (features, fingerprint, scoring),
           crypto.rs (transport, NEP-413, stamps), enclave.rs (OutLayer glue),
           manifest.json (keys, storage and network policy, embedded in the wasm)
client/    Node protocol client and tests: ntk.mjs (protocol), synth.mjs
           (synthetic typists), near.mjs (testnet accounts), e2e.mjs (end-to-end suite)
scripts/   check-secrets.mjs: fails if a key or token is about to be committed
TODO.md    Everything still to build, with priorities
```

Planned: `android/`, `relay/`, `web/`, `brand/`, `video/`.

## Hackathon notes

- All code was written inside the hackathon window; the first commit is dated
  2026-11-13. There is no earlier code base.
- Third-party code: OutLayer SDK (`outlayer` 0.2.1, MIT/Apache-2.0), RustCrypto
  and dalek crates, `serde`, `hex`, `base64`, `bs58`, `@noble/*` (MIT),
  `near-api-js` (MIT/Apache-2.0). OutLayer's documentation:
  <https://app.outlayer.ai/docs/getting-started>.
- The code was written with an AI coding agent (Claude Code).
- No keys are in this repository. Secrets are read from files outside it or
  from environment variables.

## License

MIT, see [LICENSE](LICENSE).

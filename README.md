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
| Enclave v0.2.0 (Rust, wasm32-wasip2) | `enclave/` | Live on OutLayer testnet as `nearthekeyboard.testnet/ntk`; reproducible build (Docker), active version `6fd05f44…`; 16 unit tests |
| Protocol client, end-to-end suite | `client/` | 36 of 36 checks against the live enclave (2026-11-13), synthetic typists |
| Verify page, demo feed, web embed, privacy page | `web/` | Live at <https://ntk.tools> |
| Relay (holds the payment key) | `relay/` | Live at `https://ntk.tools/api`; web and relay: 107 tests |
| Android keyboard | `android/` | Signed release APK at <https://ntk.tools/app/>. Works on the Android emulator: a fresh testnet account enrolled and got MATCH (`[NTK 4420c168c8]`) through the live relay; 28 unit tests, robot typist tests |
| Log in with a NEAR wallet | `web/login/`, `android/` | Login page live at <https://ntk.tools/login/> (NEAR Connect: Meteor, Intear). The app side works with a function-call key added from a script; not yet tried with a real wallet. The testnet faucet account also works |
| Stamp buttons in other Android apps | `android/` | Works in Chrome on the emulator: a button over each tag opens the verify page; also "Verify NTK stamp" in the text selection menu. Not tried in the X app |
| NEAR AI Cloud: composed or copied | — | Not started; needs an API key |

The typing data in the tests is synthetic (invented typists). It shows that
the pipeline measures, stores, compares and signs correctly. It is not
evidence that the matching works on real people.

## Install the keyboard (Android)

Download page: <https://ntk.tools/app/>. The signed APK is
<https://ntk.tools/download/ntk-keyboard-0.3.apk> (1.0 MB, Android 7 or newer,
tested on Android 16), SHA-256
`743bf6611e9918e33e3e0b5b9a122974479080018b4bfd18006e3d3ebfb33413`, signing
certificate `CN=Near The Keyboard`, SHA-256
`09:88:34:DE:9A:59:94:C0:CC:AF:0F:60:E7:4D:35:DF:16:77:D5:3F:62:5A:A1:5D:EB:6A:BD:7C:B2:87:50:65`.

1. Open the APK and allow your browser to install apps when Android asks.
2. In NTK, agree to the terms on the first screen, then turn the keyboard on
   in system settings and switch to it.
3. Log in with a NEAR testnet wallet (Meteor or Intear approve one transaction
   that adds a key that can only sign NTK requests), or let NTK create a
   testnet account.
4. Enroll: type the three short texts.
5. Type anywhere; after 40 keys, tap **sign** on the keyboard's strip. On a
   match the keyboard adds `[NTK <id>]` after your text.
6. Optional: switch on **NTK stamp buttons** under Accessibility to get a button
   on every tag in any app. Sideloaded apps may first need **Allow restricted
   settings** in the app's info screen.

Everything runs on NEAR testnet. Without a phone, the verify page, the demo
feed (<https://ntk.tools/feed/>) and the demo conversation
(<https://ntk.tools/messages/>) work in any browser.

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
cd .. && node --test "web/test/*.test.mjs" "relay/test/*.test.mjs"  # 107 tests: 106 pass, 1 live test skipped
```

### 6. Rebuild the binary that is live

Needs Docker.

```bash
bash enclave/build-reproducible.sh
```

See: `6fd05f445c2170b0b32dcfe0c663c97d06ad122cb52f8309ebb22f4fc125e4ac  ntk-enclave.wasm`,
the hash of the version that is active on chain. The build runs in the
official Rust 1.91.1 image pinned by digest, with the dependencies pinned by
`Cargo.lock` and every path fixed inside the container, so it gives the same
bytes on any machine (two clean builds compared byte for byte). The version
list is public:

```bash
curl -s https://rpc.testnet.fastnear.com -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"outlayer.testnet","method_name":"list_versions","args_base64":"eyJwcm9qZWN0X2lkIjoibmVhcnRoZWtleWJvYXJkLnRlc3RuZXQvbnRrIn0="}}'
```

See: `result.result` is a byte array holding JSON with six versions; the one
with `"is_active":true` has `wasm_hash` `6fd05f44…`. Every OutLayer call's
attestation names the hash of the code that ran, so a stamp's `call_id` ties it
to this build.

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

### 8. Build the keyboard and run the robot typist

Needs JDK 17, the Android SDK and an emulator or phone with USB debugging (on
Windows, run the scripts in Git Bash).

```bash
cd android && ./gradlew assembleDebug testDebugUnitTest   # 16 unit tests
cd .. && bash scripts/device/prepare.sh                  # install, select the NTK keyboard
bash scripts/device/robot.sh                             # capture test, no network
bash scripts/device/robot.sh flow                        # enroll, stamp, impostor (minutes)
```

See: the capture test reports that the keyboard recorded every injected tap
(same keys, times within 5 ms, offsets within 0.02). The flow test creates a
fresh testnet account, enrolls three typing sessions on the enrollment screen,
types "I agree with this, and I typed every word myself." with the NTK keyboard
and taps Sign: the field ends with ` [NTK <id>]`, and `node client/verify.mjs`
says MATCH for it. A second synthetic typist on the same account gets NO MATCH
and nothing is inserted. The typing is injected by the test with synthetic
timing; real human typing has not been tested yet (TODO.md 2.6).

![The NTK keyboard, light](android/docs/screenshots/keyboard-light.png) ![The NTK keyboard, dark](android/docs/screenshots/keyboard-dark.png)

### 9. See the stamp buttons in other apps

With the app installed on an emulator (step 8):

```bash
bash scripts/device/a11y-on.sh        # switch on the "NTK stamp buttons" service
bash scripts/device/button-test.sh    # opens https://ntk.tools/feed/ in Chrome
```

See: an orange "NTK ✓" button sits on the tag of each stamped reply; tapping
it opens the verify page with MATCH. On a phone, switch the service on in
Settings > Accessibility (sideloaded apps may first need "Allow restricted
settings" in the app's info screen).

### 10. Run the site and relay locally

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

## Evidence behind a stamp

Each piece can be checked on its own.

1. **The text.** The enclave rebuilds the text from the keystrokes and hashes
   it itself; the stamp signs that hash. Change one character and the check
   fails.
2. **The typist.** The enclave compares the session's timing and touch
   positions with the account's sealed fingerprint. The score and the threshold
   (80%) are in the signed record.
3. **The account.** Every request is signed with a key of that NEAR account,
   and the enclave checks on chain that the key belongs to it.
4. **The signer.** Only the project's stamp key signs stamps. OutLayer's
   keystore gives it only to this project's runs, and verifiers pin its public
   key.
5. **The code that ran: the attestation.**

   Every stamp names the OutLayer call that issued it (`call_id`). That call
   has an Intel TDX attestation: a quote signed inside the processor that names
   the hash of the code that ran and commits to the exact request and response.
   Anyone can fetch it at
   `https://testnet-api.outlayer.ai/attestations/by-call/<call_id>` and check it
   with `outlayer-verify call <call_id> --network testnet`. That command checks
   Intel's signature chain, that the worker's measurements are on the approved
   list, and that the quote belongs to that input and output. The code hash it
   names can be rebuilt byte for byte from this repository (Try it, step 6), and
   the chain lists every version the project ever activated. So a stamp shows
   not only who typed, but which code decided.
6. **The device and the touches (planned).** Not built yet; see Next
   milestones. Today the enclave cannot tell a finger on a screen from taps that
   software produced.

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
  list is in the `outlayer.testnet` contract, and the active version can be
  rebuilt byte for byte (Try it, step 6).
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
| The stamp-button layer on the phone | Nothing. It reads screen text on the phone to find tags; nothing leaves the phone until you tap a button, which opens the verify page with the text in the address fragment. |

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
- A stamp is issued only when the session matches the fingerprint (80% or
  more; 65% until 2026-11-13, raised after the first real typing test), has at least 40 key taps, and at least 80% of the text was typed
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
- **Input authenticity.** Today the enclave cannot tell a finger on a screen
  from timing that software produced: a modified keyboard, an automation tool
  or an emulator (the project's own test robot types on an emulator).
  Hardware-backed touches are the first item under Next milestones.
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
- **Accuracy.** Mostly tested on synthetic typists. On three synthetic typists
  a 65% threshold let a deliberately similar typist through 14 times in 42; the
  owner's own typing scored 96% in a first real test, so the threshold is now
  80%. It still needs more real typing data (TODO.md, 2.6).
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

## Next milestones

- **Hardware-backed touches.** The aim: no stamp from taps that software
  produced, whether an overlay, an automation tool or an Android emulator
  tapping. Two parts:
  - **Android key attestation, checked in the enclave.** A key in the phone's
    secure hardware signs each session. Its certificate chain, which ends at
    Google's attestation root, states a genuine device with a locked bootloader
    and verified boot, and the exact signing certificate and version of the
    NTK app. An emulator or a modified app cannot produce that chain.
  - **Touches from the physical screen only.** The keyboard counts only touch
    events that come from the phone's hardware touchscreen input device, and
    refuses injected events and virtual input devices. On an attested phone
    with a locked bootloader, other apps cannot fake those.

  Together they add the device to the evidence list: "typed on the physical
  screen of a genuine phone". None of this is built yet. Today the project's
  own test robot types on an emulator, and its stamps are valid.
- **iOS.** A keyboard extension draws its own keys, so it sees the same touch
  timing and positions. Apple's CryptoKit covers the sealing and signatures,
  App Attest gives the app check, and the network needs Full Access. iOS cannot
  draw buttons over other apps, so readers would check stamps through the share
  menu ("Verify NTK stamp") or a Safari extension. Roughly 1 to 2 weeks for one
  iOS developer, plus App Store review.
- **Mainnet.** The OutLayer project owned by a DAO, or frozen, so no one can
  publish a version that reads fingerprints.
- **NEAR AI Cloud.** Judge, inside a private model, whether a text was
  composed or copied.
- **Real typing data.** Tune the matcher with consenting volunteers; keep one
  fingerprint per layout.
- **Store releases.** Google Play after the required closed test, and TestFlight.
- **Privacy of short texts.** A secret part in the tag, so that the public
  record alone cannot confirm a guessed short text.

## User flow

What the demo shows. Steps 1 and 5 with a real wallet and the X app have not
been tried yet; everything else runs on the emulator.

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
           embed (/embed/), the app's wallet login (/login/, bundled with esbuild),
           the privacy page (/privacy/), lib/ntk-verify.js (the reference verifier),
           tools/version-assets.mjs (cache-safe asset links), vendor/
relay/     server.mjs: holds the payment key, forwards the five operations; smoke.mjs
deploy/    deploy.sh, nginx site and systemd unit for the server
docs/      protocol.md and the shared test vectors
brand/     build.mjs draws the logo, banners, icons and badge into brand/out/
video/     tools/record.sh (long screen recordings), tools/fwd.mjs (VHS fast-forward)
android/   the NTK keyboard: Simple Keyboard (Apache-2.0) with NTK's code in
           app/src/main/java/tools/ntk/; NOTICE.md lists every upstream file changed
scripts/   check-secrets.mjs (fails if a key or token is about to be committed),
           audit-android.sh (the keyboard's trust check), device/ (emulator and
           phone helpers, the robot typist runner)
TODO.md    Everything still to build, with priorities
```

## Hackathon notes

- All code was written inside the hackathon window; the first commit is dated
  2026-11-13. There is no earlier code base.
- The same author also enters a second, independent project (rule Q-015):
  Realsies, <https://github.com/sgraphics/realsies>. The two projects share no
  code.
- The keyboard is built on Simple Keyboard by rkkr (Apache-2.0), commit
  `a053c4ca3b61182fc407096ff207d579e5471944`, itself a fork of Android's
  LatinIME; `android/NOTICE.md` lists what NTK changed. It adds one library,
  BouncyCastle (MIT-style licence).
- Third-party code: OutLayer SDK (`outlayer` 0.2.1, MIT/Apache-2.0), RustCrypto
  and dalek crates, `serde`, `hex`, `base64`, `bs58`, `@noble/*` (MIT; the
  verify page vendors `@noble/ed25519` 3.2.0), `near-api-js` (MIT/Apache-2.0),
  Inter (SIL Open Font License, in `brand/fonts/`), `@resvg/resvg-js`
  (MPL-2.0, brand build only), `@hot-labs/near-connect` 0.12.0 (MIT, the login
  page's wallet connector), esbuild (MIT, build only). OutLayer's documentation:
  <https://app.outlayer.ai/docs/getting-started>.
- The code was written with AI coding agents (Claude Code).
- No keys are in this repository. Secrets are read from files outside it or
  from environment variables.

## License

NTK's own code: MIT, see [LICENSE](LICENSE). `android/` is built on Simple
Keyboard and keeps its Apache-2.0 license (`android/LICENSE`).

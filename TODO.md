# NTK — TODO

Deadline: **2026-11-14 23:59 UTC**. By then the repository is public, the demo
post is on X and the submission is sent. Hosted parts stay up until 2026-11-25.

- **P0**: the demo video cannot be recorded without it.
- **P1**: should be in the submission.
- **P2**: after the hackathon.
- **(you)**: needs the project owner: a decision, an account or a device.

Hour figures are rough estimates. Sections 2 to 11 add up to about 35 hours of
work and the test setup of section T to about 3 more. On 2026-11-13 at 13:00 UTC
there were 35 hours left on the clock, so the last section says what to cut
first.

**Next:** section 2 (short tag and text rule) with the async client of section
1; the emulator and device scripts (T.2, T.3); then 3.1 and 3.2 (the keyboard
builds and captures taps) and tuning on real typing (2.6).

## How to work through this list

- Follow the order in the last section, one item at a time.
- Tick an item only after its check has run and passed. Section T says how each
  kind of thing is checked. The commit message names the check.
- Keep the README true at every commit: Status, Try it, Guarantees.
- Keys never enter the repository. They live in `~/.ntk` and
  `~/.near-credentials`, or in environment variables. Run
  `node scripts/check-secrets.mjs` before every push; it must print
  "no secrets found".
- Items marked (you) wait for the owner. Nothing is posted on X, submitted,
  made public or deployed to mainnet without the owner's explicit yes.
- When something here turns out to be wrong, correct this file first.
- When an outside service is slow or down, note it on the item and move to the
  next item that does not depend on it.

---

## 0. Decisions and inputs (you)

Decided by the owner on 2026-11-13:

- [x] **Keyboard base: Simple Keyboard**
  ([rkkr/simple-keyboard](https://github.com/rkkr/simple-keyboard), a small fork
  of Android's own keyboard, with no suggestions and no autocorrect, so every
  character is a key tap). Accepted on the condition that it is trustworthy.
  Checked at commit `a053c4c` (release 6.8, 2026-10-22):
  - Apache-2.0, 96 Java files, about 24,000 lines, no library dependencies.
  - One permission, `VIBRATE`. No internet permission.
  - No network calls, no native code, no code loaded at run time, no bundled
    binaries, no clipboard or file access. Debug logging is switched off.
  - Maintained since 2017, about 40 contributors, a release a month, built from
    source by F-Droid.
  - We build from that pinned commit, so what ships is the code that was
    checked. The check is repeated whenever the commit changes (3.1).
- [x] **License: MIT** for our own code; `LICENSE` is in the repository. The
  Android app keeps the base keyboard's Apache-2.0 license and notices.
- [x] **Demo reply: 45 characters or more.** The 40-tap floor in the enclave
  stays. Scripted reply: "I agree with this, and I typed every word myself."
  (49 characters). The video may speed the typing up (10.3).
- [x] **Hosting: the owner's own server**, set up the way the owner's other
  project on that server is (5.2). Deployed only when the page works and the
  owner says go. The server's address is in the private project notes, never
  in this repository.
- [x] **Keyboard look:** flat, after Dieter Rams, with a light and a dark theme
  (2026-11-14; it replaced the first 8-bit look).

Still open, with the proposed answer first:

- [x] **Domain: `ntk.tools`** (bought 2026-11-13, DNS on Cloudflare, pointed
  at the owner's server). Stamp links read `ntk.tools/<id>`.
- [ ] **Where the relay runs.** Proposed: the same server as the verify page,
  as a small service behind the web server (section 4). A Cloudflare Worker is
  the alternative.
- [ ] **Video format.** Proposed: one video, 16:9, 1080p, under 2:20 (the limit
  for X accounts without Premium), captions burned in, no voice-over, no music
  unless you own a track.
- [ ] **App name and id.** Proposed: "NTK — Near The Keyboard",
  `io.github.sgraphics.ntk`.
- [ ] **Tracks.** Proposed: `privacy` and `open`.

Inputs only you can give:

- [ ] Android phone with USB debugging on (say which model and Android version).
- [ ] A NEAR testnet account in MyNearWallet to log in with.
- [ ] NEAR AI Cloud API key (<https://cloud.near.ai>, or the $10 credit at
  <https://nearbuilders.org/dashboard>).
- [x] The domain registered (`ntk.tools`) and pointed at the server.
- [ ] A go for the first deploy to the server (5.2).
- [ ] Repository made public.
- [ ] The X account: the rules say you publish the post yourself.
- [ ] Submission fields: project name, team lead's name, contact email, team
  size, tracks, mainnet NEAR account for the payout, repository link, demo post
  link, description (20 to 2000 characters), consent to the contact notice.

## 1. Repository

- [x] Repository with the enclave, the client and the tests. No keys.
- [x] **P0** `client/verify.mjs`: `node verify.mjs "<text with its tag>"` prints
  MATCH or NO MATCH and needs no key. Same code as the verify page.
- [x] **P0** Client calls OutLayer with `async: true` and polls
  `GET /calls/{id}`. On 2026-11-13 from about 12:00 UTC a call took about 90 s
  instead of under one. Synchronous calls were cut off by the gateway (524)
  after 100 s. An async call returned its id in under a second and completed
  after 91 s. The end-to-end suite cannot pass in synchronous mode while calls
  are that slow.
- [x] `LICENSE` file (MIT).
- [ ] **P1** README "Try it" steps updated as each part lands: "do X, see Y",
  no marketing.
- [x] **P1** CI on push (.github/workflows/ci.yml): enclave unit tests and wasm
  hash, web and relay tests, the secret check, the Android trust check and JVM
  unit tests. No secrets.
- [x] `scripts/check-secrets.mjs`: fails when a file holds the value of any key
  in `~/.ntk` or `~/.near-credentials`, or something shaped like a private key
  or token. Run before every push.
- [x] **P1** Reproducible enclave build: `enclave/build-reproducible.sh` builds in
  the Rust 1.91.1 image pinned by digest; two clean builds are byte-identical
  (`0d198051…`, then `6fd05f44…` with the 80% threshold), and that build is the
  active version since 2026-11-13.
- [ ] **P1** Tag `hackathon-submission`. The APK goes into a GitHub Release, not
  into the repository.
- [x] Second project disclosed (rule Q-015): this README names Realsies, and
  the Realsies README names NTK.
- [ ] **(you)** Repository public before the deadline.

## T. How everything is tested and recorded (about 3 h to set up, P0)

Everything except real human typing is driven from the computer with `adb`,
which ships with the Android SDK. No other tool is required.

### T.1 Layers

| Layer | Needs | Proves | Run |
|---|---|---|---|
| Unit | nothing | scoring, replay, cryptography, the text rule, the Kotlin port | `cargo test --release` in `enclave/`; `node --test` in `client/`; `./gradlew testDebugUnitTest` |
| Protocol, end to end | a payment key | the enclave on OutLayer, with synthetic typists | `node e2e.mjs` in `client/` |
| Device, automated | an emulator | the real keyboard records what was typed; one session per field; Sign inserts a tag that verifies; the stamp button opens the verify page | `./gradlew connectedDebugAndroidTest` and `scripts/device/` |
| Device, by hand | the phone and you | real typing gets a stamp; thresholds; the video | T.5 |

### T.2 Devices

- [ ] A dedicated emulator with no screen lock and no Google account, API 33
  or later. Start it without a window:
  `emulator -avd <name> -no-window -no-audio -no-boot-anim`. It is ready when
  `adb shell getprop sys.boot_completed` prints 1.
- [x] The test emulator is ready (2026-11-13): a separate image with no screen
  lock, started without a window; screenshots work without one.
- [ ] The phone, for T.5 and T.6. With two devices attached every command
  takes `adb -s <serial>`.
- Disk space is short on the development machine. Delete build output, raw
  captures and old emulator data that are no longer needed, and never write
  video frames to disk (10.2).
- Checked on 2026-11-13 on an API 36 emulator: recording to `/data/local/tmp`,
  the element dump and tap injection run as written below. One `input tap`
  takes 30 to 50 ms.

### T.3 Driving a device: `scripts/device/`

Small scripts, so that each step is one command. On Windows Git Bash set
`MSYS_NO_PATHCONV=1`, or device paths such as `/data/local/tmp` get rewritten.
Write to `/data/local/tmp`, not `/sdcard`, which is missing on a locked device.

- [ ] `install.sh`: build the debug APK and `adb install -r -t` it.
- [ ] `ime-on.sh`: `adb shell ime enable <id>` and `adb shell ime set <id>`,
  where `<id>` is the keyboard's line in `adb shell ime list -a -s`.
- [ ] `a11y-on.sh`:
  `adb shell settings put secure enabled_accessibility_services <package>/<service>`
  and `adb shell settings put secure accessibility_enabled 1`.
- [ ] `shot.sh <name>`: `adb exec-out screencap -p > out/<name>.png`. Whoever
  runs the test then looks at the picture.
- [ ] `ui.sh`: `adb shell uiautomator dump /data/local/tmp/ui.xml`, pull it, and
  print one line per element: text, id, centre x and y.
- [ ] `tap-text.sh "<text>"`: find the element in that dump and
  `adb shell input tap` its centre.
- [ ] `open.sh <url>`: `adb shell am start -a android.intent.action.VIEW -d <url>`.
- [ ] `logs.sh`: `adb logcat -s NTK`. Debug builds log session sizes and states
  under that tag, never keystrokes.
- [ ] `reset.sh`: `adb shell pm clear <package>`.

[mobile-mcp](https://github.com/mobile-next/mobile-mcp) offers the same adb
actions as agent tools (screenshot, element list, tap, type, record, logs). It
is optional: `claude mcp add mobile-mcp -- npx -y @mobilenext/mobile-mcp@latest`.
Neither it nor plain adb can type on our keyboard with exact press and release
times, and `adb shell input text` bypasses the keyboard altogether. T.4 covers
that.

### T.4 The robot typist: exact timing, no human

- [x] An instrumented test in the app (`androidTest`) injects touch events with
  `UiAutomation.injectInputEvent`, choosing the down time, the up time and the
  position of every tap. It reads the key positions from the keyboard (same
  process, a debug-only hook) and replays a session file exported from
  `client/synth.mjs`.
- [x] Capture test: what the keyboard recorded equals what was injected: the
  same keys, times within 5 ms, offsets within 0.02.
- [x] Flow test: typist A enrolls with three sessions, types a reply in the demo
  feed and taps Sign; the tag appears and `client/verify.mjs` says MATCH.
  Typist B types on A's account: NO_MATCH, and nothing is inserted.
- [x] (Text inserted without taps, e.g. `adb shell input text`, is not counted as
  typed, so Sign refuses it as pasted; a cursor moved from outside marks the
  session changed.) Field tests: a password field records nothing; another field starts a new
  session; `adb shell input text` (text without taps) marks the session
  changed; an emptied field starts a new session.
- [x] Button test: with the service of section 6 on, a screenshot shows a
  button over the tag on the demo feed, a tap opens the verify page, and the
  element dump contains MATCH.
- [x] Automated runs log in with the faucet account (the fallback in 3.4). The
  wallet flow is tested once on the emulator with a throwaway testnet account,
  stepping through the wallet pages with `tap-text.sh` and screenshots.
- Rough typing without the robot: `adb shell input swipe x y x y <ms>` is a tap
  held for that long.
- The robot is for tests and rehearsals. It never types in the published video.

### T.5 By hand on the phone (you)

- [ ] Enroll and stamp with your own typing. Export the sessions (debug build)
  for 2.6. A friend types on your account as the impostor.
- [ ] The full run before recording: fresh install, log in, enroll, reply on the
  demo feed, Sign, tap the button, MATCH, change a word, NO MATCH.

### T.6 Recording

- [ ] Prepare the phone from the computer. Taps visible:
  `adb shell settings put system show_touches 1`. A clean status bar through
  System UI's demo mode: `adb shell settings put global sysui_demo_allowed 1`,
  then `adb shell am broadcast -a com.android.systemui.demo -e command enter`,
  `… -e command clock -e hhmm 1200`,
  `… -e command notifications -e visible false`, and `… -e command exit`
  afterwards. Do Not Disturb on.
- [ ] One file per storyboard row:
  `adb shell screenrecord --bit-rate 16000000 --time-limit 120 /data/local/tmp/shot5.mp4`,
  then `adb pull`. A file holds 180 s at most. scrcpy with `--record` is the
  alternative.
- [ ] You type; the computer starts and stops the recording. Each shot is
  rehearsed on the emulator with the robot first.
- [ ] Each file is checked with `ffprobe` (size, length, frame rate) and by
  looking at three frames taken with ffmpeg.
- [ ] `video/build.sh` renders the animation, joins it with the shots, applies
  the speed changes, burns in the captions and exports. It then checks the
  result: 140 s or less, under 512 MB, H.264 with AAC, and a frame at every
  caption time looked at for legibility.

## 2. Protocol v0.2: enclave and client (about 2 h, P0)

A redeploy adds a version on chain; the keys stay with the project.

- [x] **2.1 Short tag.** The enclave returns `[NTK <id>]`, without the account.
  Stamps are already stored and looked up by id alone, and the signed record
  names the account. Verifiers accept both forms:
  `\[NTK(?: @[^\s\]]+)? ([0-9a-f]{10})\]`.
- [x] **2.2 Text rule v2.** This is what makes "the text around the button"
  checkable.
  - Canonical text: turn every run of whitespace (CR included) into one
    space, trim. The exact rule is in docs/protocol.md.
  - The record carries `"v":2`. `text_sha256` is the hash of the canonical
    replayed text and `text_chars` is its length in Unicode scalar values.
  - A stamp covers the `text_chars` characters right before its tag. A verifier
    takes the canonical text before the tag, keeps the last `text_chars`
    characters and compares the hash. Anything earlier in the same text block
    (a name, a handle, older text) does not matter.
  - Verifiers show exactly which text is covered.
  - v1 stamps (whole text, trim only) still verify.
- [x] **2.3 Never overwrite a stamp.** (Done as get-then-set: OutLayer's
  public storage has no atomic insert.) Before publishing, check that
  `stamp:<id>` is absent; if it is taken, sign again with a new time. Ten hex
  characters start to collide at around a million stamps.
- [x] **2.4 Session fields.** `layout` names the layout and orientation. `mode`
  is `compose` or `copy` on enrollment sessions. It is stored now so that
  composed and copied typing can be told apart later.
- [ ] **2.5 Edits in the middle of a text** are not in v0.2. The replay knows
  appending, backspace and inserted text. The keyboard refuses to sign when the
  field changed in any other way (3.3).
- [ ] **2.6 Tune on real typing (P0, start as soon as 3.2 works).** The matcher
  was tuned on invented typists, and real typing varies far more. If it is not
  tuned, your own typing may fail the 65% threshold during the demo.
  - A native harness reads session files from `typing-data/` (ignored by git)
    and prints score distributions: you against yourself, someone else against
    you.
  - Tune `MATCH_THRESHOLD`, `DIST_SCALE`, the noise floors, the group weights,
    `MIN_STAMP_TAPS`, `MIN_PROFILE_TAPS`.
  - Real sessions are biometric data. Use your own and a consenting friend's,
    and never commit them.
  - [x] The harness exists: `cargo run --release --bin harness -- <dir>`
    (enclave/src/harness.rs). On three synthetic typists a deliberately
    similar typist passed 14 times in 42 at 65%, so the threshold is
    probably too loose. Real sessions are still needed.
  - [x] 2026-11-13: the owner's own typing scored 96% in a first real test;
    MATCH_THRESHOLD raised to 0.80 (active version 6fd05f44…).
- [x] **2.7** Unit tests for 2.1 to 2.4, end-to-end suite updated, redeployed,
  new hash in the README.
- [x] **P1 2.8** Error codes next to error texts, for the keyboard's messages.

## 3. Android keyboard: `android/` (about 12 h, P0)

One app with two services: the keyboard, and the stamp-button layer of
section 6.

### 3.1 Base and build (1.5 h)

- [x] Import Simple Keyboard at commit
  `a053c4ca3b61182fc407096ff207d579e5471944` into `android/`, with its
  `LICENSE`. Name the commit in the README. The README's license section then
  says: our code MIT, `android/` built on Apache-2.0 code.
- [x] Repeat the trust check on the imported tree and keep it as
  `scripts/audit-android.sh`, run in CI:
  - the manifest's permissions;
  - the `dependencies` block in `app/build.gradle`;
  - no match for `java.net`, `HttpURLConnection`, `Socket`, `WebView`,
    `DexClassLoader`, `Runtime.getRuntime`, `ProcessBuilder`,
    `System.loadLibrary`;
  - no `.so`, `.jar`, `.aar` or `.dex` file.

  After our changes the only additions allowed are the `INTERNET` permission,
  our network code in one package, and the cryptography library.
- [x] Build setup. The base uses Gradle 9.6, the Android Gradle plugin 9.4.1,
  `compileSdk` and `targetSdk` 37, `minSdk` 24.
  - Its repository has `gradlew` but no wrapper jar. Make one in an empty
    folder with any installed Gradle (`gradle wrapper --gradle-version 9.6.0`)
    and copy `gradle/wrapper/gradle-wrapper.jar` in, or let Android Studio
    sync the project once.
  - SDK platform 37 is downloaded by the plugin on the first build when the
    SDK licences are accepted.
  - Check which JDK the plugin needs. JDK 17 is the system one; Android Studio
    ships a JDK 21 (`JAVA_HOME` can point to it).
- [x] Rename the package, the app and the icon.
- [x] `./gradlew assembleDebug` builds and the APK installs with `adb install`.
- [x] Add the `INTERNET` permission. The README says exactly what the keyboard
  sends and when: a sealed session on Enroll and on Sign, nothing else.

### 3.2 Capture (2.5 h)

- [x] Per tap: what the key produced (`k`), touch-down and touch-up time in ms
  since the session started (`d`, `u`, from `MotionEvent.getEventTime()`), and
  the offset of the touch-down point from the key's centre as a fraction of the
  key's width and height (`x`, `y`). Hook where the base resolves a pointer's
  down and up to a key: `PointerTracker.onDownEvent` and `onUpEvent` in
  `keyboard/PointerTracker.java`, which already receive the event time.
- [x] Control keys are logged with timing as `<bksp>`, `<shift>`, `<sym>`,
  `<enter>`. One `<bksp>` per Unicode scalar removed; repeat-deletes are logged
  one by one.
- [ ] Text that enters without taps is logged as `{"ins": "…"}` when the
  keyboard can see what arrived. The base has no clipboard key, so such text
  comes from the app (a paste from its menu); when the keyboard cannot tell
  what changed, the session is marked changed (3.3). (code written, not tested yet)
- [x] Events are in key-down order. Two thumbs overlapping gives a negative
  flight, which the enclave allows.
- [ ] Stamps in portrait only for now; landscape disables Sign.
- [x] The base's two swipe settings, `pref_space_swipe` (moves the cursor) and
  `pref_delete_swipe`, change the text or the cursor without single taps. Both
  are off by default; remove them from the settings screen so they stay off.
- [x] Debug build only: export my own sessions over adb into `typing-data/` for
  2.6. The release build has no export path.
- [ ] Test: a recorded sample gives the same features in Kotlin as `extract()`
  gives in Rust. (Not done: the capture test compares recorded with injected taps instead.)
- [x] Test: the capture test of T.4 passes on the emulator.

### 3.3 One recording per text field (1.5 h)

- [x] A new field starts a new session (`onStartInput` with a new package or
  field id). `onFinishInput` drops it. Sessions live in memory only, never on
  disk, and are cleared after sending.
- [ ] No recording and no Sign key in password fields, or when the app asks for
  no learning (`IME_FLAG_NO_PERSONALIZED_LEARNING`, used by incognito tabs). (code written, not tested yet)
- [ ] A field emptied by its app (a sent message) starts a new session. (code written, not tested yet)
- [ ] If the cursor moved or the text changed outside the keyboard's log, the
  session is marked changed and Sign says "retype to sign". At Sign time the
  keyboard also checks that the field's text before the cursor ends with the
  replayed text. (code written, not tested yet)
- [x] After a tag is inserted a new session starts, so a later stamp covers only
  what was typed after the previous tag.
- [ ] Limit of 20,000 events per session, the enclave's limit. (code written, not tested yet)

### 3.4 Log in with NEAR (2 h)

- [x] Generate an ed25519 key on the phone. The private key is encrypted with
  an Android Keystore key.
- [x] **Changed 2026-11-13:** MyNearWallet answers that it "no longer accepts new
  app connections". New route: the app opens `https://ntk.tools/login#pk=…&return=ntk://auth`,
  where the user's own wallet (NEAR Connect: Meteor or Intear) adds the app's
  key as a function-call key for `nearthekeyboard.testnet`, then the page
  returns to `ntk://auth`. Live; the app side is tested with a key added by
  `scripts/device/wallet-login.sh`.
- [ ] **(you)** Try the login with a real testnet wallet in Meteor (steps in
  web/login: open the app, Log in with a NEAR wallet, approve one Add Key
  transaction, return to the app).
- [ ] (Replaced) Open the wallet in a browser tab:
  `https://testnet.mynearwallet.com/login/?contract_id=nearthekeyboard.testnet&public_key=…&success_url=…&failure_url=…`.
  The wallet adds a function-call key whose receiver is
  `nearthekeyboard.testnet`, the one kind of delegated key the enclave accepts.
- [x] Return to the app through a custom-scheme `success_url` (`ntk://auth`). If
  the wallet refuses that, use an https page of ours that forwards to the app.
- [x] Confirm on chain that the key is on the account with that receiver, then
  call `status`.
- [x] (No longer applies: the login page adds the key itself.) Check that the wallet accepts a `contract_id` with no contract deployed.
  If it does not, deploy a minimal contract there.
- [x] Fallback if the wallet flow fails on the day: "create a testnet account
  for me" through the testnet faucet. The app then holds that account's
  full-access key. Testnet only, and labelled as such.
- [ ] Risk seen 2026-11-13: the testnet faucet refused new accounts from the
  dev machine's address for about 3 hours (HTTP 429). Phones on the same
  network hit the same limit. If it matters for the demo or for judges: the
  relay could create sub-accounts of a funded NTK testnet account instead
  (as `scripts/device/wallet-key.mjs` does with NTK_PARENT).
- [ ] Log out deletes the local key and links to the wallet's key list. "Delete
  my fingerprint" calls `forget`. (code written, not tested yet)
- [x] Before login and enrollment the keyboard types normally and the Sign key
  opens setup.

### 3.5 Enrollment (1 h)

- [x] A consent screen first: what is measured, where it goes, that it is
  biometric data, how to delete it.
- [x] Three prompts on our own screen, typed with NTK:
  1. "Type what you ate yesterday and how you liked it." (compose)
  2. Copy a shown sentence. (copy)
  3. One more free prompt. (compose)
- [x] Each prompt needs 30 taps or more; the fingerprint needs 2 sessions and
  120 taps (the enclave's current minimums). Aim for 300 or more.
- [x] The enrollment field marks itself (`privateImeOptions`) so the keyboard
  sends `enroll`, not `stamp`.
- [x] Result screen "Fingerprint created, sealed in the enclave", driven by the
  enclave's `ready` answer. No fingerprint data comes back to the phone.

### 3.6 Sign key (1.5 h)

- [x] A strip above the keys: status light, account name, and the Sign key,
  which fills up as the session approaches 40 taps.
- [x] On tap: check locally (taps, typed share, field unchanged), get `info`
  (cached), seal, sign (NEP-413), send through the relay as an async call, poll,
  show progress. Typing is held while the call runs, so the tag lands right
  after the text it covers.
- [x] MATCH: verify the returned stamp against the pinned stamp key before
  inserting anything, then insert ` [NTK <id>]` at the cursor.
- [x] NO_MATCH: show the reason and the coarse score and insert nothing. Show
  the attempts left today (the cap is 20).
- [x] Errors and timeouts insert nothing. A retry signs a fresh request, because
  the enclave refuses replays.
- [x] Java port of `client/ntk.mjs` (seal, NEP-413, verify, text rule) checked
  against test vectors from the Node client and the Rust tests. Cryptography
  comes from a maintained library (BouncyCastle or Tink).
- [x] The stamp key and transport key are pinned in the app, with a warning if
  `info` ever returns different ones.

### 3.7 Look (about 2 h, P0 for the video; see section 8)

The look since 2026-11-14: flat, after Dieter Rams, from the owner's own mock.
One flat colour per surface, no gradients and no outlines, thin black type,
one accent. It replaced the first 8-bit look of 13 November.

- [x] **Light theme.** Strip `#F3F6FC`, floor `#E6EAF2`, keys `#ECEFF6`, black
  legends. Orange `#FD5B15` with white text on the Sign key only.
- [x] **Dark theme, the same design.** It follows the system's dark mode. The
  base's own themes (`res/values/themes-lxx-*.xml`) stay beside ours.
- [x] **The NTK mark at the top left of the strip**, the only branding on the
  keyboard.
- [x] **Keys do not move.** A theme changes how keys are drawn, never where
  they are or how big. The fingerprint stores where the finger lands on each
  key, so key positions and sizes are fixed before anyone enrolls, and both
  themes share them.
- [x] While a Sign or Enroll call runs, the keys are dimmed and the strip shows
  a radio-dial meter.
- [ ] Pressed keys, the key preview and the long-press popup follow the theme.
  A press darkens the key by one step.
- [ ] Legends keep a contrast of 4.5 to 1 or better in both themes.
- [x] Setup, consent and enrollment screens in the same style.
- [x] Screenshots of both themes in the README.

## 4. Relay: `relay/` (about 1 h, P1)

The payment key must not be inside the app, and the enclave serves only calls
its owner pays for. Proposed place: the same server as the verify page, as a
small Node service behind the web server, the way the owner's other project
there runs its relay (5.2). A Cloudflare Worker is the alternative.

- [x] One endpoint forwards `{input}` to OutLayer with the payment key from a
  server-side secret, and passes the polling of `GET /calls/{id}` through.
  OutLayer's answer is returned unchanged.
- [x] `deploy/ntk-relay.service`: a systemd unit that runs the relay as the
  `ntk` user on 127.0.0.1, with the hardening lines the other project's unit
  uses (`NoNewPrivileges`, `ProtectSystem`, `ProtectHome`, `PrivateTmp`). The
  payment key is in `/opt/ntk/.env`, mode 600, outside git.
- [x] Only the five operations; a body size limit; rate limits per IP address
  and per account.
- [x] The README says what the relay can and cannot do. It cannot read sessions
  (sealed) or act for a user (requests are signed and bound to the sealed
  session). It does see account names, operations, times and sizes.
- [ ] Keep-warm: call `info` every few minutes while demoing.
- [ ] **Fallback (P0 path if the relay slips):** a debug build calls OutLayer
  directly with a testnet payment key read from `local.properties` (ignored by
  git). That APK is never given to anyone.

## 5. Verify page: `web/verify/` (about 3.5 h with its deploy, P0)

### 5.1 The page (2 h)

A static page with no backend. OutLayer's public storage answers with
`access-control-allow-origin: *` (checked 2026-11-13), so the browser can fetch
stamps itself.

- [x] Input: the address `https://<domain>/<id>#t=<text, base64url>`, or a box
  to paste a whole message with its tag. The id is in the path and the text in
  the fragment, so the text never reaches a server. Only the stamp id goes
  over the network.
- [x] A list of what was checked, each line pass or fail:
  1. the stamp exists under that id;
  2. its key is the pinned stamp key;
  3. the signature is valid;
  4. the id belongs to that signature;
  5. the covered text hashes to `text_sha256` (rule 2.2);
  6. the issuing call: link to its attestation and the `outlayer-verify`
     command that proves it;
  7. the NEAR AI result and its attestation, once section 7 exists.
- [x] Result in large type: MATCH, NO MATCH or UNKNOWN STAMP. Shown with it: the
  NEAR account, the time, the typed share, the match score, the tap count, the
  covered text in quotes, and a "testnet" label.
- [x] One sentence under the result saying what a stamp means and does not
  mean: typed by hand by this account, not "written without help".
- [x] No build step: a few small ES modules and one vendored ed25519 module
  (`web/vendor/`), with a SHA-256 fallback for plain-http origins.
- [x] Styled per section 8. Works on a phone screen.

### 5.2 Deploy to the owner's server (1.5 h) — live at https://ntk.tools since 2026-11-13

Decided: the verify page and the demo feed are served from the owner's own
server, set up the way the owner's other project on that server is. Deploy
only when the page works locally and the owner says go. The server's address
and that project's deploy files are in the private project notes. No address,
key or certificate enters this repository; `<server>` below stands for that
address.

- [x] `deploy/deploy.sh`, run on the server as root. The app lives in
  `/opt/ntk`, owned by a system user `ntk`. The script fast-forwards to the
  pushed commit, installs, builds, installs the service file and restarts only
  the NTK service. While the GitHub repository is private the commit is pushed
  from the development machine straight to the server:
  `git push root@<server>:/opt/ntk main:refs/heads/incoming`, then
  `ssh root@<server> 'cd /opt/ntk && NO_PULL=1 bash deploy/deploy.sh'`.
- [x] `deploy/nginx/ntk.conf`: a file of its own with its own `server_name`.
  Static files for `/` (the verify page) and `/feed/` (the demo feed); `/api/`
  goes to the relay (section 4). The same listening scheme as the other site
  on that server: port 80, and TLS on the port its front proxy forwards to.
- [x] A certificate for the chosen domain from Let's Encrypt, obtained the same
  way as the other site's and renewed by the existing timer.
- [x] **(you)** DNS for the chosen domain points at the server, through the
  same provider as the other site.
- [x] **The server is shared with a live project.** Add files; never edit the
  other project's. Run `nginx -t` before `systemctl reload nginx`, and reload,
  never restart. Do not touch the other project's services, certificates or
  folders. After every change check that its site still answers.
- [x] After a deploy: the page answers over https; the example stamp shows
  MATCH; one changed word shows NO MATCH; the relay answers `info`.
- [x] **(you)** Go for the first deploy.

## 6. Stamp buttons in other apps (about 3 h, P1)

The Android way to do this without root is an accessibility service in the same
app. It can read the text on screen and draw over it.

- [x] The service scans visible text for `[NTK <id>]` when the screen content
  changes or stops scrolling.
- [x] It draws a pixel-style button over the tag, using character positions
  where the app provides them (`EXTRA_DATA_TEXT_CHARACTER_LOCATION_KEY`) and the
  end of the text block otherwise. Buttons hide while scrolling and return when
  the screen is still.
- [x] Text capture: the text before the tag in the same text block. If the block
  is shorter than the stamp covers, the text of the blocks before it in the same
  container is added. Rule 2.2 then picks the exact characters.
- [x] Tap: open the verify page in the browser with the id in the path and the
  captured text in the address fragment (5.1).
- [x] Privacy: the service reads screen text on the phone only to find the tag.
  Nothing leaves the phone until the user taps a button. Say so in setup and in
  the README.
- [x] Setup step to switch the service on. On Android 13 and later a sideloaded
  app may first need "Allow restricted settings" in its App info screen.
- [ ] Test on the demo feed in Chrome (done: button test) and in the X app (not yet).

Ways that need no accessibility permission (pick one as the fallback for the
video):

- [x] **Web embed (P0 fallback, 0.5 h):** `web/embed/ntk-embed.js` turns tags
  into buttons on any page that includes it. The demo feed includes it.
- [x] **Text selection menu:** "Verify NTK stamp" (`ACTION_PROCESS_TEXT`) on
  selected text in any app.
- [ ] **Clipboard:** when the copied text contains a tag, the keyboard offers
  "Verify copied stamp".

## 7. NEAR AI Cloud (about 3 h, P1)

One job: judge whether a text was composed or copied. The privacy track names
NEAR AI Cloud, and it is one of the players the video should show.

- [ ] **(you)** API key.
- [ ] First a script, `client/nearai-check.mjs`: one completion on a TEE-hosted
  model from the models endpoint (`https://cloud-api.near.ai/v1`), then fetch
  the attestation with a fresh nonce and verify it as the
  [verification docs](https://docs.near.ai/cloud/verification) describe. Print
  what was checked.
- [ ] Then inside the enclave: the NEAR AI host added to the manifest's network
  list, the API key held as an OutLayer secret, the request made with
  `wasi-http-client`.
- [ ] What is sent: the final text and the list of revisions (what was deleted
  and retyped). Never timing, never the fingerprint.
- [ ] What comes back: for each revision "typo fix" or "change of wording", and
  one composed-or-copied figure.
- [ ] The figure is one capped input to the stamp and never the verdict: the
  user controls the text, so the model can be talked into anything.
- [ ] The stamp record names the model and carries the response signature. The
  verify page checks it (5, line 7).
- [ ] README: the enclave is no longer "no outbound network" but "outbound only
  to NEAR AI Cloud, carrying text and revisions".
- [ ] If this is not live when the video is made, the video does not show it as
  working.

## 8. Visual design, logo, banner: `brand/` (about 2.5 h, P0 for logo and banner)

Direction since 2026-11-14: flat, after Dieter Rams, from the owner's own
mock. It replaced the first 8-bit direction of 13 November. Every piece has a
light and a matching dark version.

- [x] **Palette:** strip and header `#F3F6FC`, floor `#E6EAF2`, keys `#ECEFF6`,
  black legends; the accent, orange `#FD5B15`, with white text on it; the NTK
  mark's own orange `#FF4F00`; MATCH in green.
- [x] **Type:** the system font on Android; Inter on the web and in the video.
- [x] **NTK mark:** the letters NTK in two orange lines, with a rounded N; next
  to it, NEAR THE over KEYBOARD in two small lines.
- [x] **Keyboard image:** a smooth white keyboard seen at an angle
  (`brand/lib/keyboard.mjs`), on the site and on the video's end card.
- [x] **Banner:** 1280×640, the GitHub social preview and the README header.
- [x] **App icon:** an Android adaptive icon with a monochrome layer.
- [x] **Keyboard badge:** the NTK mark, for the top left of the strip (3.7).
- Dropped with the 8-bit direction: pixel-art sprites and motifs from films.
- [ ] NEAR, OutLayer and NEAR AI appear as text labels. Their logos are used
  only as their brand rules allow.

## 9. Demo feed page: `web/demo-feed/` (about 1 h, P0)

- [x] A mock social feed that reads like X without using X's name, logo or
  assets. Phone-first layout. Invented accounts only.
- [x] One post to reply to, on the theme of machine-written replies.
- [x] A reply box. A posted reply is added to the thread and kept in the
  browser only.
- [x] Replies render as plain text, with each tag in its own element so the
  button of section 6 can sit exactly on it.
- [x] `?embed=1` loads the web embed; without it the page relies on the Android
  layer.
- [x] One reply with a real stamp is built in, so a judge without a phone can
  click it, see MATCH, edit the text and see NO MATCH.
- [x] Hosted next to the verify page.

## 10. Video: `video/` (about 5.5 h, P0)

What the hackathon brief asks of the demo: lead with the user's problem; show
one complete moment from a real action to a visible result; skip long intros,
architecture slides and setup; say concretely what NEAR does; give a next step.
The brief does not mention captions. They are here because X plays video muted.

### 10.0 Proof videos (done 2026-11-13, not the launch video)

- [x] `video/tools/proof-keyboard.sh` → `video/out/proof-keyboard.mp4` (87 s):
  faucet account, consent, three prompts typed by the robot, fingerprint
  ready, the feed, the reply typed with NTK, Sign, `[NTK 1488e8ed42]`, MATCH.
- [x] `video/tools/proof-click-layer.sh` → `video/out/proof-click-layer.mp4`
  (57 s): the stamp-button service on, the button on a reply's tag, MATCH,
  then one word changed and NO MATCH.
- Both carry the label "typing by the test robot (synthetic typist)" and mark
  sped-up parts with FWD ▶▶. Not in git (video/out is ignored); copies are on
  the dashboard. The keyboard video still shows the old site look and badge.

### 10.1 Storyboard, first version

| # | Time | Picture | Caption |
|---|---|---|---|
| 1 | 0:00–0:07 | The feed, scrolling | "Anyone can paste AI text and call it their own." Then: "Near The Keyboard lets you prove you typed it." |
| 2 | 0:07–0:20 | Phone: choose the NTK keyboard, Log in with NEAR, the wallet approves | "Log in with your NEAR account. The wallet gives the keyboard a key that can only talk to NTK." |
| 3 | 0:20–0:40 | Enrollment prompt "Type what you ate yesterday and how you liked it", typing in fast-forward (10.3), "Fingerprint created" | "Type a few sentences. NTK measures how you type: how long you hold a key, how fast you move to the next, where your finger lands." |
| 4 | 0:40–1:05 | Animation A | "The measurements are sealed on the phone and opened only inside an enclave on OutLayer." Then: "Your fingerprint stays there. Nobody can read it: not us, not OutLayer, not you." |
| 5 | 1:05–1:25 | Phone: the feed, Reply, typing "I agree with this, and I typed every word myself." in fast-forward, Sign, the tag appears, post | "Reply to a post and tap Sign." |
| 6 | 1:25–1:50 | Animation B | "NEAR confirms the key is yours." "The enclave compares this typing with your fingerprint." "A private model on NEAR AI Cloud checks whether the text was composed or copied." "Only the enclave's key can sign the stamp." |
| 7 | 1:50–2:05 | Phone: the tag is a button, tap, the verify page shows MATCH; one word changed, NO MATCH | "Anyone can check it. Change one word and it fails." |
| 8 | 2:05–2:13 | Banner, repository address | "Near The Keyboard. Built at NEAR HACKATHON." |

- [ ] Shots 2 and 3 are setup, which the brief says to keep short: 33 s at most.
  If the first cut feels slow, move shot 5 in front of them.
- [x] The reply in shot 5 has 45 characters or more (decided; the scripted
  reply has 49).

### 10.2 Animation

- [ ] One fixed stage with every player always visible and labelled: the phone
  with the NTK keyboard (left), the OutLayer enclave (centre), NEAR (top),
  NEAR AI Cloud (top right), the reader (right).
- [ ] **A, enrollment:** a finger taps keys; each tap releases three small
  shapes (hold, travel, landing point); they are packed into a capsule that
  closes; the capsule travels to the enclave; it opens only inside; the shapes
  settle into the fingerprint; the enclave closes.
- [ ] **B, stamp:** a capsule travels to the enclave; a key goes up to NEAR and
  comes back confirmed; inside, the new shapes are laid over the fingerprint
  and a meter fills; the text goes to NEAR AI Cloud and a result comes back;
  the enclave presses a stamp; the tag travels back into the text; the reader
  looks the stamp up and gets MATCH.
- [ ] Slow and clear: one thing moves at a time, every beat lasts 2 s or more,
  the moving thing is orange, no cuts inside a sequence.
- [ ] Drawn by a script, `video/render.mjs`: sprites on a 320×180 stage scaled
  six times without smoothing to 1920×1080, captions set at full resolution in
  the normal font. Changing a timing means running it again, not editing by
  hand.
- [ ] The script sends its frames straight into ffmpeg through a pipe. No
  frame files are written: two minutes of 1080p frames would take several GB
  and the disk is short.

### 10.3 Recording and assembly

- [ ] Phone recording as in T.6: taps visible, notifications off, clean status
  bar, one file per storyboard row.
- [ ] **Fast-forward for typing.** Typing shots are sped up, not cut away.
  While the picture runs fast it shows `FWD` and a `▶▶` icon in a corner, like
  a video recorder's on-screen display, and VHS tracking lines drift across
  the frame. Both are in the pixel style, and both vanish when the speed
  returns to normal. The marker is also the honest label that the shot is
  sped up.
- [ ] The effect is made in `video/build.sh` with ffmpeg: `setpts` for the
  speed, an overlay for the marker, and a moving band of noise and line shift
  for the tracking lines. Keep it light: the text on the phone stays readable.
- [ ] "Testnet" is visible.
- [ ] Only what works is shown. A part that is not built is left out of the
  animation.
- [ ] Captions: `video/captions.srt` in the repository and burned into the
  picture with ffmpeg. Two lines at most, about 42 characters a line, on screen
  2 s or longer.
- [ ] Export: MP4, H.264, 30 fps, under 2:20 and under 512 MB.
- [ ] A poster frame from the banner.
- [ ] The MP4 goes to the X post and a GitHub Release, not into the repository.
- [ ] Optional: a 20 to 30 s cut of shots 1, 5 and 7 as a teaser.

## 11. Launch post and submission (about 1 h, P0)

### 11.1 The post on X, typed and stamped with NTK

- [ ] **(you)** Type the post on the phone with NTK and tap Sign, so the launch
  post carries its own stamp.
- [ ] Order inside the post: the hand-typed text, then the tag, then mentions,
  hashtag and links. A stamp covers only what stands before its tag. X rewrites
  links, and picking a suggested @name or #tag inserts text the keyboard did
  not type; both would break the check if they stood before the tag.
- [ ] The stamped part has 40 taps or more.
- [ ] The post says the project was built at NEAR HACKATHON, tags @NEARProtocol
  and #NEARHackathon (optionally @NearLegion and @NearBuilders), has the video
  attached, links the repository and asks one real question.
- [ ] Length: 280 characters without Premium. The tag takes 17 with its space
  and a link counts as 23.
- [ ] Links in the post use the chosen domain (section 0), which must be live
  before posting.
- [ ] Rehearse in the composer without posting: sign, paste the text into the
  verify page, see MATCH. Then post.
- [ ] After posting, check the stamp on the live post with the button of
  section 6, and record that as the last shot or as a reply.
- [ ] Draft of the post text, for you to rewrite in your own words.

### 11.2 Submission

Sent once, and only after you have confirmed the exact payload.

- [ ] Repository public; README final; LICENSE in place.
- [ ] Verify page, demo feed, relay and the enclave's payment key all live and
  funded until 2026-11-25.
- [ ] The values listed in section 0 collected from you; nothing guessed.
- [ ] The payload printed for you, then one POST to
  `https://nearhackathon.com/api/applications`. The `requestId` is kept for
  retries. The payload is never committed.
- [ ] A mistake after sending is fixed at
  <https://nearhackathon.com/request-changes>, never by sending again.

## 12. After the hackathon (P2)

- [ ] Android key attestation of the app, checked in the enclave, so invented
  timing from a modified keyboard is refused.
- [ ] Touches from the physical screen only: count only events from the hardware
  touchscreen input device; refuse injected events and virtual devices.
- [ ] iOS: keyboard extension (Full Access), CryptoKit, App Attest; readers via
  a share extension and a Safari extension (no overlays on iOS).
- [ ] Freeze the owner account or hand the OutLayer project to a DAO, so nobody
  can publish a version that reads fingerprints.
- [ ] A typing study with consenting volunteers: real error rates, thresholds,
  how much enrollment is enough.
- [ ] Composition signals beyond revisions: pauses, bursts, the difference
  between each person's copy and compose sessions.
- [ ] Edits in the middle of a text in the protocol.
- [ ] One fingerprint per layout and orientation.
- [ ] Linkability: every stamp names the NEAR account. Look at per-site
  identities.
- [ ] Longer stamp ids before mainnet.
- [ ] Store listing: the accessibility service needs a policy declaration, or
  the stamp buttons move to the other routes of section 6.
- [ ] Browser extension for desktop readers.
- [ ] Mainnet.

## Order of work, and what to cut

1. Section 2 (short tag, text rule) and the async client (section 1).
2. The emulator and the device scripts (T.2, T.3). Then 3.1 to 3.3 with the
   debug fallback of section 4 and the robot typist (T.4), so taps reach the
   enclave and the capture test passes.
3. Tuning on real typing (2.6). Everything after depends on your own typing
   getting a stamp.
4. Login (3.4), enrollment (3.5), Sign (3.6), with the flow test of T.4.
5. Verify page (5.1), demo feed with the web embed (9, 6). Deploy to the
   server (5.2) once they work and the owner has said go and chosen a domain.
6. Logo, banner, the keyboard's light and dark themes and its badge (8, 3.7).
7. Relay (4), the Android button layer (6), NEAR AI (7).
8. Video (10), post and submission (11). Recording starts no later than
   2026-11-14 14:00 UTC.

If time runs out, cut in this order: NEAR AI inside the enclave (keep the
script, drop it from the animation); the Android button layer (use the web
embed and the paste box); wallet login (use the faucet account); the relay (use
the debug build); the styling of the setup screens; the dark theme (keep the
light theme and the badge, which the owner asked for).

Never cut: real typing to a stamp, the verify page showing MATCH, the video, the
README, the submission.

Risks to watch:

- **Slow enclave calls.** About 90 s per call on 2026-11-13 from 12:00 UTC, up
  from under one second in the morning. A Sign that takes 90 s cannot be
  filmed. Async calls and polling keep it working; record when calls are fast,
  and ask OutLayer if it lasts.
- **Real typing may not match.** Section 2.6, as early as possible.
- **Disk space.** The development machine had 38 GB free on 2026-11-13. A new
  emulator, Android builds and video work all need room.
- **A shared server.** The verify page goes onto a server that runs another
  live project. Rules in 5.2.
- **Wallet redirect into the app.** Fallback: the faucet account.
- **The button layer in other apps.** Fallback: the web embed.

## Done

- [x] Enclave live on OutLayer testnet as `nearthekeyboard.testnet/ntk`;
  7 unit tests.
- [x] End-to-end suite: 26 of 26 checks against the live enclave (last full run
  2026-11-13 11:26 UTC).
- [x] The binary built from this repository has the hash of the active version
  on chain (`5faa7afa…`, checked 2026-11-13).
- [x] Repository created.

# NTK for Android: the keyboard, and stamp buttons in other apps

The NTK app is a keyboard that measures how you type and, when you tap
**Sign**, gets a stamp from the NTK enclave on NEAR OutLayer (testnet): the
keyboard adds ` [NTK <id>]` after your text, and anyone can check it at
`https://ntk.tools/<id>`. The same app can put an **NTK ✓** button on every tag
you see in other apps. It is built on [Simple Keyboard](https://github.com/rkkr/simple-keyboard)
(Apache-2.0); `NOTICE.md` lists everything NTK adds and changes, `PRIVACY.md`
says what leaves the phone and when.

## Build and install

JDK 17 and the Android SDK (`local.properties`: `sdk.dir`). From this folder:

    ./gradlew assembleDebug                # app/build/outputs/apk/debug/app-debug.apk
    ./gradlew testDebugUnitTest            # JVM unit tests

From the repository root, with an emulator or a phone attached
(`scripts/device/`, Git Bash on Windows works):

    bash scripts/device/prepare.sh         # install, switch the keyboard on and select it
    bash scripts/device/a11y-on.sh         # switch the stamp buttons on (tests; users do it in Settings)

A debug build may call OutLayer directly with a testnet payment key from
`local.properties` (`ntk.paymentKey`, ignored by git) when the relay is down.
Release builds only use the relay at `https://ntk.tools/api` and hold no key.

## Using it

1. **Keyboard.** Turn NTK on in the system settings and switch to it. The strip
   above the keys shows the badge, a status light, your account and the
   **Sign** key, which fills as you near the 40 key taps a stamp needs.
2. **NEAR account.** Either **Log in with a NEAR wallet**: the app makes a key
   and opens `https://ntk.tools/login#pk=<key>&return=ntk%3A%2F%2Fauth&network=testnet`;
   that page asks your wallet to add the key to your account as a
   function-call key for `nearthekeyboard.testnet`, then returns to
   `ntk://auth?account_id=<account>&public_key=<key>`. The app checks on chain
   that exactly this key is there with that receiver before it logs in. Or
   **Create a testnet account for me**: the public testnet faucet makes an
   account whose full-access key stays on the phone (testnet only).
3. **Enroll.** A consent screen, then three short prompts typed with NTK. The
   sessions are sealed on the phone to the enclave's key; the fingerprint is
   kept in the enclave.
4. **Sign** in any app: the session of the current field is sealed, signed
   and sent; on MATCH the keyboard checks the stamp against the pinned key and
   inserts the tag after your text.
5. **Stamp buttons in other apps** (setup step 5). An accessibility service,
   off until you switch it on: Settings, Accessibility, NTK stamp buttons. On
   Android 13 and later a sideloaded app may first need App info, ⋮, *Allow
   restricted settings*. The service reads the text on screen when it changes
   or a scroll comes to rest, finds tags, and draws a button over each visible
   one, on the tag's characters where the app reports where they are
   (`EXTRA_DATA_TEXT_CHARACTER_LOCATION_KEY`; Chrome does) and at the end of
   the text block otherwise. Buttons hide while the screen scrolls. A tap reads
   the text before the tag in the same text block (plus the text nodes before
   it in the same container when an app splits a block into several nodes) and
   opens `https://ntk.tools/<id>#t=<text, base64url>` in the browser. Nothing
   leaves the phone until a tap.
6. **Verify NTK stamp** in the text selection menu of any app (no permission
   needed): select text that contains a tag, choose it in the menu, and the
   verify page opens for the first tag with the text before it.

## Tests

| What | Command (repository root) | Last result on the Android 16 emulator, 2026-11-13 (Polestar look, enclave 0d198051…) |
|---|---|---|
| Unit: crypto vectors, text rule, sessions, verify and login links, tag text, badge | `cd android && ./gradlew testDebugUnitTest` | 30 tests pass |
| Capture: the keyboard records what the robot injected | `bash scripts/device/robot.sh` | pass: 72 of 72 taps, times exact, offsets within 0.005 |
| Flow: faucet account, three enrollments, stamp MATCH, impostor NO_MATCH | `bash scripts/device/robot.sh flow` | pass earlier (stamp `4420c168c8`); in the last run the faucet answered HTTP 429 (a few accounts per address and day), so the flow ran on a wallet-route account (next line) |
| Wallet login without a wallet, then the flow on that account | `bash scripts/device/wallet-login.sh` (with `NTK_PARENT=<funded testnet account>` it makes a sub-account instead of asking the faucet), then `adb shell am instrument -w -e class tools.ntk.FlowTest -e account current tools.ntk.keyboard.test/androidx.test.runner.AndroidJUnitRunner` | pass: function-call key on `ntkr-363e47a3.ntkw-1e2ec567.testnet`, three enrollments, stamp `0395d66e86` MATCH, impostor NO_MATCH (score 10%); earlier `ntkw-1e2ec567.testnet`, stamp `1258da40d5` |
| Fields: password field, text without taps, cursor moved from outside, emptied field | `adb shell am instrument -w -e class tools.ntk.FieldTest tools.ntk.keyboard.test/androidx.test.runner.AndroidJUnitRunner` | 4 of 4 pass |
| Button: the feed's tag gets a button; a tap opens the verify page with MATCH | `bash scripts/device/button-test.sh [feed url] [stamp id]` | pass, on the built-in reply (`e65ee28db5`) and on a reply typed in Chrome (`1488e8ed42`) |
| Selection menu: Chrome, select text with a tag, ⋮, Verify NTK stamp | by hand (screenshots), or `adb shell am start -a android.intent.action.PROCESS_TEXT -t text/plain --es android.intent.extra.PROCESS_TEXT '<text with tag>' -n tools.ntk.keyboard/tools.ntk.ui.VerifySelectionActivity` | MATCH |

What the field tests check: a password field gets no session and Sign says
"Password field: nothing is recorded". Text that arrives without key taps
(`adb shell input text`) is recorded as inserted, not typed (34 inserted
events, 59% typed in the test), so Sign refuses on the phone ("Too much of this
text was pasted, not typed"); when the cursor was moved from outside the
keyboard and text put in the middle, the session is marked changed and Sign
says "Retype to sign". A field emptied by its app starts a new session.

The robot typist taps synthetic sessions on the real keyboard with exact
times (`app/src/androidTest/`, sessions from `client/synth.mjs` via
`tools/export-sessions.mjs`). It is for tests, rehearsals and labelled proof
videos, never for the published demo. `ScriptTest` lets a script on the
computer drive the screens while the robot types: `video/tools/proof-keyboard.sh`
(account, enrollment, a stamped reply in the feed) and
`video/tools/proof-click-layer.sh` (the stamp button, MATCH, NO MATCH) record
the two proof videos into `video/out/`, with taps shown and the robot's typing
and the waits fast-forwarded and labelled.

## Debug builds

Debug builds (never distributed) add a section to the setup screen: where
enclave calls go (relay URL, or OutLayer directly with the payment key from
`local.properties`) and which site the verify and login links use (default
`https://ntk.tools/`; scripts can pass `--es ntk.site <url>` to the setup
activity). They also save sent sessions in app-private storage
(`scripts/device/typing-data.sh`), expose the key geometry to the robot, and
log session sizes, states and stamp-button positions under the tag `NTK`,
never typed or screen text.

## Credits

Built on [Simple Keyboard](https://github.com/rkkr/simple-keyboard) by rkkr and
its contributors, a fork of the Android Open Source Project's LatinIME,
licensed under the Apache License 2.0 (`LICENSE`). Simple Keyboard is
available on [F-Droid](https://f-droid.org/packages/rkr.simplekeyboard.inputmethod/)
and [Google Play](https://play.google.com/store/apps/details?id=rkr.simplekeyboard.inputmethod).

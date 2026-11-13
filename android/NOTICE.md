# NOTICE: the NTK keyboard is built on Simple Keyboard

This directory is [Simple Keyboard](https://github.com/rkkr/simple-keyboard)
(Apache-2.0, see `LICENSE`) at commit
`a053c4ca3b61182fc407096ff207d579e5471944` (release 6.8, 2026-10-22), copied
without its `.git` folder, with the changes listed below. Simple Keyboard is a
fork of the Android Open Source Project's LatinIME. Its copyright notices are
kept in every file. Files we added are MIT-licensed NTK code (see the
repository's `LICENSE`) unless they say otherwise.

`scripts/audit-android.sh` (at the repository root) repeats the trust check of
TODO.md 3.1 on this tree: permissions, dependencies, network and code-loading
calls, bundled binaries.

## What NTK adds

- The app id `tools.ntk.keyboard` and the name "NTK". Upstream's Java packages
  are kept; NTK's code is in the package `tools.ntk` (`app/src/main/java/tools/ntk/`).
- Calls go through the NTK relay (`https://ntk.tools/api`), which holds the
  OutLayer payment key. Debug builds can instead call OutLayer directly with a
  testnet payment key from `local.properties` (chosen on the setup screen); release
  builds cannot.
- One permission, `INTERNET`, and one library, BouncyCastle
  (`org.bouncycastle:bcprov-jdk18on`, MIT-style licence) for Ed25519, X25519,
  ChaCha20-Poly1305 and HKDF-SHA256. All HTTP is in `tools.ntk.net`.
- Capture: per key tap, what the key produced, touch-down and touch-up time and
  the touch point's offset from the key's centre; one session per text field,
  in memory only (`NtkCapture`, `TypingSession`).
- The strip above the keys: badge, status light, account, Sign key
  (`ui/StripView`), and Sign: local checks, sealing, NEP-413 signature, the
  asynchronous enclave call, the stamp check against the pinned key, the tag
  (`SignFlow`, `NtkController`, `NtkCrypto`, `StampCheck`, `TextRule`).
- NEAR login (testnet faucet account, or a NEAR wallet through the NTK login
  page, which has the wallet add the phone's key as a function-call key for
  `nearthekeyboard.testnet`) with the private key encrypted by an Android
  Keystore key (`AccountStore`), and the setup and enrollment screens
  (`ui/SetupActivity`, `ui/EnrollActivity`). The login page's address and the
  verify page's address are built in `Links`.
- Stamp buttons in other apps: an accessibility service, off until the user
  switches it on (`a11y/StampButtonService`, the button `a11y/StampButtonView`,
  the text logic `a11y/TagText`, `res/xml/ntk_stamp_buttons.xml`). It reads
  screen text on the phone only, to find tags, and opens the verify page in
  the browser when a button is tapped. It has no network code.
- "Verify NTK stamp" in the text selection menu of any app
  (`ui/VerifySelectionActivity`, `ACTION_PROCESS_TEXT`).
- The NTK keyboard theme: one design in light and dark, keys drawn in code as
  blocks like the site's buttons (`ui/PixelKeyDrawable`, `ui/Pixel.block`: a
  top face, lit and shaded side faces, a soft drop, all inside the key's
  bounds; a press moves the top face down), colours from
  `brand/palette.json`, the brand badge and launcher icon from `brand/out/android/`
  (redrawn 2026-11-13: the badge is the NTK mark as vector drawables,
  `drawable/ntk_badge_light.xml` and `ntk_badge_dark.xml`, whose gaps are painted
  in each theme's `ntk_background`; `ui/BadgeView` picks the one for the current
  theme and draws it smoothly at any height).
- Debug builds only (`app/src/debug/`): sent sessions are saved in app-private
  storage (`files/typing-data/`), and a key-geometry hook serves the robot
  typist test. Release builds compile `app/src/release/`, which does neither.
- Tests: JVM unit tests against `docs/test-vectors/` and `web/lib/ntk-verify.js`
  (`app/src/test/`), and the robot typist (`app/src/androidTest/`: capture,
  flow, field and stamp tests, and `ScriptTest` for rehearsals and proof
  videos) with sessions exported from `client/synth.mjs` by
  `tools/export-sessions.mjs`.
- `gradle/wrapper/gradle-wrapper.jar`: Gradle's own 9.6.0 wrapper (upstream has
  `gradlew` but no jar); its SHA-256 is pinned in `scripts/audit-android.sh`.

## Upstream files changed

| File | Change |
|---|---|
| `.gitignore` | Track the Gradle wrapper; ignore only `app/release/` output, not the `app/src/release/` source set. |
| `gradle.properties` | `android.useAndroidX=true`, for the instrumented tests' AndroidX Test runner (test APK only). |
| `app/build.gradle` | App id, version name, BuildConfig fields (relay URL; testnet payment key from `local.properties` in debug builds only), BouncyCastle, test dependencies, test resources. |
| `app/src/main/AndroidManifest.xml` | `INTERNET`; backups off (the account key must not leave the phone); NTK's setup and enrollment activities (setup is the launcher and receives `ntk://auth`); the stamp-button accessibility service; the "Verify NTK stamp" selection-menu activity; the brand launcher icon. |
| `keyboard/PointerTracker.java` | Calls `NtkCapture` on touch down, touch up (also "phantom" ups when a second finger lands), long press and key repeat. |
| `latin/inputlogic/InputLogic.java` | Reports what each key produced (one character, `\n` for a line break, or `<bksp>`, `<shift>`, `<sym>`, `<enter>`, …) and how the cursor moved; text from the paste key is reported as inserted. |
| `latin/LatinIME.java` | Tells `NtkCapture` when a field starts and ends and when the selection moves. |
| `keyboard/MainKeyboardView.java` | Ignores touches while a stamp request runs (typing is held); the language name on the spacebar goes on the key's top face. |
| `keyboard/KeyboardView.java` | A key's legends, hint and icon are laid out on the top face of a block key (`ui/PixelKeyDrawable`), which moves when pressed. Drawing only: key bounds and touch areas are unchanged. |
| `keyboard/KeyboardSwitcher.java` | The strip and the keys form one frame, which is what is shown and touchable. |
| `keyboard/KeyboardTheme.java`, `res/values/attrs.xml`, `res/values/keyboard-themes.xml` | The NTK theme (id 7), the default. |
| `latin/settings/Settings.java`, `res/xml/prefs_screen_preferences.xml`, `res/xml/prefs_screen_appearance.xml` | Space swipe and delete swipe always off and removed from settings; keyboard height and bottom offset locked (the fingerprint depends on where fingers land). |
| `res/layout/input_view.xml`, `res/layout-v28/input_view.xml` | The strip above the keys, at a fixed height. |
| `res/values/strings-appname.xml`, `res/values/strings.xml` | The name "NTK"; the privacy link points to NTK. |
| `res/values/colors.xml` | `ic_launcher_background` moved to the brand's file. |
| `PRIVACY.md` | Replaced: NTK sends data (see the file). |
| `README.md` | Replaced: how to build, use and test the NTK app; Simple Keyboard's credits kept at the end. |

Translations still mention "Simple Keyboard" in one setup message.

- Removed upstream `metadata/` (the F-Droid store listing of Simple Keyboard, with its screenshots): it describes Simple Keyboard, not NTK.

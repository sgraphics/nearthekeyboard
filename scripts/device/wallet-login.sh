#!/usr/bin/env bash
# The wallet login, app side, without a wallet (TODO.md 3.4, T.4):
#  1. taps "Log in with a NEAR wallet": the app makes its key and opens
#     https://ntk.tools/login#pk=…&return=ntk%3A%2F%2Fauth&network=testnet;
#  2. reads the app's public key (debug build: its own preferences, public half only);
#  3. does the wallet's part from this computer (scripts/device/wallet-key.mjs):
#     a fresh faucet account gets that key as a function-call key for nearthekeyboard.testnet;
#  4. opens ntk://auth?account_id=…&public_key=… as the login page would.
# The app then checks the key on chain and logs in.
#   bash scripts/device/wallet-login.sh
set -e
. "$(dirname "$0")/_lib.sh"
adb shell am start -n "$PKG/tools.ntk.ui.SetupActivity" >/dev/null
sleep 2
if ! bash "$(dirname "$0")/tap-text.sh" "Log in with a NEAR wallet" >/dev/null; then
  echo "no wallet button: log out in the app first (or bash scripts/device/reset.sh)"; exit 1
fi
sleep 2
pk=$(adb exec-out run-as "$PKG" cat shared_prefs/ntk_account.xml | tr -d '\r' | sed -n 's:.*<string name="public_key">\(ed25519\:[^<]*\)</string>.*:\1:p')
[ -n "$pk" ] || { echo "the app made no key"; exit 1; }
echo "app key: $pk"
echo "browser: $(bash "$(dirname "$0")/ui.sh" | grep -m1 url_bar | cut -f1)"
link=$(cd "$REPO" && node scripts/device/wallet-key.mjs "$pk")
echo "link: $link"
adb shell am start -a android.intent.action.VIEW -d "'$link'" >/dev/null
for _ in $(seq 1 30); do
  sleep 2
  status=$(bash "$(dirname "$0")/ui.sh" | grep -m1 -E "Logged in as|Wallet login failed" || true)
  [ -n "$status" ] && break
done
echo "app: ${status:-no answer yet}"
bash "$(dirname "$0")/ui.sh" | grep -m1 "function-call key" || true

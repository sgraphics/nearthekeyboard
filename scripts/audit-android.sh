#!/usr/bin/env bash
# Trust check of the Android app (TODO.md 3.1). Run from anywhere; exit 1 on any failure.
#
#   bash scripts/audit-android.sh
#
# The keyboard is built on Simple Keyboard (android/NOTICE.md), which was checked
# at commit a053c4c: one permission (VIBRATE), no dependencies, no network, no
# native or dynamically loaded code, no bundled binaries. This script repeats that
# check on the tree as it is now. The only additions allowed are the INTERNET
# permission, NTK's network code in one package (tools.ntk.net), and the
# cryptography library (BouncyCastle). Test code (src/test, src/androidTest) does
# not ship and is not checked.
set -u
cd "$(dirname "$0")/../android" || exit 1

fail=0
pass() { printf 'pass  %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }

# Source sets that end up in an APK.
SHIPPED="app/src/main app/src/debug app/src/release"
NET_PKG="app/src/main/java/tools/ntk/net/"

# 1. Permissions in the manifest: VIBRATE (base keyboard) and INTERNET (NTK), nothing else.
perms=$(grep -ho 'uses-permission[^>]*android:name="[^"]*"' app/src/main/AndroidManifest.xml | sed 's/.*android:name="//; s/"$//' | sort)
expected=$(printf 'android.permission.INTERNET\nandroid.permission.VIBRATE\n')
if [ "$perms" = "$expected" ]; then pass "permissions: $(echo $perms)"; else bad "permissions: $(echo $perms) (expected INTERNET and VIBRATE only)"; fi
for d in app/src/debug app/src/release; do
  if [ -f "$d/AndroidManifest.xml" ] && grep -q 'uses-permission' "$d/AndroidManifest.xml"; then bad "$d/AndroidManifest.xml adds permissions"; fi
done

# 2. Dependencies: one shipped library, BouncyCastle. Test-only configurations are listed, not shipped.
deps=$(sed -n '/^dependencies *{/,/^}/p' app/build.gradle | grep -E "^\s*([A-Za-z]*(Implementation|implementation)|api|compileOnly|runtimeOnly)\s" | sed 's/^ *//')
shipped=$(echo "$deps" | grep -E "^(implementation|api|runtimeOnly|debugImplementation|releaseImplementation) " || true)
if [ "$(echo "$shipped" | grep -c .)" = "1" ] && echo "$shipped" | grep -q "org.bouncycastle:bcprov-jdk18on:"; then
  pass "shipped dependencies: $shipped"
else
  bad "shipped dependencies are not exactly BouncyCastle: $(echo "$shipped" | tr '\n' ';')"
fi
echo "      test-only: $(echo "$deps" | grep -E "^(testImplementation|androidTestImplementation) " | awk '{print $2}' | tr '\n' ' ')"
if grep -qE "^\s*(classpath|id)\b" app/build.gradle; then bad "app/build.gradle declares plugins or classpath entries"; fi

# 3. Code that could reach the network, run other code or load native code.
check() { # $1 = label, $2 = regex, $3 = allowed directory (optional)
  local hits
  hits=$(grep -rnE "$2" $SHIPPED --include=*.java --include=*.kt 2>/dev/null || true)
  if [ -n "${3:-}" ]; then hits=$(echo "$hits" | grep -v "^$3" || true); fi
  hits=$(echo "$hits" | grep . || true)
  if [ -z "$hits" ]; then pass "$1${3:+ (only in ${3#app/src/main/java/})}"; else bad "$1:"; echo "$hits" | sed 's/^/        /'; fi
}
check "no java.net outside the network package" 'java\.net\.' "$NET_PKG"
check "no HttpURLConnection outside the network package" 'HttpURLConnection' "$NET_PKG"
check "no Socket" '\bSocket\b|SSLSocket|ServerSocket|DatagramSocket'
check "no WebView" 'WebView'
check "no DexClassLoader" 'DexClassLoader|PathClassLoader|InMemoryDexClassLoader'
check "no Runtime.getRuntime" 'Runtime\.getRuntime'
check "no ProcessBuilder" 'ProcessBuilder'
check "no System.loadLibrary" 'System\.load(Library)?\('
net_files=$(grep -rlE 'java\.net\.|HttpURLConnection' $SHIPPED --include=*.java 2>/dev/null | sort | tr '\n' ' ')
echo "      network code: ${net_files:-none}"

# 4. No binaries in the tree, except Gradle's own wrapper jar, pinned by checksum.
WRAPPER_SHA256=497c8c2a7e5031f6aa847f88104aa80a93532ec32ee17bdb8d1d2f67a194a9c7 # gradle-9.6.0-wrapper.jar
bins=$(find . \( -path ./build -o -path ./app/build -o -path ./.gradle -o -path ./.idea \) -prune -o -type f \( -name '*.so' -o -name '*.jar' -o -name '*.aar' -o -name '*.dex' -o -name '*.apk' \) -print | grep -v '^./gradle/wrapper/gradle-wrapper.jar$' || true)
if [ -z "$bins" ]; then pass "no .so, .jar, .aar, .dex or .apk files"; else bad "binary files in the tree:"; echo "$bins" | sed 's/^/        /'; fi
if [ -f gradle/wrapper/gradle-wrapper.jar ]; then
  sum=$( (sha256sum gradle/wrapper/gradle-wrapper.jar 2>/dev/null || shasum -a 256 gradle/wrapper/gradle-wrapper.jar) | awk '{print $1}')
  if [ "$sum" = "$WRAPPER_SHA256" ]; then pass "gradle-wrapper.jar is Gradle's published 9.6.0 wrapper ($sum)"; else bad "gradle-wrapper.jar checksum $sum is not Gradle 9.6.0's"; fi
fi
if grep -q 'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.6.0-bin.zip' gradle/wrapper/gradle-wrapper.properties; then
  pass "wrapper downloads Gradle 9.6.0 from services.gradle.org"
else
  bad "gradle-wrapper.properties does not point at Gradle 9.6.0"
fi

# 5. Debug-only code stays in src/debug; release has no keystroke export, no key geometry hook, no payment key.
if grep -rqE 'typing-data|DebugKeys|getFilesDir' app/src/main app/src/release --include=*.java; then
  bad "session export or key geometry code outside src/debug"
else
  pass "session export and the key geometry hook are in src/debug only"
fi
if sed -n '/release *{/,/}/p' app/build.gradle | grep -q "NTK_PAYMENT_KEY\", ntkQuote('')"; then
  pass "release builds get an empty payment key"
else
  bad "the release build type does not set an empty NTK_PAYMENT_KEY"
fi
if grep -rnE 'Log\.[dviwe]\([^)]*(getText|textBefore|replay\(\)\.text|\.k\b)' app/src/main --include=*.java | grep -q .; then
  bad "a log line may print typed text"
else
  pass "no log line prints typed text"
fi

if [ "$fail" = 0 ]; then echo "audit passed"; else echo "audit FAILED"; fi
exit "$fail"

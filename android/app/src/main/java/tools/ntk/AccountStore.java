package tools.ntk;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Log;

import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The NEAR account the keyboard signs requests for, and its ed25519 key. The
 * private key is stored encrypted with an AES key that lives in the Android
 * Keystore and never leaves it. Also keeps what the enclave last said about
 * enrollment, the last request time (ts must increase) and failed attempts.
 * Each network keeps its own (Network.accountPrefs; testnet's is the file used
 * before networks), so switching networks keeps both logins.
 */
public final class AccountStore {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "ntk-account-key-v1";

    public static final String KIND_FAUCET = "faucet";
    public static final String KIND_WALLET = "wallet";

    /** The account in use. */
    public static final class Account {
        public final String accountId;
        public final String publicKey;
        public final String kind;

        Account(String accountId, String publicKey, String kind) {
            this.accountId = accountId;
            this.publicKey = publicKey;
            this.kind = kind;
        }
    }

    private static AccountStore sInstance;
    private final Context mContext;

    private AccountStore(Context context) {
        mContext = context.getApplicationContext() != null ? context.getApplicationContext() : context;
    }

    public static synchronized AccountStore get(Context context) {
        if (sInstance == null) sInstance = new AccountStore(context);
        return sInstance;
    }

    /** The current network's. Null before the first unlock (direct boot), when the account storage is not readable. */
    private SharedPreferences prefs() {
        try {
            return mContext.getSharedPreferences(Network.current(mContext).accountPrefs, Context.MODE_PRIVATE);
        } catch (IllegalStateException e) {
            return null;
        }
    }

    public synchronized Account current() {
        final SharedPreferences p = prefs();
        if (p == null || !p.getBoolean("active", false)) return null;
        final String id = p.getString("account_id", null);
        final String pk = p.getString("public_key", null);
        if (id == null || pk == null) return null;
        return new Account(id, pk, p.getString("kind", KIND_FAUCET));
    }

    /** An account whose key is saved but not yet confirmed (faucet pending, wallet login pending). */
    public synchronized Account pending() {
        final SharedPreferences p = prefs();
        if (p == null || p.getBoolean("active", false)) return null;
        final String id = p.getString("account_id", null);
        final String pk = p.getString("public_key", null);
        if (pk == null) return null;
        return new Account(id, pk, p.getString("kind", KIND_FAUCET));
    }

    /** Makes a new key and saves it (encrypted) before anything is sent anywhere. */
    public synchronized Account createPending(String accountIdOrNull, String kind) throws Exception {
        final byte[] seed = new byte[32];
        new SecureRandom().nextBytes(seed);
        final String pk = Codec.ed25519String(NtkCrypto.ed25519Public(seed));
        final String enc = encrypt(seed);
        java.util.Arrays.fill(seed, (byte) 0);
        final SharedPreferences p = prefs();
        if (p == null) throw new IllegalStateException("unlock the phone first");
        p.edit().clear()
                .putString("account_id", accountIdOrNull)
                .putString("public_key", pk)
                .putString("kind", kind)
                .putString("seed", enc)
                .putBoolean("active", false)
                .commit();
        return new Account(accountIdOrNull, pk, kind);
    }

    public synchronized void activate(String accountId) {
        final SharedPreferences p = prefs();
        if (p == null) return;
        p.edit().putString("account_id", accountId).putBoolean("active", true).commit();
    }

    /** Log out: deletes the local key and everything stored about the account. */
    public synchronized void clear() {
        final SharedPreferences p = prefs();
        if (p != null) p.edit().clear().commit();
    }

    /** The private key seed, decrypted for one signature. Callers wipe it after use. */
    public synchronized byte[] seed() throws Exception {
        final SharedPreferences p = prefs();
        final String enc = p == null ? null : p.getString("seed", null);
        if (enc == null) throw new IllegalStateException("no key");
        return decrypt(enc);
    }

    /** A request time in ms, always greater than the last one (the enclave refuses replays). */
    public synchronized long nextTs() {
        final SharedPreferences p = prefs();
        final long last = p == null ? 0 : p.getLong("last_ts", 0);
        final long ts = Math.max(System.currentTimeMillis(), last + 1);
        if (p != null) p.edit().putLong("last_ts", ts).commit();
        return ts;
    }

    // ---- what the enclave last said -------------------------------------------------

    public synchronized void saveEnrollment(int sessions, long taps, boolean ready) {
        final SharedPreferences p = prefs();
        if (p == null) return;
        p.edit().putInt("enroll_sessions", sessions).putLong("enroll_taps", taps).putBoolean("ready", ready)
                .putBoolean("enroll_known", true).apply();
    }

    public synchronized void forgetEnrollment() {
        final SharedPreferences p = prefs();
        if (p == null) return;
        p.edit().remove("enroll_sessions").remove("enroll_taps").remove("ready").remove("enroll_known")
                .remove("fails").apply();
    }

    public synchronized boolean enrollmentKnown() {
        final SharedPreferences p = prefs();
        return p != null && p.getBoolean("enroll_known", false);
    }

    public synchronized boolean isReady() {
        final SharedPreferences p = prefs();
        return p != null && p.getBoolean("ready", false);
    }

    public synchronized int enrolledSessions() {
        final SharedPreferences p = prefs();
        return p == null ? 0 : p.getInt("enroll_sessions", 0);
    }

    public synchronized long enrolledTaps() {
        final SharedPreferences p = prefs();
        return p == null ? 0 : p.getLong("enroll_taps", 0);
    }

    /** Failed stamp attempts in the last 24 hours, as this phone counted them. */
    public synchronized int failsLast24h() {
        return recentFails().size();
    }

    public synchronized void addFail() {
        final List<Long> f = recentFails();
        f.add(System.currentTimeMillis());
        final StringBuilder b = new StringBuilder();
        for (Long t : f) {
            if (b.length() > 0) b.append(',');
            b.append(t);
        }
        final SharedPreferences p = prefs();
        if (p != null) p.edit().putString("fails", b.toString()).apply();
    }

    private List<Long> recentFails() {
        final List<Long> out = new ArrayList<>();
        final SharedPreferences p = prefs();
        final String s = p == null ? "" : p.getString("fails", "");
        final long now = System.currentTimeMillis();
        for (String part : s.split(",")) {
            try {
                final long t = Long.parseLong(part.trim());
                if (now - t < 24L * 3600 * 1000) out.add(t);
            } catch (NumberFormatException ignored) {
                // skip
            }
        }
        return out;
    }

    // ---- Android Keystore ---------------------------------------------------------------

    private static SecretKey keystoreKey() throws Exception {
        final KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        final KeyStore.Entry e = ks.getEntry(KEY_ALIAS, null);
        if (e instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) e).getSecretKey();
        final KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        g.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return g.generateKey();
    }

    private static String encrypt(byte[] plain) throws Exception {
        final Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, keystoreKey());
        final byte[] ct = c.doFinal(plain);
        return Codec.b64(c.getIV()) + ":" + Codec.b64(ct);
    }

    private static byte[] decrypt(String s) throws Exception {
        final int i = s.indexOf(':');
        final byte[] iv = Codec.unb64(s.substring(0, i));
        final byte[] ct = Codec.unb64(s.substring(i + 1));
        final Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, keystoreKey(), new GCMParameterSpec(128, iv));
        return c.doFinal(ct);
    }

    /** "ntk-" + 8 random hex characters + ".testnet". */
    public static String randomTestnetName() {
        final byte[] b = new byte[4];
        new SecureRandom().nextBytes(b);
        return String.format(Locale.ROOT, "ntk-%s.testnet", Codec.hex(b));
    }

    static void log(String msg) {
        Log.i(Ntk.TAG, msg);
    }
}

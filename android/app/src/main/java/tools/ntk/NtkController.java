package tools.ntk;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import rkr.simplekeyboard.inputmethod.BuildConfig;
import tools.ntk.net.EnclaveClient;
import tools.ntk.net.NearRpc;

/**
 * Runs everything that talks to the network, one job at a time on a
 * background thread, and reports back on the main thread: enclave calls
 * (enroll, stamp, status, forget, info) and the two ways to log in.
 */
public final class NtkController {
    private static NtkController sInstance;

    public static synchronized NtkController get(Context context) {
        if (sInstance == null) sInstance = new NtkController(context.getApplicationContext());
        return sInstance;
    }

    /** What the strip and the setup screens show about the job in progress. */
    public interface Listener {
        void onControllerChanged();
    }

    public interface Callback<T> {
        void done(T result);
    }

    /** The outcome of one enclave operation. */
    public static final class Result {
        public enum Kind { OK, MATCH, NO_MATCH, ERROR }

        public final Kind kind;
        public final String message;
        public final String code;
        public final JSONObject output;
        public String stampId;
        public int attemptsLeft = -1;

        Result(Kind kind, String message, String code, JSONObject output) {
            this.kind = kind;
            this.message = message;
            this.code = code;
            this.output = output;
        }

        static Result error(String message, String code) {
            return new Result(Kind.ERROR, message, code, null);
        }
    }

    private final Context mContext;
    private final Handler mMain = new Handler(Looper.getMainLooper());
    private final ExecutorService mExec = Executors.newSingleThreadExecutor();
    private final List<Listener> mListeners = new ArrayList<>();
    private final SecureRandom mRandom = new SecureRandom();

    private volatile String mBusyOp;
    private volatile long mBusySince;
    private volatile String mBusyStatus = "";
    private volatile String mInfoCheckedFor; // the network whose enclave info was checked
    private volatile String mKeyWarning;
    private volatile String mKeyWarningFor;  // the network the warning is about

    private NtkController(Context context) {
        mContext = context;
    }

    public void addListener(Listener l) {
        if (!mListeners.contains(l)) mListeners.add(l);
    }

    public void removeListener(Listener l) {
        mListeners.remove(l);
    }

    private void notifyChanged() {
        mMain.post(() -> {
            for (Listener l : new ArrayList<>(mListeners)) l.onControllerChanged();
        });
    }

    public boolean isBusy() {
        return mBusyOp != null;
    }

    public String busyOp() {
        return mBusyOp;
    }

    public long busySince() {
        return mBusySince;
    }

    public String busyStatus() {
        return mBusyStatus;
    }

    /** Set when the current network's enclave named keys other than the pinned ones. Signing is then refused. */
    public String keyWarning() {
        return Network.current(mContext).id.equals(mKeyWarningFor) ? mKeyWarning : null;
    }

    // ---- where calls go ------------------------------------------------------------

    private SharedPreferences devPrefs() {
        return mContext.getSharedPreferences("ntk_dev", Context.MODE_PRIVATE);
    }

    /**
     * Where the current network's calls go. Release builds: its relay only
     * (Network.relay). Debug builds: the relay too by default, at the URL set on
     * the setup screen for this network (for example http://localhost:3970/api
     * through `adb reverse tcp:3970 tcp:3970`; for testnet also ntk.relayUrl in
     * local.properties); OutLayer directly, with this network's payment key from
     * local.properties, only when chosen there as a fallback.
     */
    public EnclaveClient client() {
        return client(Network.current(mContext));
    }

    EnclaveClient client(Network n) {
        if (BuildConfig.DEBUG) {
            final SharedPreferences p = devPrefs();
            final String key = n.debugPaymentKey();
            if (!p.getBoolean(devKey("use_relay", n), true) && !key.isEmpty()) return EnclaveClient.direct(key, n);
            final String relay = n == Network.TESTNET && !BuildConfig.NTK_RELAY_URL.isEmpty() ? BuildConfig.NTK_RELAY_URL : n.relay;
            return EnclaveClient.relay(p.getString(devKey("relay_url", n), relay));
        }
        return EnclaveClient.relay(n.relay);
    }

    /** Debug settings are kept per network; testnet's keep the names they had before networks. */
    private static String devKey(String name, Network n) {
        return n == Network.TESTNET ? name : name + "_" + n.id;
    }

    /** Debug builds only: for the current network, choose the relay (with its URL) or direct calls. */
    public void setDebugTransport(boolean useRelay, String relayUrl) {
        if (!BuildConfig.DEBUG) return;
        final Network n = Network.current(mContext);
        final SharedPreferences.Editor e = devPrefs().edit().putBoolean(devKey("use_relay", n), useRelay);
        if (relayUrl != null && !relayUrl.isEmpty()) e.putString(devKey("relay_url", n), relayUrl);
        e.apply();
    }

    // ---- jobs ------------------------------------------------------------------------

    private void begin(String op) {
        mBusyOp = op;
        mBusySince = System.currentTimeMillis();
        mBusyStatus = "";
        notifyChanged();
    }

    private void end() {
        mBusyOp = null;
        mBusyStatus = "";
        notifyChanged();
    }

    private final EnclaveClient.Progress mProgress = new EnclaveClient.Progress() {
        @Override
        public void onProgress(String status, long elapsedMs, String callId) {
            mBusyStatus = status;
            notifyChanged();
        }

        @Override
        public boolean isCancelled() {
            return false;
        }
    };

    /**
     * Checks once per process and network, in the background, that the current
     * network's enclave answers with the keys pinned for it (Network).
     */
    public void checkInfoOnce() {
        final Network n = Network.current(mContext);
        if (n.id.equals(mInfoCheckedFor) || !n.available()) return;
        mInfoCheckedFor = n.id;
        new Thread(() -> {
            try {
                final JSONObject info = client(n).info(Ntk.CALL_TIMEOUT_MS, null);
                final String t = info.optString("transport_pk");
                final String s = info.optString("stamp_pk");
                if (!n.transportPkHex.equals(t) || !n.stampPk.equals(s)) {
                    mKeyWarning = "The enclave answers with keys other than the pinned ones. Signing is off until the app is updated.";
                    mKeyWarningFor = n.id;
                    Log.w(Ntk.TAG, "info: keys differ from the pinned keys on " + n.id);
                } else {
                    if (n.id.equals(mKeyWarningFor)) mKeyWarningFor = null;
                    NtkCapture.debug("info: keys match the pinned keys on " + n.id);
                }
            } catch (Exception e) {
                if (n.id.equals(mInfoCheckedFor)) mInfoCheckedFor = null; // try again next time
                NtkCapture.debug("info check failed: " + e.getMessage());
            }
            notifyChanged();
        }, "ntk-info").start();
    }

    /**
     * Seals the session, signs the request and runs the call. For a stamp the
     * result is checked against the pinned key and the replayed text before it
     * is reported as MATCH.
     */
    public void send(final String op, final TypingSession session, final Callback<Result> cb) {
        if (!Terms.accepted(mContext)) {
            cb.done(Result.error("Accept the terms first", "TERMS")); // nothing is sent before
            return;
        }
        final Network net = Network.current(mContext);
        if (!net.available()) {
            cb.done(Result.error(net.label + " is not available yet", "NETWORK_UNAVAILABLE"));
            return;
        }
        final AccountStore.Account account = AccountStore.get(mContext).current();
        if (account == null) {
            cb.done(Result.error("Log in first", "NO_ACCOUNT"));
            return;
        }
        final String warning = keyWarning();
        if (warning != null && session != null) {
            cb.done(Result.error(warning, "KEY_MISMATCH"));
            return;
        }
        if (isBusy()) {
            cb.done(Result.error("Another request is still running", "BUSY"));
            return;
        }
        final String sessionJson = session == null ? null : session.toJson();
        final String replayed = session == null ? null : session.replay().text;
        final int taps = session == null ? 0 : session.taps();
        begin(op);
        checkInfoOnce();
        mExec.execute(() -> {
            Result r;
            JSONObject out = null;
            try {
                out = call(net, op, account, sessionJson);
                r = interpret(net, op, account, out, replayed);
            } catch (EnclaveClient.CallException e) {
                r = Result.error(e.getMessage(), e.code);
            } catch (Exception e) {
                r = Result.error("Network error: " + e.getMessage(), "NETWORK");
            }
            if (BuildConfig.DEBUG) {
                Log.i(Ntk.TAG, op + ": " + taps + " taps -> " + r.kind + (r.code != null ? " " + r.code : ""));
            }
            if (sessionJson != null) BuildHooks.saveSession(mContext, op, account.accountId, sessionJson, out);
            final Result fr = r;
            end();
            mMain.post(() -> cb.done(fr));
        });
    }

    private JSONObject call(Network net, String op, AccountStore.Account account, String sessionJson) throws Exception {
        final AccountStore store = AccountStore.get(mContext);
        NtkCrypto.Sealed sealed = null;
        if (sessionJson != null) {
            sealed = NtkCrypto.seal(Codec.unhex(net.transportPkHex), Codec.utf8(sessionJson), op, account.accountId, mRandom);
        }
        final long ts = store.nextTs();
        final String message = Auth.message(op, account.accountId, sealed == null ? "" : sealed.digestHex(), ts);
        final byte[] nonce = new byte[32];
        mRandom.nextBytes(nonce);
        final byte[] seed = store.seed();
        final String auth;
        try {
            auth = Auth.build(seed, account.accountId, message, nonce);
        } finally {
            java.util.Arrays.fill(seed, (byte) 0);
        }
        final EnclaveClient c = client(net);
        mBusyStatus = "sending";
        notifyChanged();
        final String callId = c.start(Auth.input(op, auth, sealed));
        mBusyStatus = "pending";
        notifyChanged();
        return c.await(callId, Ntk.CALL_TIMEOUT_MS, mProgress);
    }

    /** The keyboard's own words for the enclave's stable codes (enclave/src/enclave.rs). */
    static String explain(String code, String fallback) {
        if (code == null) return fallback;
        switch (code) {
            case "E_NOT_ENROLLED": return "no fingerprint yet: enroll first";
            case "E_NOT_READY": return "the fingerprint needs more enrollment sessions";
            case "E_RATE_LIMIT": return "too many failed stamps in the last 24 hours";
            case "E_REPLAY": return "the request was out of order; tap Sign again";
            case "E_AUTH_CLOCK": return "the phone's clock is more than 10 minutes off";
            case "E_AUTH_KEY_NOT_FOUND": return "this phone's key is no longer on the account: log in again";
            case "E_AUTH_KEY_OTHER_APP": return "this key belongs to another app: log in again";
            case "E_RPC": return "NEAR RPC did not answer; try again";
            case "E_ENROLL_SHORT": return "this enrollment text is too short";
            case "E_PAYER": return "the relay is misconfigured (not paid by the project owner)";
            case "E_SEALED_OPEN": return "the enclave could not open the session (keys changed?)";
            default: return fallback;
        }
    }

    private static String refusal(JSONObject out) {
        final String code = out.optString("code", "");
        switch (code) {
            case "R_EMPTY": return "nothing was typed";
            case "R_TOO_SHORT": return "too short to tell who typed it";
            case "R_PASTED": return "too much was pasted, not typed";
            case "R_MISMATCH": return "the typing does not match this account's fingerprint";
            default: return out.optString("reason", "no match");
        }
    }

    private Result interpret(Network net, String op, AccountStore.Account account, JSONObject out, String replayed) {
        final AccountStore store = AccountStore.get(mContext);
        if (!out.optBoolean("ok", false)) {
            final String code = out.optString("code", null);
            final String err = explain(code, out.optString("error", "the enclave refused the request"));
            if ("E_NOT_ENROLLED".equals(code) || "E_NOT_READY".equals(code)) store.saveEnrollment(0, 0, false);
            return new Result(Result.Kind.ERROR, err, code, out);
        }
        switch (op) {
            case "enroll":
                store.saveEnrollment(out.optInt("sessions"), out.optLong("taps"), out.optBoolean("ready"));
                return new Result(Result.Kind.OK, "Session sealed into the enclave", null, out);
            case "status":
                if (out.optBoolean("enrolled", false)) {
                    store.saveEnrollment(out.optInt("sessions"), out.optLong("taps"), out.optBoolean("ready"));
                } else {
                    store.saveEnrollment(0, 0, false);
                }
                return new Result(Result.Kind.OK, "status", null, out);
            case "forget":
                store.forgetEnrollment();
                return new Result(Result.Kind.OK, out.optBoolean("deleted") ? "Fingerprint deleted" : "There was no fingerprint", null, out);
            case "stamp": {
                final String verdict = out.optString("verdict");
                if ("MATCH".equals(verdict)) {
                    final JSONObject stamp = out.optJSONObject("stamp");
                    if (stamp == null) return Result.error("MATCH without a stamp", "NO_STAMP");
                    final StampCheck.Result chk = StampCheck.verify(stamp, net.stampPk, net.project(), account.accountId, replayed);
                    if (!chk.ok) return new Result(Result.Kind.ERROR, "Stamp refused: " + chk.failure, "STAMP_CHECK", out);
                    final Result r = new Result(Result.Kind.MATCH, "MATCH", null, out);
                    r.stampId = chk.id;
                    return r;
                }
                store.addFail();
                final Result r = new Result(Result.Kind.NO_MATCH, refusal(out), out.optString("code", null), out);
                r.attemptsLeft = Math.max(0, Ntk.MAX_FAILS_PER_DAY - store.failsLast24h());
                return r;
            }
            default:
                return new Result(Result.Kind.OK, op, null, out);
        }
    }

    // ---- logging in ------------------------------------------------------------------

    /**
     * "Create a testnet account for me": a new key is saved first (so it is never
     * lost), the public testnet faucet creates ntk-<8 hex>.testnet with it, and
     * the account is confirmed on chain.
     */
    public void createTestnetAccount(final Callback<Result> cb) {
        final Network net = Network.current(mContext);
        if (!net.hasFaucet()) {
            cb.done(Result.error("There is no faucet on " + net.label, "NO_FAUCET"));
            return;
        }
        if (isBusy()) {
            cb.done(Result.error("Another request is still running", "BUSY"));
            return;
        }
        begin("account");
        mExec.execute(() -> {
            Result r;
            try {
                final AccountStore store = AccountStore.get(mContext);
                final String name = AccountStore.randomTestnetName();
                final AccountStore.Account pending = store.createPending(name, AccountStore.KIND_FAUCET);
                mBusyStatus = "asking the testnet faucet";
                notifyChanged();
                NearRpc.createTestnetAccount(net, name, pending.publicKey);
                mBusyStatus = "waiting for the account on chain";
                notifyChanged();
                boolean exists = false;
                for (int i = 0; i < 40 && !exists; i++) {
                    exists = NearRpc.accountExists(net, name);
                    if (!exists) Thread.sleep(1500);
                }
                if (!exists) throw new IllegalStateException("the faucet did not create " + name + " in time");
                final Object perm = NearRpc.accessKeyPermission(net, name, pending.publicKey);
                if (!"FullAccess".equals(perm)) throw new IllegalStateException("the key is not on " + name);
                store.activate(name);
                store.forgetEnrollment();
                store.saveEnrollment(0, 0, false);
                r = new Result(Result.Kind.OK, "Created " + name, null, null);
            } catch (Exception e) {
                r = Result.error("Could not create a testnet account: " + e.getMessage(), "FAUCET");
            }
            final Result fr = r;
            end();
            mMain.post(() -> cb.done(fr));
        });
    }

    /** Wallet login, step 1: a new key, saved on this phone, whose public half goes to the login page. */
    public String startWalletLogin() throws Exception {
        final AccountStore.Account pending = AccountStore.get(mContext).createPending(null, AccountStore.KIND_WALLET);
        return pending.publicKey;
    }

    /**
     * Wallet login, step 2 (back from the login page with the account and the
     * key it approved): confirm on chain that this phone's key is on the
     * account as a function-call key for the network's project owner, the one kind
     * of delegated key the enclave accepts, and log in.
     */
    public void finishWalletLogin(final String accountId, final String approvedKey, final Callback<Result> cb) {
        final Network net = Network.current(mContext);
        if (isBusy()) {
            cb.done(Result.error("Another request is still running", "BUSY"));
            return;
        }
        begin("account");
        mExec.execute(() -> {
            Result r;
            try {
                final AccountStore store = AccountStore.get(mContext);
                final AccountStore.Account pending = store.pending();
                if (pending == null || !AccountStore.KIND_WALLET.equals(pending.kind)) {
                    throw new IllegalStateException("no wallet login was started on this phone");
                }
                if (approvedKey != null && !approvedKey.isEmpty() && !approvedKey.equals(pending.publicKey)) {
                    throw new IllegalStateException("the wallet approved another key than this phone's");
                }
                if (!accountId.matches("[a-z0-9._-]{2,64}")) {
                    throw new IllegalStateException("not a NEAR account name: " + accountId);
                }
                Object perm = null;
                for (int i = 0; i < 10 && perm == null; i++) {
                    perm = NearRpc.accessKeyPermission(net, accountId, pending.publicKey);
                    if (perm == null) Thread.sleep(1500);
                }
                if (perm == null) throw new IllegalStateException("the key is not on " + accountId);
                // The login page asks for a function-call key for the project; nothing else is accepted
                // (the setup screen then says the phone holds a key that can only talk to NTK).
                final JSONObject fc = perm instanceof JSONObject ? ((JSONObject) perm).optJSONObject("FunctionCall") : null;
                if (fc == null) {
                    throw new IllegalStateException("the key on " + accountId + " is not a function-call key ("
                            + (perm instanceof String ? perm : "unknown permission") + ")");
                }
                if (!net.projectOwner.equals(fc.optString("receiver_id"))) {
                    throw new IllegalStateException("the key on " + accountId + " is issued to " + fc.optString("receiver_id")
                            + ", not " + net.projectOwner);
                }
                store.activate(accountId);
                store.forgetEnrollment();
                r = new Result(Result.Kind.OK, "Logged in as " + accountId, null, null);
            } catch (Exception e) {
                r = Result.error("Wallet login failed: " + e.getMessage(), "WALLET");
            }
            final Result fr = r;
            end();
            mMain.post(() -> cb.done(fr));
        });
    }
}

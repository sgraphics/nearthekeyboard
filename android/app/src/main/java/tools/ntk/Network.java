package tools.ntk;

import android.content.Context;

import rkr.simplekeyboard.inputmethod.BuildConfig;

/**
 * The NEAR networks NTK runs on, and everything that differs between them: one
 * place to edit. Everything follows the network chosen on the setup screen: the
 * relay, the keys checked against the enclave's info, the NEAR RPC used for
 * the on-chain key check, the login page's network, the faucet (testnet only),
 * and where the login is kept (each network keeps its own; the fingerprint is
 * per account, so a user enrolls again on another network).
 *
 * Mainnet is available because its two keys below are filled in; it becomes the
 * default by changing {@link #DEFAULT_NETWORK}.
 */
public final class Network {
    // ---- Mainnet's pinned keys, from the mainnet enclave's info (2026-11-14) -----------------
    /** The mainnet enclave's stamp key, "ed25519:…" (info.stamp_pk). Null: mainnet is not available. */
    public static final String MAINNET_STAMP_PK = "ed25519:6ubp84rgbCnXND4LwYPd7UBKMQWwTyGC3uXgUaAEF1D4";
    /** The mainnet enclave's transport key, 64 hex characters (info.transport_pk). Null: not available. */
    public static final String MAINNET_TRANSPORT_PK_HEX = "a48b1d2bb59543a03d009c80340ef38a8cb72b0cc5349eb8f24fdea284529a29";

    public static final Network TESTNET = new Network(
            "testnet", "Testnet",
            "https://ntk.tools/api",                  // the relay: /call, /calls/<id>, /info below it
            "https://testnet-api.outlayer.ai",        // OutLayer itself, for debug builds' direct calls
            "nearthekeyboard.testnet", "ntk",         // the OutLayer project: owner / name
            "https://rpc.testnet.fastnear.com",       // NEAR RPC, for the on-chain key check
            "ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG",                // pinned stamp key
            "4443a5935e077902ff3afc6a4d188c53168b8ec9bd9b0b847b4d1006ab95b729",    // pinned transport key
            "https://helper.nearprotocol.com/account", // the public testnet faucet
            "https://testnet.mynearwallet.com/full-access-keys",
            "ntk_account");                           // where the login is kept (as before networks)

    public static final Network MAINNET = new Network(
            "mainnet", "Mainnet",
            "https://ntk.tools/api/mainnet",
            "https://api.outlayer.ai",
            "nearthekeyboard.near", "ntk",
            "https://rpc.mainnet.fastnear.com",
            MAINNET_STAMP_PK,
            MAINNET_TRANSPORT_PK_HEX,
            null,                                     // no faucet on mainnet
            "https://app.mynearwallet.com/full-access-keys",
            "ntk_account_mainnet");

    /** The network an install uses until the user chooses one. Making mainnet the default is this line. */
    public static final Network DEFAULT_NETWORK = TESTNET;

    public static final Network[] ALL = { TESTNET, MAINNET };

    /** The login page's network parameter, and the name in settings. */
    public final String id;
    public final String label;
    public final String relay;
    public final String outlayerApi;
    public final String projectOwner;
    public final String projectName;
    public final String rpc;
    /** Pinned: a stamp signed by any other key is not an NTK stamp. */
    public final String stampPk;
    /** Pinned: the X25519 key sessions are sealed to. */
    public final String transportPkHex;
    /** The faucet that may create accounts, or null. */
    public final String faucetUrl;
    /** Where the logout dialog sends a wallet user to remove the key from the account. */
    public final String walletKeysUrl;
    /** The preferences file the login (account and key) is kept in. */
    public final String accountPrefs;

    private Network(String id, String label, String relay, String outlayerApi, String projectOwner,
            String projectName, String rpc, String stampPk, String transportPkHex, String faucetUrl,
            String walletKeysUrl, String accountPrefs) {
        this.id = id;
        this.label = label;
        this.relay = relay;
        this.outlayerApi = outlayerApi;
        this.projectOwner = projectOwner;
        this.projectName = projectName;
        this.rpc = rpc;
        this.stampPk = stampPk;
        this.transportPkHex = transportPkHex;
        this.faucetUrl = faucetUrl;
        this.walletKeysUrl = walletKeysUrl;
        this.accountPrefs = accountPrefs;
    }

    /** The OutLayer project, "owner/name", as stamps name it. */
    public String project() {
        return projectOwner + "/" + projectName;
    }

    /** True when the enclave's keys are pinned: only then can the network be used. */
    public boolean available() {
        return stampPk != null && transportPkHex != null;
    }

    public boolean hasFaucet() {
        return faucetUrl != null;
    }

    /**
     * Debug builds only: the OutLayer payment key for calls without the relay,
     * from local.properties (ntk.paymentKey for testnet, ntk.paymentKey.mainnet
     * for mainnet). Empty: not available. Release builds: always empty.
     */
    public String debugPaymentKey() {
        return this == MAINNET ? BuildConfig.NTK_PAYMENT_KEY_MAINNET : BuildConfig.NTK_PAYMENT_KEY;
    }

    public static Network byId(String id) {
        for (Network n : ALL) if (n.id.equals(id)) return n;
        return null;
    }

    /** The network for a stored choice: that one if it exists and is available, else the default. */
    public static Network select(String storedId) {
        final Network n = byId(storedId);
        return n != null && n.available() ? n : DEFAULT_NETWORK;
    }

    private static final String PREFS = "ntk_ui";
    private static final String KEY = "network";

    /** The network chosen on the setup screen (the default before the first choice). */
    public static Network current(Context c) {
        try {
            return select(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null));
        } catch (IllegalStateException e) {
            return DEFAULT_NETWORK; // before the first unlock (direct boot)
        }
    }

    /** Chooses a network; one that is not available is not stored. */
    public static void choose(Context c, Network n) {
        if (n == null || !n.available()) return;
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, n.id).commit();
    }
}

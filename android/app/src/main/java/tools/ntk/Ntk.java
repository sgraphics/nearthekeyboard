package tools.ntk;

/**
 * Constants of the NTK protocol (docs/protocol.md) that are the same on every
 * network. What differs between testnet and mainnet (relay, project, RPC,
 * pinned keys, faucet) is in {@link Network}.
 */
public final class Ntk {
    private Ntk() {}

    public static final String TAG = "NTK";

    /** NEP-413 recipient every request is signed for. */
    public static final String RECIPIENT = "near-the-keyboard";

    public static final String VERIFY_BASE = "https://ntk.tools/";
    /**
     * The login page (Links.loginUrl, on the NTK site) returns here:
     * ntk://auth?account_id=<account>&public_key=<key>.
     */
    public static final String AUTH_SUCCESS_URL = "ntk://auth";

    // The enclave's current minimums (info.params); the keyboard checks them before sending.
    public static final int MIN_STAMP_TAPS = 40;
    public static final int MIN_ENROLL_TAPS = 30;
    public static final int MIN_TYPED_PCT = 80;
    public static final int MAX_FAILS_PER_DAY = 20;

    /** One enclave call may take minutes: poll every 2 s for up to 6 min. */
    public static final long CALL_TIMEOUT_MS = 6 * 60 * 1000L;
    public static final long POLL_INTERVAL_MS = 2000L;

    /** privateImeOptions our enrollment fields carry: "tools.ntk.enroll=compose" or "=copy". */
    public static final String IME_OPTION_ENROLL = "tools.ntk.enroll=";
}

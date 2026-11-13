package tools.ntk;

/** Constants of the NTK protocol (docs/protocol.md) and of this testnet deployment. */
public final class Ntk {
    private Ntk() {}

    public static final String TAG = "NTK";

    public static final String PROJECT = "nearthekeyboard.testnet/ntk";
    public static final String PROJECT_OWNER = "nearthekeyboard.testnet";
    public static final String PROJECT_NAME = "ntk";
    public static final String NETWORK = "testnet";
    public static final String OUTLAYER_API = "https://testnet-api.outlayer.ai";

    /** Pinned. A stamp signed by any other key is not an NTK stamp. */
    public static final String STAMP_PK = "ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG";
    /** Pinned X25519 key sessions are sealed to. */
    public static final String TRANSPORT_PK_HEX = "4443a5935e077902ff3afc6a4d188c53168b8ec9bd9b0b847b4d1006ab95b729";
    /** NEP-413 recipient every request is signed for. */
    public static final String RECIPIENT = "near-the-keyboard";

    public static final String VERIFY_BASE = "https://ntk.tools/";
    public static final String DEFAULT_RELAY = "https://ntk.tools/api";

    public static final String RPC_URL = "https://rpc.testnet.fastnear.com";
    public static final String FAUCET_URL = "https://helper.nearprotocol.com/account";
    public static final String WALLET_LOGIN_URL = "https://testnet.mynearwallet.com/login/";
    public static final String WALLET_KEYS_URL = "https://testnet.mynearwallet.com/full-access-keys";
    public static final String AUTH_SUCCESS_URL = "ntk://auth";
    public static final String AUTH_FAILURE_URL = "ntk://auth-failed";

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

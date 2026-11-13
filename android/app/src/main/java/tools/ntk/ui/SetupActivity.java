package tools.ntk.ui;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.Locale;

import rkr.simplekeyboard.inputmethod.BuildConfig;
import rkr.simplekeyboard.inputmethod.R;
import rkr.simplekeyboard.inputmethod.latin.settings.SettingsActivity;
import tools.ntk.AccountStore;
import tools.ntk.Ntk;
import tools.ntk.NtkController;

/**
 * The NTK app (TODO.md 3.4): turn the keyboard on, log in with NEAR (wallet, or
 * a testnet account made by the faucet), enroll, and a field to try Sign in.
 * Also receives the wallet's redirect, ntk://auth?account_id=…
 */
public final class SetupActivity extends Activity implements NtkController.Listener {
    private TextView mKbStatus, mAccountStatus, mEnrollStatus, mBusy, mDebugTransport;
    private Button mWallet, mFaucet, mLogout, mEnroll, mStatus, mForget;
    private EditText mDebugRelay;
    private String mLastMessage;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.ntk_activity_setup);
        applyInsets(findViewById(R.id.ntk_root));
        mKbStatus = findViewById(R.id.ntk_kb_status);
        mAccountStatus = findViewById(R.id.ntk_account_status);
        mEnrollStatus = findViewById(R.id.ntk_enroll_status);
        mBusy = findViewById(R.id.ntk_busy);
        mWallet = findViewById(R.id.ntk_btn_wallet);
        mFaucet = findViewById(R.id.ntk_btn_faucet);
        mLogout = findViewById(R.id.ntk_btn_logout);
        mEnroll = findViewById(R.id.ntk_btn_enroll);
        mStatus = findViewById(R.id.ntk_btn_status);
        mForget = findViewById(R.id.ntk_btn_forget);

        findViewById(R.id.ntk_btn_enable).setOnClickListener(v ->
                startActivity(new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)));
        findViewById(R.id.ntk_btn_pick).setOnClickListener(v -> {
            final InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.showInputMethodPicker();
        });
        mFaucet.setOnClickListener(v -> createAccount());
        mWallet.setOnClickListener(v -> walletLogin());
        mLogout.setOnClickListener(v -> logout());
        mEnroll.setOnClickListener(v -> startActivity(new Intent(this, EnrollActivity.class)));
        mStatus.setOnClickListener(v -> runOp("status"));
        mForget.setOnClickListener(v -> new AlertDialog.Builder(this)
                .setMessage("Delete your typing fingerprint from the enclave? You will need to enroll again to get stamps.")
                .setPositiveButton("Delete", (d, w) -> runOp("forget"))
                .setNegativeButton("Keep", null)
                .show());
        findViewById(R.id.ntk_btn_settings).setOnClickListener(v ->
                startActivity(new Intent(this, SettingsActivity.class)));

        if (BuildConfig.DEBUG) {
            findViewById(R.id.ntk_debug).setVisibility(View.VISIBLE);
            mDebugTransport = findViewById(R.id.ntk_debug_transport);
            mDebugRelay = findViewById(R.id.ntk_debug_relay);
            findViewById(R.id.ntk_btn_use_relay).setOnClickListener(v -> {
                NtkController.get(this).setDebugTransport(true, mDebugRelay.getText().toString().trim());
                refresh();
            });
            findViewById(R.id.ntk_btn_use_direct).setOnClickListener(v -> {
                NtkController.get(this).setDebugTransport(false, null);
                refresh();
            });
        }
        handleIntent(getIntent());
    }

    /**
     * Edge-to-edge: keep content clear of the system bars and of the keyboard.
     * Also opts the whole window out of autofill: these are typing fields, and an
     * autofill picker over the keys (or autofilled text) is not typing.
     */
    static void applyInsets(View root) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            root.getRootView().setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
            root.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Pad the scroll view's parent, so the scroll view itself shrinks above the keyboard:
            // a ScrollView that shrinks keeps its focused field in view.
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                final android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                final android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                final View host = v.getParent() instanceof View ? (View) v.getParent() : v;
                host.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
        } else {
            root.setFitsSystemWindows(true);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        final Uri data = intent.getData();
        if (data != null && "ntk".equals(data.getScheme())) {
            if ("auth".equals(data.getHost())) {
                final String account = data.getQueryParameter("account_id");
                if (account == null || account.isEmpty()) {
                    message("The wallet did not say which account approved the key.");
                } else {
                    message("Checking on chain that the wallet added the key to " + account + "…");
                    NtkController.get(this).finishWalletLogin(account, r -> {
                        message(r.message);
                        refresh();
                    });
                }
            } else {
                message("The wallet login was cancelled.");
            }
            intent.setData(null);
        }
        // Debug builds: scripts may choose where calls go, e.g.
        // adb shell am start -n tools.ntk.keyboard/tools.ntk.ui.SetupActivity --es ntk.relay http://localhost:3970/api
        if (BuildConfig.DEBUG) {
            final String relay = intent.getStringExtra("ntk.relay");
            if (relay != null) NtkController.get(this).setDebugTransport(true, relay);
            if (intent.getBooleanExtra("ntk.direct", false)) NtkController.get(this).setDebugTransport(false, null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        NtkController.get(this).addListener(this);
        refresh();
    }

    @Override
    protected void onPause() {
        NtkController.get(this).removeListener(this);
        super.onPause();
    }

    @Override
    public void onControllerChanged() {
        refreshBusy();
    }

    private void message(String m) {
        mLastMessage = m;
        refreshBusy();
    }

    private void refreshBusy() {
        final NtkController ctl = NtkController.get(this);
        String text = null;
        if (ctl.isBusy()) {
            final long s = (System.currentTimeMillis() - ctl.busySince()) / 1000;
            text = String.format(Locale.ROOT, "Working: %s%s (%d:%02d)", ctl.busyOp(),
                    ctl.busyStatus().isEmpty() ? "" : ", " + ctl.busyStatus(), s / 60, s % 60);
        } else if (mLastMessage != null) {
            text = mLastMessage;
        }
        mBusy.setVisibility(text == null ? View.GONE : View.VISIBLE);
        mBusy.setText(text);
        final boolean busy = ctl.isBusy();
        for (Button b : new Button[] { mWallet, mFaucet, mStatus, mForget }) b.setEnabled(!busy);
    }

    private void refresh() {
        // 1. Keyboard
        final InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        boolean enabled = false;
        String id = null;
        if (imm != null) {
            for (InputMethodInfo i : imm.getEnabledInputMethodList()) {
                if (getPackageName().equals(i.getPackageName())) {
                    enabled = true;
                    id = i.getId();
                }
            }
        }
        final String current = Settings.Secure.getString(getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        mKbStatus.setText(!enabled ? "NTK is not turned on yet."
                : (id != null && id.equals(current)) ? "NTK is on and is your keyboard." : "NTK is on. Switch to it to type with it.");

        // 2. Account
        final AccountStore store = AccountStore.get(this);
        final AccountStore.Account a = store.current();
        if (a == null) {
            mAccountStatus.setText("Not logged in. The wallet gives the keyboard a key that can only talk to NTK. "
                    + "Or let NTK create a testnet account, whose key then lives on this phone (testnet only).");
        } else if (AccountStore.KIND_WALLET.equals(a.kind)) {
            mAccountStatus.setText(a.accountId + "\nKey on this phone: a function-call key for " + Ntk.PROJECT_OWNER + ".");
        } else {
            mAccountStatus.setText(a.accountId + "\nA testnet account made by the faucet. This phone holds its full-access key, encrypted with an Android Keystore key.");
        }
        mWallet.setVisibility(a == null ? View.VISIBLE : View.GONE);
        mFaucet.setVisibility(a == null ? View.VISIBLE : View.GONE);
        mLogout.setVisibility(a == null ? View.GONE : View.VISIBLE);

        // 3. Fingerprint
        if (a == null) {
            mEnrollStatus.setText("Log in first.");
        } else if (!store.enrollmentKnown()) {
            mEnrollStatus.setText("Unknown. Enroll, or ask the enclave.");
        } else if (store.isReady()) {
            mEnrollStatus.setText(String.format(Locale.ROOT, "Ready: %d sessions, %d key taps, sealed in the enclave.",
                    store.enrolledSessions(), store.enrolledTaps()));
        } else {
            mEnrollStatus.setText(String.format(Locale.ROOT, "Not ready: %d sessions, %d key taps so far.",
                    store.enrolledSessions(), store.enrolledTaps()));
        }
        for (Button b : new Button[] { mEnroll, mStatus, mForget }) b.setVisibility(a == null ? View.GONE : View.VISIBLE);

        if (mDebugTransport != null) {
            mDebugTransport.setText("Calls go to: " + NtkController.get(this).client().describe()
                    + (BuildConfig.NTK_PAYMENT_KEY.isEmpty() ? "\nNo payment key in local.properties." : "\nA payment key is in this debug build."));
        }
        refreshBusy();
    }

    private void createAccount() {
        message("Creating a testnet account with the faucet…");
        NtkController.get(this).createTestnetAccount(r -> {
            message(r.message);
            refresh();
        });
    }

    private void walletLogin() {
        try {
            final String pk = NtkController.get(this).startWalletLogin();
            final Uri url = Uri.parse(Ntk.WALLET_LOGIN_URL).buildUpon()
                    .appendQueryParameter("contract_id", Ntk.PROJECT_OWNER)
                    .appendQueryParameter("public_key", pk)
                    .appendQueryParameter("success_url", Ntk.AUTH_SUCCESS_URL)
                    .appendQueryParameter("failure_url", Ntk.AUTH_FAILURE_URL)
                    .build();
            message("Approve the key in your wallet, then come back.");
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (Exception e) {
            message("Could not start the wallet login: " + e.getMessage());
        }
    }

    private void logout() {
        final AccountStore.Account a = AccountStore.get(this).current();
        AccountStore.get(this).clear();
        refresh();
        if (a != null && AccountStore.KIND_WALLET.equals(a.kind)) {
            new AlertDialog.Builder(this)
                    .setMessage("The key is deleted from this phone. It is still on " + a.accountId
                            + " until you remove it in your wallet's key list.")
                    .setPositiveButton("Open the wallet", (d, w) ->
                            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(Ntk.WALLET_KEYS_URL))))
                    .setNegativeButton("Later", null)
                    .show();
        } else {
            message("Logged out. The key was deleted from this phone.");
        }
    }

    private void runOp(String op) {
        message("Asking the enclave (" + op + "). This can take a minute or more.");
        NtkController.get(this).send(op, null, r -> {
            if (r.kind == NtkController.Result.Kind.ERROR) {
                message(op + " failed: " + r.message);
            } else if ("status".equals(op)) {
                final JSONObject o = r.output;
                message(o.optBoolean("enrolled") ? String.format(Locale.ROOT,
                        "The enclave says: %d sessions, %d key taps, ready=%s, %d stamps, %d failed in 24 h.",
                        o.optInt("sessions"), o.optLong("taps"), o.optBoolean("ready"), o.optInt("stamps"),
                        o.optInt("failed_24h")) : "The enclave has no fingerprint for this account.");
            } else {
                message(r.message);
            }
            refresh();
        });
    }
}

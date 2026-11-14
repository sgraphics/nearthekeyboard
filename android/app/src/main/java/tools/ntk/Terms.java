package tools.ntk;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/**
 * The first-run agreement: the Terms of use and the Privacy notice
 * (https://ntk.tools/terms/ and https://ntk.tools/privacy/, bundled as
 * res/raw/ntk_terms.txt). Until the user has accepted the current version, the
 * app shows its first-run screen (ui.TermsActivity) before anything else, and
 * the keyboard sends nothing: Sign and Enroll open that screen instead, while
 * typing works as on any keyboard. The accepted version and time are kept in
 * the app's preferences.
 */
public final class Terms {
    /** The terms version the app asks for. Raise it when the terms change: users agree again. */
    public static final int VERSION = 2;

    private static final String PREFS = "ntk_ui";
    private static final String KEY_VERSION = "terms_version";
    private static final String KEY_AT = "terms_accepted_at";

    private Terms() {}

    public static boolean accepted(Context c) {
        return prefs(c).getInt(KEY_VERSION, 0) >= VERSION;
    }

    /** Records that the user accepted this version of the terms, now. */
    public static void accept(Context c) {
        prefs(c).edit().putInt(KEY_VERSION, VERSION).putLong(KEY_AT, System.currentTimeMillis()).apply();
    }

    /** When the current version was accepted, in ms since the epoch; 0 if it was not. */
    public static long acceptedAt(Context c) {
        return accepted(c) ? prefs(c).getLong(KEY_AT, 0L) : 0L;
    }

    /** Opens the first-run screen, from the keyboard or from a screen of the app. */
    public static void open(Context c) {
        c.startActivity(new Intent(c, tools.ntk.ui.TermsActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}

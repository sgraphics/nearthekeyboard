package tools.ntk;

import android.content.Context;
import android.content.SharedPreferences;

import rkr.simplekeyboard.inputmethod.BuildConfig;

/**
 * The two kinds of address the app opens in the browser: the verify page of a
 * stamp, and the NTK login page that asks a NEAR wallet for a key. Both live on
 * the NTK site, https://ntk.tools/. Debug builds may point them at another site
 * (the setup screen's debug section, or the intent extra {@code ntk.site}).
 */
public final class Links {
    private Links() {}

    private static final String PREFS = "ntk_dev";
    private static final String KEY_SITE = "site_base";

    /** The site the links point to, ending in "/". Release builds: always https://ntk.tools/. */
    public static String siteBase(Context c) {
        if (!BuildConfig.DEBUG || c == null) return Ntk.VERIFY_BASE;
        final String s = prefs(c).getString(KEY_SITE, null);
        return s == null || s.isEmpty() ? Ntk.VERIFY_BASE : s;
    }

    /** Debug builds only: use another site for verify and login links (null or empty: the default). */
    public static void setSiteBase(Context c, String base) {
        if (!BuildConfig.DEBUG) return;
        final SharedPreferences.Editor e = prefs(c).edit();
        if (base == null || base.trim().isEmpty()) {
            e.remove(KEY_SITE);
        } else {
            final String b = base.trim();
            e.putString(KEY_SITE, b.endsWith("/") ? b : b + "/");
        }
        e.apply();
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * The verify page for a stamp, with the text that stood before its tag in
     * the address fragment, which browsers never send to a server:
     * {@code <base><id>#t=<base64url of the UTF-8 text>}. The same address as
     * verifyUrl() in web/lib/ntk-verify.js.
     */
    public static String verifyUrl(String base, String id, String textBefore) {
        final String b = base == null || base.isEmpty() ? Ntk.VERIFY_BASE : base;
        return b + id + (textBefore != null && !textBefore.isEmpty() ? "#t=" + base64Url(textBefore) : "");
    }

    /** encodeText() of web/lib/ntk-verify.js: base64url of the UTF-8 bytes, without padding. */
    public static String base64Url(String s) {
        final String b = Codec.b64(Codec.utf8(s)).replace('+', '-').replace('/', '_');
        int end = b.length();
        while (end > 0 && b.charAt(end - 1) == '=') end--;
        return b.substring(0, end);
    }

    /**
     * The login page (the contract with the page at https://ntk.tools/login): it
     * asks the user's NEAR wallet to add {@code publicKey} to their account as a
     * function-call key for nearthekeyboard.testnet, then sends the browser to
     * {@code ntk://auth?account_id=<account>&public_key=<key>}.
     */
    public static String loginUrl(String base, String publicKey) {
        final String b = base == null || base.isEmpty() ? Ntk.VERIFY_BASE : base;
        return b + "login#pk=" + urlEncode(publicKey) + "&return=" + urlEncode(Ntk.AUTH_SUCCESS_URL)
                + "&network=" + Ntk.NETWORK;
    }

    private static final char[] HEX = "0123456789ABCDEF".toCharArray();

    /**
     * JavaScript's encodeURIComponent: UTF-8, and every byte percent-encoded
     * except letters, digits and - _ . ! ~ * ' ( ). Written out because java.net
     * stays in tools.ntk.net (scripts/audit-android.sh).
     */
    public static String urlEncode(String s) {
        final StringBuilder out = new StringBuilder(s.length() + 16);
        for (byte b : Codec.utf8(s)) {
            final int c = b & 0xff;
            final boolean plain = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
                    || "-_.!~*'()".indexOf(c) >= 0;
            if (plain) {
                out.append((char) c);
            } else {
                out.append('%').append(HEX[c >> 4]).append(HEX[c & 15]);
            }
        }
        return out.toString();
    }
}

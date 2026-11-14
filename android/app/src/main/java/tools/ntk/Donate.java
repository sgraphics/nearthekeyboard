package tools.ntk;

/**
 * The DONATE ribbon under the keys: the amounts it offers and the page that sends
 * one (web/donate/, the same amounts as web/login/src/donate-model.js). The page
 * connects the user's own NEAR wallet; the keyboard handles no money and no keys.
 */
public final class Donate {
    /** The label on the ribbon. */
    public static final String LABEL = "DONATE";
    /** The amounts offered, in NEAR. */
    public static final int[] AMOUNTS = {5, 25, 50};
    /** Shown under the amounts. */
    public static final String THANKS = "Thank you for your support.\n— NTK Team";
    public static final String PAGE = "https://ntk.tools/donate/";

    private Donate() {
    }

    /** The page for one offered amount; null for any other amount. */
    public static String url(final int amount) {
        for (final int a : AMOUNTS) {
            if (a == amount) return PAGE + "#amount=" + amount;
        }
        return null;
    }
}

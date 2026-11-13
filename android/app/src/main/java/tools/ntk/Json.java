package tools.ntk;

import java.util.Locale;

/** Writes the few JSON strings NTK signs or seals byte for byte. Parsing uses org.json. */
public final class Json {
    private Json() {}

    public static String quote(final String s) {
        if (s == null) return "null";
        final StringBuilder b = new StringBuilder(s.length() + 2);
        b.append('"');
        for (int i = 0; i < s.length(); i++) {
            final char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                case '\b': b.append("\\b"); break;
                case '\f': b.append("\\f"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) {
                        b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    } else {
                        b.append(c);
                    }
            }
        }
        return b.append('"').toString();
    }

    /** A fraction with at most three decimals, no exponent ("0.1", "-0.05", "0"). */
    public static String fraction(final double v) {
        final long milli = Math.round(v * 1000.0);
        if (milli == 0) return "0";
        final StringBuilder b = new StringBuilder();
        if (milli < 0) b.append('-');
        final long a = Math.abs(milli);
        b.append(a / 1000);
        long frac = a % 1000;
        if (frac != 0) {
            String f = String.format(Locale.ROOT, "%03d", frac);
            while (f.endsWith("0")) f = f.substring(0, f.length() - 1);
            b.append('.').append(f);
        }
        return b.toString();
    }
}

package tools.ntk;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Text rule v2 (docs/protocol.md): what a stamp's text hash covers. The same rule
 * is in the enclave (Rust) and the reference verifier (web/lib/ntk-verify.js);
 * docs/test-vectors/text-v2.json holds the shared cases.
 */
public final class TextRule {
    private TextRule() {}

    /** {@code [NTK <id>]} and the older {@code [NTK @<account> <id>]}. Group 1 is the id. */
    public static final Pattern TAG = Pattern.compile("\\[NTK(?: @[^\\s\\]]+)? ([0-9a-f]{10})\\]");

    /** Unicode White_Space, written out: Java's own idea of whitespace differs from it. */
    public static boolean isWhitespace(final int cp) {
        switch (cp) {
            case 0x09: case 0x0a: case 0x0b: case 0x0c: case 0x0d:
            case 0x20: case 0x85: case 0xa0: case 0x1680:
            case 0x2000: case 0x2001: case 0x2002: case 0x2003: case 0x2004: case 0x2005:
            case 0x2006: case 0x2007: case 0x2008: case 0x2009: case 0x200a:
            case 0x2028: case 0x2029: case 0x202f: case 0x205f: case 0x3000:
                return true;
            default:
                return false;
        }
    }

    /** Every run of whitespace becomes one space; whitespace at the start and the end is removed. */
    public static String canonical(final CharSequence s) {
        final StringBuilder out = new StringBuilder(s.length());
        boolean pending = false;
        for (int i = 0; i < s.length(); ) {
            final int cp = Character.codePointAt(s, i);
            i += Character.charCount(cp);
            if (isWhitespace(cp)) {
                pending = out.length() > 0;
                continue;
            }
            if (pending) out.append(' ');
            pending = false;
            out.appendCodePoint(cp);
        }
        return out.toString();
    }

    /** Version 1 records: CR removed, surrounding whitespace trimmed, nothing collapsed. */
    public static String v1(final CharSequence s) {
        final String noCr = s.toString().replace("\r", "");
        int start = 0;
        int end = noCr.length();
        while (start < end) {
            final int cp = noCr.codePointAt(start);
            if (!isWhitespace(cp)) break;
            start += Character.charCount(cp);
        }
        while (end > start) {
            final int cp = noCr.codePointBefore(end);
            if (!isWhitespace(cp)) break;
            end -= Character.charCount(cp);
        }
        return noCr.substring(start, end);
    }

    /** The text a stamp of record version {@code v} hashes, given the replayed text. */
    public static String forRecord(final CharSequence text, final int v) {
        return v >= 2 ? canonical(text) : v1(text);
    }

    /** Length in Unicode scalar values (what {@code text_chars} counts). */
    public static int charCount(final String s) {
        return s.codePointCount(0, s.length());
    }

    /**
     * The text a stamp covers, given everything that stands before its tag: the
     * last {@code chars} scalar values of the canonical prefix (v2), or of the
     * trimmed prefix (v1). Null when the prefix is shorter.
     */
    public static String covered(final CharSequence prefix, final int chars, final int v) {
        final String base = forRecord(prefix, v);
        final int n = charCount(base);
        if (chars <= 0 || n < chars) return null;
        return base.substring(base.offsetByCodePoints(0, n - chars));
    }

    public static String tag(final String id) {
        return "[NTK " + id + "]";
    }

    /** The id of the first tag in {@code s}, or null. */
    public static String findTagId(final CharSequence s) {
        final Matcher m = TAG.matcher(s);
        return m.find() ? m.group(1) : null;
    }

    /**
     * Does a field whose text before the cursor is {@code before} end with what
     * the session replays to? Both sides are made canonical, so whitespace runs
     * the app may have changed do not matter, and anything typed before the
     * session (an earlier tag, a name) is outside the stamp.
     */
    public static boolean fieldEndsWith(final CharSequence before, final CharSequence replayed) {
        final String r = canonical(replayed);
        if (r.isEmpty()) return false;
        return canonical(before).endsWith(r);
    }
}

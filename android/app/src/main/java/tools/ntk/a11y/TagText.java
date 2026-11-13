package tools.ntk.a11y;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;

import tools.ntk.TextRule;

/**
 * The text side of the stamp buttons, with no Android types so it can be unit
 * tested: where the tags are in a text, which text stands before a tag, and
 * where on screen a tag's characters are.
 */
public final class TagText {
    private TagText() {}

    /**
     * At most this many characters (UTF-16 units) of text before a tag go into
     * the verify address. Rule 2.2 only needs the last {@code text_chars} of
     * them, and the enclave caps a session at 20,000 key events.
     */
    public static final int MAX_PREFIX = 20_000;

    /** One tag in a text: its id and where it starts and ends (UTF-16 indexes). */
    public static final class Tag {
        public final String id;
        public final int start;
        public final int end;

        public Tag(String id, int start, int end) {
            this.id = id;
            this.start = start;
            this.end = end;
        }
    }

    /** Tags ({@code [NTK <id>]} or {@code [NTK @<account> <id>]}) in order of appearance. */
    public static List<Tag> find(CharSequence text) {
        final List<Tag> out = new ArrayList<>();
        if (text == null || text.length() < 16) return out;
        final Matcher m = TextRule.TAG.matcher(text);
        while (m.find()) out.add(new Tag(m.group(1), m.start(), m.end()));
        return out;
    }

    /** Cheap test before running the pattern on every text on screen. */
    public static boolean mayHaveTag(CharSequence text) {
        if (text == null || text.length() < 16) return false;
        for (int i = 0, n = text.length() - 4; i < n; i++) {
            if (text.charAt(i) == '[' && text.charAt(i + 1) == 'N' && text.charAt(i + 2) == 'T' && text.charAt(i + 3) == 'K') {
                return true;
            }
        }
        return false;
    }

    /**
     * The start of the tag with this id that is nearest to {@code near} (the
     * text may have changed since the screen was read), or -1.
     */
    public static int locate(CharSequence text, String id, int near) {
        int best = -1;
        for (Tag t : find(text)) {
            if (!t.id.equals(id)) continue;
            if (best < 0 || Math.abs(t.start - near) < Math.abs(best - near)) best = t.start;
        }
        return best;
    }

    /** A text block on screen: its text and its vertical extent in screen pixels. */
    public static final class Piece {
        public final String text;
        public final int top;
        public final int bottom;

        public Piece(String text, int top, int bottom) {
            this.text = text == null ? "" : text;
            this.top = top;
            this.bottom = bottom;
        }
    }

    /**
     * Which of the nodes before the tag's node in its container belong to the
     * same text block, when an app splits one block into several nodes (a word
     * in bold, a tag in its own span). Going back from the tag's node: a node
     * that shares a line with the next piece is part of the block; the first
     * node that does not ends it. When the tag's node holds nothing but the tag,
     * the text right before it belongs to it wherever it is. Nodes without text
     * (an avatar, a spacer) are skipped. Returns the pieces in order.
     */
    public static List<Piece> sameBlock(List<Piece> before, Piece own) {
        if (before == null || before.isEmpty()) return new ArrayList<>();
        boolean mustTake = TextRule.canonical(own.text).isEmpty();
        Piece next = own;
        int from = before.size();
        for (int i = before.size() - 1; i >= 0; i--) {
            final Piece p = before.get(i);
            if (p.text.isEmpty()) continue;
            if (!mustTake && !shareALine(p, next)) break;
            from = i;
            next = p;
            mustTake = false;
        }
        final List<Piece> out = new ArrayList<>();
        for (int i = from; i < before.size(); i++) if (!before.get(i).text.isEmpty()) out.add(before.get(i));
        return out;
    }

    private static boolean shareALine(Piece a, Piece b) {
        return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
    }

    /**
     * The text that stands before a tag: the texts of the nodes before the
     * tag's node in the same block ({@code before}, in screen order; see
     * {@link #sameBlock}), then the tag's node's own text before the tag. Pieces on the same line are
     * joined as they are; a piece that ends above the next one is a separate
     * block and gets a line break unless whitespace already separates them
     * (text rule v2 turns any whitespace run into one space). Only the last
     * {@link #MAX_PREFIX} characters are kept.
     */
    public static String prefix(List<Piece> before, Piece own) {
        final StringBuilder b = new StringBuilder();
        final List<Piece> all = new ArrayList<>(before == null ? 0 : before.size() + 1);
        if (before != null) all.addAll(before);
        all.add(own);
        for (int i = 0; i < all.size(); i++) {
            final Piece p = all.get(i);
            if (p.text.isEmpty()) continue;
            if (b.length() > 0 && i > 0) {
                final Piece prev = all.get(i - 1);
                final boolean newBlock = prev.bottom <= p.top;
                final boolean spaced = isSpace(b.charAt(b.length() - 1)) || isSpace(p.text.charAt(0));
                if (newBlock && !spaced) b.append('\n');
            }
            b.append(p.text);
        }
        return keepEnd(b.toString(), MAX_PREFIX);
    }

    private static boolean isSpace(char c) {
        return TextRule.isWhitespace(c);
    }

    /** The last {@code max} UTF-16 units of {@code s}, never starting inside a surrogate pair. */
    static String keepEnd(String s, int max) {
        if (s.length() <= max) return s;
        int from = s.length() - max;
        if (Character.isLowSurrogate(s.charAt(from))) from++;
        return s.substring(from);
    }

    /**
     * Where to draw a tag's button from its characters' boxes on screen
     * ({@code l, t, r, b} per character, null where the app gave none): the
     * line holding most of the tag's characters, as one box. A tag that wraps
     * onto two lines gets its button on the longer part. Null when no box is
     * known.
     */
    public static int[] lineBox(List<int[]> chars) {
        int[] best = null;
        int bestCount = 0;
        int[] cur = null;
        int curCount = 0;
        for (int[] c : chars) {
            if (c == null || c[2] <= c[0] || c[3] <= c[1]) continue;
            final boolean sameLine = cur != null && overlapsVertically(cur, c);
            if (!sameLine) {
                if (cur != null && curCount > bestCount) {
                    best = cur;
                    bestCount = curCount;
                }
                cur = c.clone();
                curCount = 1;
            } else {
                cur[0] = Math.min(cur[0], c[0]);
                cur[1] = Math.min(cur[1], c[1]);
                cur[2] = Math.max(cur[2], c[2]);
                cur[3] = Math.max(cur[3], c[3]);
                curCount++;
            }
        }
        if (cur != null && curCount > bestCount) best = cur;
        return best;
    }

    private static boolean overlapsVertically(int[] a, int[] b) {
        final int top = Math.max(a[1], b[1]);
        final int bottom = Math.min(a[3], b[3]);
        final int minH = Math.min(a[3] - a[1], b[3] - b[1]);
        return bottom - top > minH / 2;
    }
}

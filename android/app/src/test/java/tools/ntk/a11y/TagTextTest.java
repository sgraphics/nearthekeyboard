package tools.ntk.a11y;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import tools.ntk.TextRule;

/** The text side of the stamp buttons: tags, the text before a tag, the box for a button. */
public class TagTextTest {
    private static final String REPLY = "This reply was typed by me, a human, on my own phone, one key at a time. [NTK e65ee28db5]";

    @Test
    public void findsTagsInOrder() {
        final List<TagText.Tag> tags = TagText.find("a [NTK 0123456789] b [NTK @ntk-alice.testnet abcdef0123] c [NTK nothex0000]");
        assertEquals(2, tags.size());
        assertEquals("0123456789", tags.get(0).id);
        assertEquals(2, tags.get(0).start);
        assertEquals(18, tags.get(0).end);
        assertEquals("abcdef0123", tags.get(1).id);
        assertTrue(TagText.find("[NTK 012345678]").isEmpty()); // nine characters
        assertTrue(TagText.find(null).isEmpty());
        assertTrue(TagText.mayHaveTag(REPLY));
        assertFalse(TagText.mayHaveTag("no tag here, just a long enough text"));
    }

    @Test
    public void locatesTheTagNearestToWhereItWas() {
        final String t = "[NTK 0123456789] x [NTK 0123456789] y [NTK aaaaaaaaaa]";
        assertEquals(0, TagText.locate(t, "0123456789", 3));
        assertEquals(19, TagText.locate(t, "0123456789", 25));
        assertEquals(-1, TagText.locate(t, "bbbbbbbbbb", 0));
    }

    @Test
    public void oneNodeHoldsTheWholeBlock() {
        // Chrome exposes the demo feed's reply as one node: text and tag together.
        final int at = TagText.find(REPLY).get(0).start;
        final String before = TagText.prefix(Collections.emptyList(), new TagText.Piece(REPLY.substring(0, at), 100, 200));
        assertEquals("This reply was typed by me, a human, on my own phone, one key at a time. ", before);
    }

    @Test
    public void aSplitBlockIsJoinedInOrder() {
        // <p>Hello <b>there</b>, how are you [NTK …]</p> as separate nodes on one line.
        final List<TagText.Piece> before = Arrays.asList(
                new TagText.Piece("Hello ", 100, 140),
                new TagText.Piece("there", 100, 140),
                new TagText.Piece(", how are you ", 100, 140));
        assertEquals("Hello there, how are you ", TagText.prefix(before, new TagText.Piece("", 100, 140)));
    }

    @Test
    public void blocksAboveGetALineBreak() {
        // Two paragraphs, then the tag in its own node: rule 2.2 makes the break one space.
        final List<TagText.Piece> before = Arrays.asList(
                new TagText.Piece("First line.", 100, 140),
                new TagText.Piece("Second line ends here.", 150, 190));
        final String p = TagText.prefix(before, new TagText.Piece("", 150, 190));
        assertEquals("First line.\nSecond line ends here.", p);
        assertEquals("First line. Second line ends here.", TextRule.canonical(p));
        // Whitespace already there: nothing added.
        final List<TagText.Piece> spaced = Arrays.asList(new TagText.Piece("First line. ", 100, 140));
        assertEquals("First line. Next", TagText.prefix(spaced, new TagText.Piece("Next", 150, 190)));
    }

    @Test
    public void onlyNodesOfTheSameBlockAreAdded() {
        // The demo feed in Chrome: the author line above, then the reply with its tag in one node.
        final TagText.Piece header = new TagText.Piece("Alice @ntk_alice1h", 1890, 1946);
        final TagText.Piece reply = new TagText.Piece("This reply was typed by me. ", 1955, 2135);
        assertTrue(TagText.sameBlock(Arrays.asList(header), reply).isEmpty());

        // A block split into runs on shared lines: all of it; the author line above: not.
        final TagText.Piece run1 = new TagText.Piece("Long text over two lines and ", 1955, 2075);
        final TagText.Piece bold = new TagText.Piece("bold", 2015, 2075);
        final TagText.Piece own = new TagText.Piece(" more ", 2015, 2075);
        final List<TagText.Piece> got = TagText.sameBlock(Arrays.asList(header, run1, bold), own);
        assertEquals(2, got.size());
        assertEquals("Long text over two lines and bold more ", TagText.prefix(got, own));

        // The tag alone in its node, on a line of its own: the text right before it counts.
        final TagText.Piece tagOnly = new TagText.Piece("", 2080, 2135);
        final TagText.Piece avatar = new TagText.Piece("", 1890, 2000);
        final List<TagText.Piece> got2 = TagText.sameBlock(Arrays.asList(header, avatar, reply), tagOnly);
        assertEquals(1, got2.size());
        assertEquals("This reply was typed by me. ", TagText.prefix(got2, tagOnly));
    }

    @Test
    public void keepsOnlyTheEndOfALongText() {
        final StringBuilder b = new StringBuilder();
        while (b.length() < TagText.MAX_PREFIX + 10) b.append("abc 👍 ");
        final String p = TagText.prefix(new ArrayList<>(), new TagText.Piece(b.toString(), 0, 10));
        assertTrue(p.length() <= TagText.MAX_PREFIX);
        assertTrue(b.toString().endsWith(p));
        assertFalse(Character.isLowSurrogate(p.charAt(0)));
        assertEquals("cdef", TagText.keepEnd("abcdef", 4));
        assertEquals("👍x", TagText.keepEnd("a👍x", 3));
        assertEquals("x", TagText.keepEnd("a👍x", 2)); // never half an emoji
    }

    @Test
    public void lineBoxTakesTheLongerLine() {
        // "[NTK" at the end of one line, "e65ee28db5]" on the next.
        final List<int[]> chars = new ArrayList<>();
        for (int i = 0; i < 4; i++) chars.add(new int[] { 900 + i * 20, 100, 920 + i * 20, 140 });
        chars.add(null); // the space: no box
        for (int i = 0; i < 11; i++) chars.add(new int[] { 40 + i * 20, 150, 60 + i * 20, 190 });
        assertArrayEquals(new int[] { 40, 150, 260, 190 }, TagText.lineBox(chars));
        // One line.
        assertArrayEquals(new int[] { 900, 100, 980, 140 }, TagText.lineBox(chars.subList(0, 4)));
        assertNull(TagText.lineBox(Collections.singletonList((int[]) null)));
        assertNull(TagText.lineBox(Collections.singletonList(new int[] { 5, 5, 5, 9 }))); // empty box
    }
}

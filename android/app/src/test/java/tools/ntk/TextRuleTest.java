package tools.ntk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** Text rule v2 and covered text against docs/test-vectors/text-v2.json. */
public class TextRuleTest {
    static JSONObject vectors(String name) throws Exception {
        try (java.io.InputStream in = TextRuleTest.class.getResourceAsStream("/" + name)) {
            if (in == null) throw new AssertionError("missing test vector file " + name);
            return new JSONObject(new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
        }
    }

    @Test
    public void canonicalCases() throws Exception {
        final JSONArray cases = vectors("text-v2.json").getJSONArray("canonical");
        assertTrue(cases.length() >= 13);
        for (int i = 0; i < cases.length(); i++) {
            final JSONObject c = cases.getJSONObject(i);
            final String name = c.getString("name");
            final String canonical = TextRule.canonical(c.getString("input"));
            assertEquals(name, c.getString("canonical"), canonical);
            assertEquals(name, c.getInt("chars"), TextRule.charCount(canonical));
            assertEquals(name, c.getString("sha256"), Codec.sha256Hex(canonical));
        }
    }

    @Test
    public void coveredCases() throws Exception {
        final JSONArray cases = vectors("text-v2.json").getJSONArray("covered");
        for (int i = 0; i < cases.length(); i++) {
            final JSONObject c = cases.getJSONObject(i);
            final String got = TextRule.covered(c.getString("prefix"), c.getInt("chars"), c.getInt("v"));
            if (c.isNull("covered")) {
                assertNull(c.getString("name"), got);
            } else {
                assertEquals(c.getString("name"), c.getString("covered"), got);
            }
        }
    }

    @Test
    public void javaWhitespaceIsNotTheRule() {
        // Character.isWhitespace says yes to U+001C and no to U+00A0; the rule says the opposite.
        assertFalse(TextRule.isWhitespace(0x1c));
        assertTrue(TextRule.isWhitespace(0xa0));
        assertFalse(TextRule.isWhitespace(0xfeff));
        assertFalse(TextRule.isWhitespace(0x200b));
    }

    @Test
    public void tagsAndFieldCheck() {
        assertEquals("[NTK 0123456789]", TextRule.tag("0123456789"));
        assertEquals("e65ee28db5", TextRule.findTagId("text [NTK @ntk-alice.testnet e65ee28db5] more"));
        assertEquals("e65ee28db5", TextRule.findTagId("text [NTK e65ee28db5]"));
        assertNull(TextRule.findTagId("[NTK E65EE28DB5]"));
        assertTrue(TextRule.fieldEndsWith("Earlier.  I agree,\nyes ", " I agree, yes"));
        assertFalse(TextRule.fieldEndsWith("I agree, no", "I agree, yes"));
        assertFalse(TextRule.fieldEndsWith("anything", "   "));
    }
}

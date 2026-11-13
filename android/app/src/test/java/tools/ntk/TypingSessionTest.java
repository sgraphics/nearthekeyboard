package tools.ntk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** The session JSON and its replay, against the enclave's own replay test (enclave/src/model.rs). */
public class TypingSessionTest {
    private static TypingSession.Event tap(String k, long d, long u) {
        return TypingSession.Event.tap(k, d, u, 0f, 0f);
    }

    @Test
    public void replayHandlesBackspaceInsertionsAndTrim() {
        // The same events as replay_handles_backspace_insertions_and_trim in model.rs.
        final TypingSession s = new TypingSession(TypingSession.Kind.STAMP, null, "qwerty-en-portrait-v1");
        s.addTap(tap(" ", 1000, 1050));
        s.addTap(tap("H", 1100, 1150));
        s.addTap(tap("i", 1200, 1250));
        s.addTap(tap("x", 1300, 1350));
        s.addTap(tap("<bksp>", 1400, 1450));
        s.addUntimed(TypingSession.Event.inserted(" there"));
        s.addTap(tap("<shift>", 1500, 1550));
        s.addTap(tap("\n", 1600, 1650));
        final TypingSession.Replay r = s.replay();
        assertEquals("Hi there", r.text);
        assertEquals(2, r.typedChars);
        assertEquals(8, r.totalChars);
        assertEquals(7, s.taps());
    }

    @Test
    public void backspaceRemovesOneScalar() {
        final TypingSession s = new TypingSession(TypingSession.Kind.STAMP, null, "l");
        s.addTap(tap("a", 0, 10));
        s.addTap(tap("👍", 20, 30)); // one emoji, two UTF-16 units
        s.addTap(tap("<bksp>", 40, 50));
        s.addUntimed(TypingSession.Event.bare("<bksp>")); // a repeat: no timing, still deletes
        assertEquals("", s.replay().text);
        assertEquals(3, s.taps());
    }

    @Test
    public void tapsAreKeptInKeyDownOrder() {
        final TypingSession s = new TypingSession(TypingSession.Kind.STAMP, null, "l");
        s.addTap(tap("<shift>", 100, 300)); // released last, recorded last
        s.addTap(tap("A", 150, 250));
        final TypingSession s2 = new TypingSession(TypingSession.Kind.STAMP, null, "l");
        s2.addTap(tap("A", 150, 250));
        s2.addTap(tap("<shift>", 100, 300));
        assertEquals(s.toJson(), s2.toJson());
    }

    @Test
    public void jsonIsTheProtocolFormat() throws Exception {
        final TypingSession s = new TypingSession(TypingSession.Kind.ENROLL, "copy", "qwerty-en-portrait-v1");
        s.addTap(TypingSession.Event.tap("h", 5000, 5085, 0.1f, -0.05f));
        s.addTap(TypingSession.Event.tap("\"", 5190, 5262, -0.02f, 0.12f));
        s.addUntimed(TypingSession.Event.inserted("pasted\ttext"));
        s.addUntimed(TypingSession.Event.bare("<bksp>"));
        final String json = s.toJson();
        assertTrue(json, json.startsWith("{\"v\":1,\"layout\":\"qwerty-en-portrait-v1\",\"mode\":\"copy\",\"events\":[{\"k\":\"h\",\"d\":0,\"u\":85,\"x\":0.1,\"y\":-0.05}"));
        final JSONObject o = new JSONObject(json);
        final JSONArray ev = o.getJSONArray("events");
        assertEquals(4, ev.length());
        assertEquals("\"", ev.getJSONObject(1).getString("k"));
        assertEquals(190, ev.getJSONObject(1).getInt("d"));
        assertEquals("pasted\ttext", ev.getJSONObject(2).getString("ins"));
        assertTrue(ev.getJSONObject(3).isNull("d") || !ev.getJSONObject(3).has("d"));
        assertNotNull(Json.fraction(0.0005));
        assertEquals("0", Json.fraction(0.0004));
        assertEquals("-0.5", Json.fraction(-0.5));
        assertEquals("1", Json.fraction(1.0));
    }

    @Test
    public void replayMatchesTheTextOfASyntheticSession() throws Exception {
        // A session exported from client/synth.mjs (typos and their backspaces included).
        final JSONObject sessions = TextRuleTest.vectors("robot-sessions.json");
        final JSONObject a = sessions.getJSONObject("sessions").getJSONObject("a_stamp");
        final TypingSession s = new TypingSession(TypingSession.Kind.STAMP, null, "l");
        final JSONArray ev = a.getJSONArray("events");
        for (int i = 0; i < ev.length(); i++) {
            final JSONObject e = ev.getJSONObject(i);
            s.addTap(TypingSession.Event.tap(e.getString("k"), Math.round(e.getDouble("d")),
                    Math.round(e.getDouble("u")), (float) e.getDouble("x"), (float) e.getDouble("y")));
        }
        assertEquals(a.getString("text"), s.replay().text);
        assertTrue(s.taps() >= Ntk.MIN_STAMP_TAPS);
    }
}

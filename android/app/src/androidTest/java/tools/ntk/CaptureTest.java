package tools.ntk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.os.SystemClock;
import android.widget.EditText;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Capture test (TODO.md T.4): the robot taps a synthetic session on the real
 * keyboard, and what the keyboard recorded must be what was injected: the same
 * keys in the same order, times within 5 ms, offsets within 0.02. Needs no
 * network and no account.
 */
@RunWith(AndroidJUnit4.class)
public class CaptureTest extends RobotBase {
    @Test
    public void keyboardRecordsWhatWasInjected() throws Exception {
        final JSONObject session = Robot.sessions(inst).getJSONObject("a_capture");
        final EditText field = openTryField();
        robot.awaitKeyboard(TypingSession.Kind.STAMP, 20_000);

        final List<Robot.Tap> injected = robot.type(session.getJSONArray("events"));
        SystemClock.sleep(800);
        inst.waitForIdleSync();

        final String json = robot.onMain(DebugKeys::currentSessionJson);
        final JSONObject recorded = new JSONObject(json);
        final JSONArray events = recorded.getJSONArray("events");
        final List<JSONObject> taps = new ArrayList<>();
        for (int i = 0; i < events.length(); i++) {
            final JSONObject e = events.getJSONObject(i);
            if (e.has("d")) taps.add(e);
        }
        log("injected " + injected.size() + " taps, recorded " + taps.size() + " taps, " + events.length() + " events");
        assertEquals("number of taps", injected.size(), taps.size());
        assertEquals("only taps: no insertions, no untimed events", injected.size(), events.length());

        final long d0 = injected.get(0).d;
        final long r0 = taps.get(0).getLong("d");
        double worstT = 0, worstXY = 0;
        for (int i = 0; i < injected.size(); i++) {
            final Robot.Tap in = injected.get(i);
            final JSONObject rec = taps.get(i);
            assertEquals("key of tap " + i, in.k, rec.getString("k"));
            final double dd = Math.abs((rec.getLong("d") - r0) - (in.d - d0));
            final double du = Math.abs((rec.getLong("u") - r0) - (in.u - d0));
            final double dx = Math.abs(rec.getDouble("x") - in.x);
            final double dy = Math.abs(rec.getDouble("y") - in.y);
            worstT = Math.max(worstT, Math.max(dd, du));
            worstXY = Math.max(worstXY, Math.max(dx, dy));
            assertTrue(String.format(Locale.ROOT, "tap %d (%s): times off by %.0f / %.0f ms", i, in.k, dd, du), dd <= 5 && du <= 5);
            assertTrue(String.format(Locale.ROOT, "tap %d (%s): offset off by %.3f / %.3f", i, in.k, dx, dy), dx <= 0.02 && dy <= 0.02);
        }
        log(String.format(Locale.ROOT, "capture ok: worst time difference %.0f ms, worst offset difference %.3f", worstT, worstXY));

        // The field holds what the taps produce, and the session replays to it.
        assertEquals(session.getString("text"), text(field).trim());
        assertEquals(session.getString("text"), robot.onMain(DebugKeys::currentReplay));
    }
}

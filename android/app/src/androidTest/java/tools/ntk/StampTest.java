package tools.ntk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.os.SystemClock;
import android.widget.EditText;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Stamp only: typist A types the demo reply on the account the app is logged
 * in to (enrolled by FlowTest or by hand) and taps Sign. MATCH, and the tag
 * follows the text. Use it for rehearsals and to try the relay
 * (scripts/device/robot.sh stamp). Skipped when no enrolled account is set up.
 */
@RunWith(AndroidJUnit4.class)
public class StampTest extends RobotBase {
    @Test
    public void typistAGetsAStamp() throws Exception {
        final AccountStore.Account a = AccountStore.get(ctx).current();
        Assume.assumeTrue("no account: run FlowTest first", a != null && AccountStore.get(ctx).isReady());
        log("account " + a.accountId + ", calls go to " + NtkController.get(ctx).client().describe());
        final String reply = Robot.sessions(inst).getJSONObject("a_stamp").getString("text");
        final EditText field = openTryField();
        robot.awaitKeyboard(TypingSession.Kind.STAMP, 30_000);
        robot.type(Robot.sessions(inst).getJSONObject("a_stamp").getJSONArray("events"));
        SystemClock.sleep(600);
        assertEquals(reply, text(field));
        final NtkController.Result r = tapKeyAndAwait(Ntk.CALL_TIMEOUT_MS + 60_000);
        assertEquals(r.message, NtkController.Result.Kind.MATCH, r.kind);
        SystemClock.sleep(800);
        final String stamped = text(field);
        final Matcher m = Pattern.compile("^" + Pattern.quote(reply) + " \\[NTK ([0-9a-f]{10})\\]$").matcher(stamped);
        assertTrue("the tag follows the text: " + stamped, m.matches());
        log("A stamped: " + stamped);
        log("STAMP " + m.group(1) + " " + a.accountId);
        // -e holdMs 20000 keeps the screen as it is, for screenshots and rehearsals.
        final long hold = Long.parseLong(androidx.test.platform.app.InstrumentationRegistry.getArguments().getString("holdMs", "0"));
        if (hold > 0) SystemClock.sleep(hold);
    }
}

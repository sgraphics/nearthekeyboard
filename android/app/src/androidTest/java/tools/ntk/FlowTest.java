package tools.ntk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.widget.EditText;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import tools.ntk.ui.EnrollActivity;

/**
 * Flow test (TODO.md T.4), against the live enclave on OutLayer testnet:
 * typist A gets a fresh faucet account, enrolls three sessions on the
 * enrollment screen, types the demo reply in a field and taps Sign: MATCH,
 * and the tag appears after the text. Typist B then types the same reply on
 * A's account: NO_MATCH, and nothing is inserted. Each enclave call may take
 * minutes.
 */
@RunWith(AndroidJUnit4.class)
public class FlowTest extends RobotBase {
    static final long CALL_MS = Ntk.CALL_TIMEOUT_MS + 60_000;

    @Test
    public void enrollThenStampThenImpostor() throws Exception {
        final JSONObject sessions = Robot.sessions(inst);

        // A fresh testnet account from the faucet.
        robot.onMain(() -> {
            AccountStore.get(ctx).clear();
            return null;
        });
        final CountDownLatch made = new CountDownLatch(1);
        final NtkController.Result[] acct = new NtkController.Result[1];
        robot.onMain(() -> {
            NtkController.get(ctx).createTestnetAccount(r -> {
                acct[0] = r;
                made.countDown();
            });
            return null;
        });
        assertTrue("faucet timed out", made.await(3, TimeUnit.MINUTES));
        assertEquals(acct[0].message, NtkController.Result.Kind.OK, acct[0].kind);
        final String account = AccountStore.get(ctx).current().accountId;
        log("account " + account);

        // Enrollment: consent given, three prompts typed by A.
        ctx.getSharedPreferences("ntk_ui", Context.MODE_PRIVATE).edit().putBoolean("consent_v1", true).commit();
        inst.startActivitySync(new Intent(ctx, EnrollActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        JSONObject last = null;
        for (int i = 1; i <= 3; i++) {
            robot.awaitKeyboard(TypingSession.Kind.ENROLL, 30_000);
            final String mode = robot.onMain(() -> NtkCapture.get().mode());
            log("enroll " + i + " (" + mode + ")");
            robot.type(sessions.getJSONObject("a_enroll_" + i).getJSONArray("events"));
            SystemClock.sleep(600);
            final NtkController.Result r = tapKeyAndAwait(CALL_MS);
            assertEquals("enroll " + i + ": " + r.message, NtkController.Result.Kind.OK, r.kind);
            last = r.output;
            log("enrolled: " + last);
        }
        assertNotNull(last);
        assertTrue("fingerprint ready after three sessions: " + last, last.optBoolean("ready"));
        assertTrue(AccountStore.get(ctx).isReady());

        // A types the demo reply and taps Sign.
        final String reply = sessions.getJSONObject("a_stamp").getString("text");
        final EditText field = openTryField();
        robot.awaitKeyboard(TypingSession.Kind.STAMP, 30_000);
        robot.type(sessions.getJSONObject("a_stamp").getJSONArray("events"));
        SystemClock.sleep(600);
        assertEquals(reply, text(field));
        final NtkController.Result match = tapKeyAndAwait(CALL_MS);
        assertEquals("A on A's account: " + match.message, NtkController.Result.Kind.MATCH, match.kind);
        SystemClock.sleep(800);
        final String stamped = text(field);
        log("A stamped: " + stamped);
        final Matcher m = Pattern.compile("^" + Pattern.quote(reply) + " \\[NTK ([0-9a-f]{10})\\]$").matcher(stamped);
        assertTrue("the tag follows the text: " + stamped, m.matches());
        assertEquals(match.stampId, m.group(1));
        log("STAMP " + m.group(1) + " " + account);

        // B types the same reply on A's account.
        robot.onMain(() -> {
            field.setText("");
            return null;
        });
        robot.awaitKeyboard(TypingSession.Kind.STAMP, 30_000);
        robot.type(sessions.getJSONObject("b_stamp").getJSONArray("events"));
        SystemClock.sleep(600);
        final NtkController.Result no = tapKeyAndAwait(CALL_MS);
        log("B on A's account: " + no.kind + " " + (no.output != null ? no.output : no.message));
        assertEquals("B on A's account: " + no.message, NtkController.Result.Kind.NO_MATCH, no.kind);
        SystemClock.sleep(500);
        final String after = text(field);
        assertEquals("nothing is inserted on NO_MATCH", reply, after);
        assertFalse(TextRule.TAG.matcher(after).find());
    }
}

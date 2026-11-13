package tools.ntk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.text.InputType;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import rkr.simplekeyboard.inputmethod.R;
import tools.ntk.ui.SetupActivity;

/**
 * Field tests (TODO.md T.4), on the real keyboard with the robot typist. No
 * network: every refusal here happens on the phone. Sign needs an account to
 * answer at all, so when none is logged in a local throwaway key is made (it
 * never reaches the chain) and deleted afterwards.
 * a password field records nothing; text that arrives without key taps
 * (`adb shell input text`) is not counted as typed and Sign refuses; a cursor
 * moved from outside marks the session changed and Sign refuses; a field
 * emptied by its app starts a new session.
 */
@RunWith(AndroidJUnit4.class)
public class FieldTest extends RobotBase {
    private static final long WAIT_MS = 30_000;
    private boolean mMadeAccount;

    @Before
    public void someAccount() throws Exception {
        final AccountStore store = AccountStore.get(ctx);
        if (store.current() == null) {
            store.createPending("ntk-fieldtest.testnet", AccountStore.KIND_FAUCET);
            store.activate("ntk-fieldtest.testnet");
            mMadeAccount = true;
        }
    }

    @After
    public void dropAccount() {
        if (mMadeAccount) AccountStore.get(ctx).clear();
    }

    /** The first n events of a session: enough taps to see that nothing is recorded. */
    private static JSONArray first(JSONArray events, int n) throws Exception {
        final JSONArray out = new JSONArray();
        for (int i = 0; i < Math.min(n, events.length()); i++) out.put(events.get(i));
        return out;
    }

    @Test
    public void passwordFieldRecordsNothing() throws Exception {
        bringAppToFront();
        final Activity a = inst.startActivitySync(new Intent(ctx, SetupActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        inst.waitForIdleSync();
        final EditText pw = robot.onMain(() -> {
            final EditText f = new EditText(a);
            f.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
            f.setHint("password");
            final ViewGroup column = (ViewGroup) ((ViewGroup) a.findViewById(R.id.ntk_root)).getChildAt(0);
            // Near the top, so the keyboard does not cover it (the screen's layout may change).
            column.addView(f, Math.min(2, column.getChildCount()), new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            f.requestFocus();
            ((InputMethodManager) a.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(f, 0);
            return f;
        });
        // Wait for the keyboard on the password field.
        final long end = SystemClock.uptimeMillis() + WAIT_MS;
        String reason = null;
        while (SystemClock.uptimeMillis() < end) {
            reason = robot.onMain(() -> NtkCapture.get().notRecordingReason());
            if (robot.snapshot().optBoolean("shown") && reason != null && reason.startsWith("Password")) break;
            if (!robot.snapshot().optBoolean("shown")) robot.tapFocusedField();
            SystemClock.sleep(500);
        }
        assertNotNull("the keyboard came up on the password field", reason);
        assertTrue(reason, reason.startsWith("Password"));
        SystemClock.sleep(400);

        robot.type(first(Robot.sessions(inst).getJSONObject("a_capture").getJSONArray("events"), 12));
        SystemClock.sleep(600);
        final String typed = robot.onMain(() -> pw.getText().toString());
        log("password field: " + typed.length() + " characters typed, session " + robot.onMain(DebugKeys::currentSessionJson));
        assertTrue("the keys reached the field", typed.length() >= 8);
        assertNull("no session in a password field", robot.onMain(DebugKeys::currentSessionJson));

        final NtkController.Result r = tapKeyAndAwait(10_000);
        assertEquals("LOCAL", r.code);
        assertTrue(r.message, r.message.startsWith("Password field"));
        SystemClock.sleep(300);
        final String strip = robot.snapshot().optString("strip_text");
        assertTrue("the strip says why: " + strip, strip.contains("Password field"));
        log("PASS password field records nothing; Sign says: " + r.message);
    }

    @Test
    public void textWithoutTapsIsNotTyped() throws Exception {
        final JSONObject s = Robot.sessions(inst).getJSONObject("a_stamp");
        final EditText field = openTryField();
        robot.awaitKeyboard(TypingSession.Kind.STAMP, WAIT_MS);
        robot.type(s.getJSONArray("events"));
        SystemClock.sleep(600);
        final int taps = robot.onMain(DebugKeys::currentTaps);
        assertEquals(s.getString("text"), text(field));

        // `adb shell input text`: key events from outside, no touches on the keyboard.
        robot.shell("input text %sand%sthis%sbit%swas%snot%styped%sat%sall");
        SystemClock.sleep(1500);
        final String after = text(field);
        assertEquals(s.getString("text") + " and this bit was not typed at all", after);
        final JSONObject rec = new JSONObject(robot.onMain(DebugKeys::currentSessionJson));
        int ins = 0;
        final JSONArray ev = rec.getJSONArray("events");
        for (int i = 0; i < ev.length(); i++) if (ev.getJSONObject(i).has("ins")) ins++;
        final TypingSession ts = robot.onMain(() -> NtkCapture.get().session());
        final TypingSession.Replay rp = ts.replay();
        log("after input text: taps " + taps + " -> " + ts.taps() + ", " + ins + " inserted events, " + rp.typedPct()
                + "% typed, changed=" + ts.changedReason());
        assertEquals("no taps were added", taps, ts.taps());
        assertTrue("the arrived text is not counted as typed", ins > 0 || ts.changedReason() != null);
        assertTrue(rp.typedPct() < Ntk.MIN_TYPED_PCT || ts.changedReason() != null);

        final NtkController.Result r = tapKeyAndAwait(10_000);
        assertEquals("Sign refuses on the phone: " + r.message, "LOCAL", r.code);
        assertFalse("nothing inserted", TextRule.TAG.matcher(text(field)).find());
        log("PASS input text is not typed; Sign says: " + r.message);
    }

    @Test
    public void cursorMovedFromOutsideMarksTheSessionChanged() throws Exception {
        final JSONObject s = Robot.sessions(inst).getJSONObject("a_stamp");
        final EditText field = openTryField();
        robot.awaitKeyboard(TypingSession.Kind.STAMP, WAIT_MS);
        robot.type(s.getJSONArray("events"));
        SystemClock.sleep(600);
        // Move the cursor back two words from outside the keyboard, and put text there.
        for (int i = 0; i < 8; i++) robot.shell("input keyevent KEYCODE_DPAD_LEFT");
        robot.shell("input text X");
        SystemClock.sleep(1500);
        final TypingSession ts = robot.onMain(() -> NtkCapture.get().session());
        log("after a cursor move and input text: changed=" + ts.changedReason() + ", text " + text(field).length() + " chars");
        assertNotNull("the session is marked changed", ts.changedReason());

        final NtkController.Result r = tapKeyAndAwait(10_000);
        assertEquals("LOCAL", r.code);
        assertTrue(r.message, r.message.startsWith("Retype to sign"));
        log("PASS cursor moved from outside; Sign says: " + r.message);
    }

    @Test
    public void fieldEmptiedByItsAppStartsANewSession() throws Exception {
        final JSONObject s = Robot.sessions(inst).getJSONObject("a_capture");
        final EditText field = openTryField();
        robot.awaitKeyboard(TypingSession.Kind.STAMP, WAIT_MS);
        robot.type(first(s.getJSONArray("events"), 20));
        SystemClock.sleep(600);
        final TypingSession before = robot.onMain(() -> NtkCapture.get().session());
        assertTrue("typed into the session", before.taps() >= 15);

        // The app empties the field, as a chat app does after sending.
        robot.onMain(() -> {
            field.setText("");
            return null;
        });
        SystemClock.sleep(1000);
        final TypingSession after = robot.onMain(() -> NtkCapture.get().session());
        log("emptied: session " + before.taps() + " taps -> " + (after == null ? "none" : after.taps() + " taps, changed=" + after.changedReason()));
        assertNotNull(after);
        assertNotSame("a new session", before, after);
        assertTrue("the new session is empty", after.isEmpty());
        assertNull("and can be signed once typed", after.changedReason());

        // Typing goes on in the new session.
        robot.type(first(s.getJSONArray("events"), 10));
        SystemClock.sleep(600);
        final TypingSession now = robot.onMain(() -> NtkCapture.get().session());
        assertTrue("the new session records", now == after && now.taps() >= 8);
        log("PASS emptied field starts a new session (" + now.taps() + " taps since)");
    }
}

package tools.ntk;

import static org.junit.Assert.assertEquals;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * The robot typist as a script step, for rehearsals and proof videos: in
 * whatever app has the keyboard up (the NTK enrollment screen, the demo feed
 * in Chrome), wait for an empty session of the given kind, type a session
 * and sign it; then the next step. The screens around it are driven from the
 * computer (video/tools/proof-keyboard.sh). Start it before opening the app's
 * screens: starting an instrumentation restarts the app's process, keyboard
 * included.
 *
 *   adb shell am instrument -w -e class tools.ntk.ScriptTest \
 *       -e steps enroll:v_enroll_1,enroll:a_enroll_2,enroll:v_enroll_3,stamp:a_stamp -e sign host \
 *       tools.ntk.keyboard.test/androidx.test.runner.AndroidJUnitRunner
 *
 * Arguments: steps (kind:session, kind is enroll or stamp, sessions are names
 * in robot-sessions.json), sign (robot: the robot taps Sign; host: it logs
 * "SIGN_AT x y" and waits for the computer to tap there, so the tap shows on a
 * recording; none: type only), pauseMs (before each session, default 1200),
 * waitMs (for the keyboard, default 600000), holdMs (stay alive at the end,
 * so the keyboard's process outlives the recording; default 0).
 * Log lines (tag NTK-ROBOT): ROBOT READY, TYPING, TYPED, SIGN_AT, RESULT, SCRIPT DONE;
 * FAILED when a call ends in an error, after which the robot asks for Sign again (up to three tries).
 *
 * While this runs it holds the UI automation connection, so uiautomator dump
 * (scripts/device/ui.sh) cannot run. It answers instead:
 *   adb shell am broadcast -p tools.ntk.keyboard -a tools.ntk.test.FIND --es by text --es q "'Reply'"
 * logs "FOUND x y <q>" for the first visible element whose text (by text)
 * contains q or whose resource id (by id) is q, or "NOTFOUND <q>".
 */
@RunWith(AndroidJUnit4.class)
public class ScriptTest extends RobotBase {
    static final String FIND = "tools.ntk.test.FIND";

    private final BroadcastReceiver mFinder = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            final String by = i.getStringExtra("by");
            final String q = i.getStringExtra("q");
            if (q == null) return;
            new Thread(() -> {
                int[] at = null;
                try {
                    at = find("id".equals(by), q);
                } catch (RuntimeException e) {
                    log("FIND failed: " + e.getClass().getSimpleName());
                }
                log(at == null ? "NOTFOUND " + q : "FOUND " + at[0] + " " + at[1] + " " + q);
            }, "ntk-find").start();
        }
    };

    @Before
    public void listen() {
        final IntentFilter f = new IntentFilter(FIND);
        if (Build.VERSION.SDK_INT >= 33) {
            ctx.registerReceiver(mFinder, f, Context.RECEIVER_EXPORTED);
        } else {
            ctx.registerReceiver(mFinder, f);
        }
    }

    @After
    public void stopListening() {
        ctx.unregisterReceiver(mFinder);
    }

    /** The centre of the first visible node in the active window with this text (or resource id). */
    private int[] find(boolean byId, String q) {
        final AccessibilityNodeInfo root = inst.getUiAutomation().getRootInActiveWindow();
        if (root == null) return null;
        final java.util.ArrayDeque<AccessibilityNodeInfo> stack = new java.util.ArrayDeque<>();
        stack.push(root);
        int n = 0;
        while (!stack.isEmpty() && n++ < 5000) {
            final AccessibilityNodeInfo node = stack.pop();
            boolean hit;
            if (byId) {
                final String id = node.getViewIdResourceName();
                hit = id != null && (id.equals(q) || id.endsWith(":id/" + q));
            } else {
                final CharSequence t = node.getText() != null ? node.getText() : node.getContentDescription();
                hit = t != null && t.toString().contains(q);
            }
            if (hit && node.isVisibleToUser()) {
                final Rect b = new Rect();
                node.getBoundsInScreen(b);
                return new int[] { b.centerX(), b.centerY() };
            }
            for (int k = node.getChildCount() - 1; k >= 0; k--) {
                final AccessibilityNodeInfo c = node.getChild(k);
                if (c != null) stack.push(c);
            }
        }
        return null;
    }

    @Test
    public void typeAndSign() throws Exception {
        final Bundle args = InstrumentationRegistry.getArguments();
        final String[] steps = args.getString("steps", "stamp:a_stamp").split(",");
        final String sign = args.getString("sign", "robot");
        final long pause = Long.parseLong(args.getString("pauseMs", "1200"));
        final long wait = Long.parseLong(args.getString("waitMs", "600000"));
        final long hold = Long.parseLong(args.getString("holdMs", "0"));
        final JSONObject sessions = Robot.sessions(inst);
        log("ROBOT READY " + steps.length + " steps");

        for (String step : steps) {
            final String[] kv = step.split(":", 2);
            final TypingSession.Kind kind = "enroll".equals(kv[0]) ? TypingSession.Kind.ENROLL : TypingSession.Kind.STAMP;
            final String name = kv.length > 1 ? kv[1] : kv[0];
            robot.awaitKeyboard(kind, wait, false);
            SystemClock.sleep(pause);
            robot.awaitKeyboard(kind, wait, false); // the field may have changed during the pause
            log("TYPING " + name);
            robot.type(sessions.getJSONObject(name).getJSONArray("events"));
            SystemClock.sleep(600);
            log("TYPED " + name + ": " + robot.onMain(DebugKeys::currentTaps) + " taps");
            if ("none".equals(sign)) continue;
            NtkController.Result r = "host".equals(sign) ? awaitHostTap(FlowTest.CALL_MS) : tapKeyAndAwait(FlowTest.CALL_MS);
            // An error (the relay restarted and forgot the call, a timeout) inserts nothing and keeps
            // the session: sign again, as a user would. A retry signs a fresh request.
            for (int tries = 1; r.kind == NtkController.Result.Kind.ERROR && tries < 3; tries++) {
                log("FAILED " + name + " " + r.message);
                SystemClock.sleep(2500);
                r = "host".equals(sign) ? awaitHostTap(FlowTest.CALL_MS) : tapKeyAndAwait(FlowTest.CALL_MS);
            }
            log("RESULT " + name + " " + r.kind + (r.stampId != null ? " " + r.stampId : "")
                    + (r.output != null && kind == TypingSession.Kind.ENROLL ? " ready=" + r.output.optBoolean("ready") : "")
                    + (r.kind == NtkController.Result.Kind.ERROR || r.kind == NtkController.Result.Kind.NO_MATCH ? " " + r.message : ""));
            assertEquals(name + ": " + r.message,
                    kind == TypingSession.Kind.ENROLL ? NtkController.Result.Kind.OK : NtkController.Result.Kind.MATCH, r.kind);
        }
        log("SCRIPT DONE");
        if (hold > 0) SystemClock.sleep(hold);
    }

    /** Logs where the Sign key is, then waits for its result: the computer taps it. */
    private NtkController.Result awaitHostTap(long timeoutMs) throws Exception {
        final CountDownLatch latch = new CountDownLatch(1);
        final NtkController.Result[] out = new NtkController.Result[1];
        final SignFlow.Listener l = (op, r) -> {
            if ("local".equals(op)) log("LOCAL " + r.message);
            out[0] = r;
            latch.countDown();
        };
        robot.onMain(() -> {
            SignFlow.addListener(l);
            return null;
        });
        try {
            final JSONObject sign = robot.snapshot().getJSONObject("sign");
            log("SIGN_AT " + (sign.getInt("left") + sign.getInt("width") / 2) + " " + (sign.getInt("top") + sign.getInt("height") / 2));
            if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS)) throw new AssertionError("no result after " + timeoutMs / 1000 + " s");
        } finally {
            robot.onMain(() -> {
                SignFlow.removeListener(l);
                return null;
            });
        }
        return out[0];
    }
}

package tools.ntk;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;

import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import rkr.simplekeyboard.inputmethod.R;
import rkr.simplekeyboard.inputmethod.compat.PreferenceManagerCompat;
import tools.ntk.ui.SetupActivity;

/** Shared setup for the robot typist tests: our keyboard on, auto-caps off, the screen awake. */
public abstract class RobotBase {
    static final String IME = "tools.ntk.keyboard/rkr.simplekeyboard.inputmethod.latin.LatinIME";

    protected Instrumentation inst;
    protected Context ctx;
    protected Robot robot;

    @Before
    public void setUpDevice() throws Exception {
        inst = InstrumentationRegistry.getInstrumentation();
        ctx = inst.getTargetContext();
        robot = new Robot(inst);
        robot.shell("input keyevent KEYCODE_WAKEUP");
        robot.shell("wm dismiss-keyguard");
        robot.shell("svc power stayon true");
        robot.shell("settings put secure show_ime_with_hard_keyboard 1");
        robot.shell("ime enable " + IME);
        robot.shell("ime set " + IME);
        // Synthetic sessions press shift themselves: no automatic capitals while the robot types.
        devicePrefs().edit().putBoolean("auto_cap", false).commit();
        // An autofill picker (the device account's e-mail) can drop over the keys and catch a tap.
        mAutofill = robot.shell("settings get secure autofill_service").trim();
        robot.shell("settings put secure autofill_service null");
    }

    private String mAutofill;

    @After
    public void restoreDevice() throws Exception {
        devicePrefs().edit().remove("auto_cap").commit();
        if (mAutofill != null && !mAutofill.isEmpty() && !"null".equals(mAutofill)) {
            robot.shell("settings put secure autofill_service " + mAutofill);
        }
    }

    private SharedPreferences devicePrefs() {
        return PreferenceManagerCompat.getDeviceSharedPreferences(ctx);
    }

    protected static void log(String s) {
        Log.i(Robot.TAG, s);
    }

    /** Opens the NTK app and focuses its "Try it" field, which starts a stamp session. */
    protected EditText openTryField() throws Exception {
        final Intent i = new Intent(ctx, SetupActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        final Activity a = inst.startActivitySync(i);
        inst.waitForIdleSync();
        return robot.onMain(() -> {
            final EditText f = a.findViewById(R.id.ntk_try_field);
            f.setText("");
            f.requestFocus();
            ((InputMethodManager) a.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(f, 0);
            return f;
        });
    }

    protected String text(EditText f) throws Exception {
        return robot.onMain(() -> f.getText().toString());
    }

    /** Taps the strip's key and waits for its result (an enclave call can take minutes). */
    protected NtkController.Result tapKeyAndAwait(long timeoutMs) throws Exception {
        final CountDownLatch latch = new CountDownLatch(1);
        final NtkController.Result[] out = new NtkController.Result[1];
        final String[] op = new String[1];
        final SignFlow.Listener l = (o, r) -> {
            op[0] = o;
            out[0] = r;
            latch.countDown();
        };
        robot.onMain(() -> {
            SignFlow.addListener(l);
            return null;
        });
        try {
            robot.tapSignKey();
            if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS)) throw new AssertionError("no result after " + timeoutMs / 1000 + " s");
        } finally {
            robot.onMain(() -> {
                SignFlow.removeListener(l);
                return null;
            });
        }
        log(op[0] + " -> " + out[0].kind + (out[0].code != null ? " " + out[0].code : "") + ": " + out[0].message);
        return out[0];
    }
}

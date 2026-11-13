package tools.ntk;

import android.content.Context;
import android.util.Log;
import android.view.View;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * DEBUG BUILDS ONLY (src/debug). Release builds compile src/release/.../BuildHooks.java,
 * which does nothing: no session files, no key geometry.
 *
 * Saves every session the keyboard sends to app-private storage
 * (files/typing-data/), so they can be pulled for tuning:
 *   adb exec-out run-as tools.ntk.keyboard tar c files/typing-data > typing-data.tar
 * and keeps the keyboard views for the robot typist's geometry hook (DebugKeys).
 */
public final class BuildHooks {
    private BuildHooks() {}

    public static final boolean DEBUG_HOOKS = true;

    static WeakReference<View> sKeyboardView = new WeakReference<>(null);
    static WeakReference<View> sStripView = new WeakReference<>(null);

    public static void onKeyboardViews(View keyboardView, View stripView) {
        sKeyboardView = new WeakReference<>(keyboardView);
        sStripView = new WeakReference<>(stripView);
    }

    public static void saveSession(Context context, String op, String account, String sessionJson, JSONObject output) {
        try {
            final File dir = new File(context.getFilesDir(), "typing-data");
            if (!dir.isDirectory() && !dir.mkdirs()) return;
            final String at = new SimpleDateFormat("yyyyMMdd-HHmmss-SSS", Locale.ROOT).format(new Date());
            final File f = new File(dir, at + "-" + op + ".json");
            final String body = "{\"op\":" + Json.quote(op) + ",\"account\":" + Json.quote(account)
                    + ",\"saved_at_ms\":" + System.currentTimeMillis()
                    + ",\"output\":" + (output == null ? "null" : output.toString())
                    + ",\"session\":" + sessionJson + "}\n";
            try (FileOutputStream o = new FileOutputStream(f)) {
                o.write(body.getBytes(StandardCharsets.UTF_8));
            }
            Log.d(Ntk.TAG, "debug: saved session " + f.getName());
        } catch (Exception e) {
            Log.w(Ntk.TAG, "debug: could not save session: " + e.getMessage());
        }
    }
}

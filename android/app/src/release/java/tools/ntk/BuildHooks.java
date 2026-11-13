package tools.ntk;

import android.content.Context;
import android.view.View;

import org.json.JSONObject;

/**
 * Release builds: no session files, no key-geometry hook, nothing logged.
 * The debug build's version is in src/debug/java/tools/ntk/BuildHooks.java.
 */
public final class BuildHooks {
    private BuildHooks() {}

    public static final boolean DEBUG_HOOKS = false;

    public static void onKeyboardViews(View keyboardView, View stripView) {
    }

    public static void saveSession(Context context, String op, String account, String sessionJson, JSONObject output) {
    }
}

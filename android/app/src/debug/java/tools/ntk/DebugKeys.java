package tools.ntk;

import android.view.View;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

import rkr.simplekeyboard.inputmethod.keyboard.Key;
import rkr.simplekeyboard.inputmethod.keyboard.Keyboard;
import rkr.simplekeyboard.inputmethod.keyboard.MainKeyboardView;
import tools.ntk.ui.StripView;

/**
 * DEBUG BUILDS ONLY: the robot typist's view of the keyboard (TODO.md T.4).
 * Runs in the app's process (the instrumented test and the keyboard share it).
 * Call on the main thread.
 */
public final class DebugKeys {
    private DebugKeys() {}

    /**
     * The keys of the keyboard on screen, in screen pixels: for each key its
     * code, label, and drawn rectangle (left, top, width, height); plus the
     * strip's Sign key and the current shift state.
     */
    public static JSONObject snapshot() throws Exception {
        final View v = BuildHooks.sKeyboardView.get();
        final JSONObject out = new JSONObject();
        if (!(v instanceof MainKeyboardView) || !v.isShown()) {
            out.put("shown", false);
            return out;
        }
        final MainKeyboardView kv = (MainKeyboardView) v;
        final Keyboard kb = kv.getKeyboard();
        final int[] loc = new int[2];
        kv.getLocationOnScreen(loc);
        out.put("shown", kb != null);
        out.put("view_left", loc[0]);
        out.put("view_top", loc[1]);
        if (kb == null) return out;
        final int element = kb.mId.mElementId;
        out.put("element", element);
        out.put("shifted", element >= 1 && element <= 3);
        final JSONArray keys = new JSONArray();
        final List<Key> list = kb.getSortedKeys();
        for (Key k : list) {
            if (k.isSpacer()) continue;
            final JSONObject o = new JSONObject();
            o.put("code", k.getCode());
            o.put("label", k.getLabel() == null ? JSONObject.NULL : k.getLabel());
            o.put("left", loc[0] + kv.getPaddingLeft() + k.getX());
            o.put("top", loc[1] + kv.getPaddingTop() + k.getY());
            o.put("width", k.getWidth());
            o.put("height", k.getHeight());
            keys.put(o);
        }
        out.put("keys", keys);
        final View s = BuildHooks.sStripView.get();
        if (s instanceof StripView && s.isShown()) {
            final int[] sl = new int[2];
            s.getLocationOnScreen(sl);
            final android.graphics.Rect r = ((StripView) s).signKeyRect();
            final JSONObject sign = new JSONObject();
            sign.put("left", sl[0] + r.left);
            sign.put("top", sl[1] + r.top);
            sign.put("width", r.width());
            sign.put("height", r.height());
            out.put("sign", sign);
            out.put("strip_text", ((StripView) s).debugText());
        }
        return out;
    }

    /** The session the keyboard is recording now, as it would be sealed. */
    public static String currentSessionJson() {
        final TypingSession s = NtkCapture.get().session();
        return s == null ? null : s.toJson();
    }

    public static int currentTaps() {
        final TypingSession s = NtkCapture.get().session();
        return s == null ? -1 : s.taps();
    }

    public static String currentReplay() {
        final TypingSession s = NtkCapture.get().session();
        return s == null ? null : s.replay().text;
    }
}

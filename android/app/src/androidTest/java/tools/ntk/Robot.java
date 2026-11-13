package tools.ntk;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.graphics.Rect;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputDevice;
import android.view.MotionEvent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The robot typist (TODO.md T.4): taps a recorded session on the real keyboard
 * with UiAutomation.injectInputEvent, choosing the touch-down time, the
 * touch-up time and the touch point of every tap. Key positions come from the
 * keyboard itself through the debug-only hook (DebugKeys). Two thumbs that
 * overlap become a real two-pointer gesture.
 */
public final class Robot {
    static final String TAG = "NTK-ROBOT";

    /** One tap as injected: the key, the planned times (uptime ms), the planned offset and the pixel used. */
    public static final class Tap {
        public String k;
        public int code;
        public long d;
        public long u;
        public double x;
        public double y;
        public int px;
        public int py;
    }

    private final Instrumentation mInst;
    private final UiAutomation mUa;

    public Robot(Instrumentation inst) {
        mInst = inst;
        mUa = inst.getUiAutomation();
    }

    public String shell(String cmd) throws Exception {
        final android.os.ParcelFileDescriptor pfd = mUa.executeShellCommand(cmd);
        try (InputStream in = new android.os.ParcelFileDescriptor.AutoCloseInputStream(pfd)) {
            return new String(readAll(in), StandardCharsets.UTF_8);
        }
    }

    static byte[] readAll(InputStream in) throws Exception {
        final java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        final byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    /** The sessions exported from client/synth.mjs (android/tools/export-sessions.mjs). */
    public static JSONObject sessions(Instrumentation inst) throws Exception {
        try (InputStream in = inst.getContext().getAssets().open("robot-sessions.json")) {
            return new JSONObject(new String(readAll(in), StandardCharsets.UTF_8)).getJSONObject("sessions");
        }
    }

    /** The keyboard's geometry, read on the main thread. */
    public JSONObject snapshot() throws Exception {
        final JSONObject[] out = new JSONObject[1];
        final Exception[] err = new Exception[1];
        mInst.runOnMainSync(() -> {
            try {
                out[0] = DebugKeys.snapshot();
            } catch (Exception e) {
                err[0] = e;
            }
        });
        if (err[0] != null) throw err[0];
        return out[0];
    }

    public <T> T onMain(java.util.concurrent.Callable<T> c) throws Exception {
        final Object[] out = new Object[1];
        final Exception[] err = new Exception[1];
        mInst.runOnMainSync(() -> {
            try {
                out[0] = c.call();
            } catch (Exception e) {
                err[0] = e;
            }
        });
        if (err[0] != null) throw err[0];
        @SuppressWarnings("unchecked") final T t = (T) out[0];
        return t;
    }

    /** Taps the centre of the field that has focus in our app, as a user would to bring up the keyboard. */
    public boolean tapFocusedField() throws Exception {
        final int[] at = onMain(() -> {
            final android.view.View v = NtkTestFocus.focusedEditor();
            if (v == null) return null;
            final int[] loc = new int[2];
            v.getLocationOnScreen(loc);
            return new int[] { loc[0] + v.getWidth() / 2, loc[1] + Math.min(v.getHeight() / 2, 60) };
        });
        if (at == null) return false;
        tap(at[0], at[1]);
        return true;
    }

    /** Waits until the keyboard is on screen, recording an empty session of the given kind. */
    public JSONObject awaitKeyboard(TypingSession.Kind kind, long timeoutMs) throws Exception {
        final long end = SystemClock.uptimeMillis() + timeoutMs;
        long nextNudge = SystemClock.uptimeMillis() + 3000;
        while (SystemClock.uptimeMillis() < end) {
            if (SystemClock.uptimeMillis() > nextNudge && !snapshot().optBoolean("shown")) {
                Log.i(TAG, "keyboard not up: tapping the field");
                tapFocusedField();
                nextNudge = SystemClock.uptimeMillis() + 5000;
            }
            final JSONObject s = snapshot();
            final Boolean ready = onMain(() -> {
                final TypingSession ts = NtkCapture.get().session();
                return ts != null && ts.kind == kind && ts.isEmpty() && !NtkCapture.get().isHolding();
            });
            if (s.optBoolean("shown") && s.has("keys") && ready && s.optInt("element", -1) == 0) {
                SystemClock.sleep(400); // let the window settle
                return snapshot();
            }
            SystemClock.sleep(200);
        }
        throw new AssertionError("the keyboard did not come up recording a " + kind + " session: " + snapshot());
    }

    static int codeFor(String k) {
        switch (k) {
            case "<shift>": return -1;
            case "<bksp>": return -5;
            case "<sym>": return -3;
            default: return Character.toLowerCase(k.codePointAt(0));
        }
    }

    private static Map<Integer, Rect> keyRects(JSONObject snap) throws Exception {
        final Map<Integer, Rect> m = new HashMap<>();
        final JSONArray keys = snap.getJSONArray("keys");
        for (int i = 0; i < keys.length(); i++) {
            final JSONObject k = keys.getJSONObject(i);
            final int l = k.getInt("left"), t = k.getInt("top");
            m.put(k.getInt("code"), new Rect(l, t, l + k.getInt("width"), t + k.getInt("height")));
        }
        return m;
    }

    private static final class Action implements Comparable<Action> {
        final long t;
        final boolean down;
        final int tap;

        Action(long t, boolean down, int tap) {
            this.t = t;
            this.down = down;
            this.tap = tap;
        }

        @Override
        public int compareTo(Action o) {
            if (t != o.t) return Long.compare(t, o.t);
            if (down != o.down) return down ? 1 : -1; // at the same ms, lift before pressing
            return Integer.compare(tap, o.tap);
        }
    }

    /**
     * Taps the session's events at their recorded times and points, starting
     * shortly from now. Returns the taps as injected.
     */
    public List<Tap> type(JSONArray events) throws Exception {
        final Map<Integer, Rect> rects = keyRects(snapshot());
        final List<Tap> taps = new ArrayList<>();
        final long t0 = SystemClock.uptimeMillis() + 300;
        for (int i = 0; i < events.length(); i++) {
            final JSONObject e = events.getJSONObject(i);
            final Tap t = new Tap();
            t.k = e.getString("k");
            t.code = codeFor(t.k);
            final Rect r = rects.get(t.code);
            if (r == null) throw new AssertionError("no key for " + t.k + " (code " + t.code + ")");
            t.d = t0 + Math.round(e.getDouble("d"));
            t.u = Math.max(t.d + 1, t0 + Math.round(e.getDouble("u")));
            t.x = e.getDouble("x");
            t.y = e.getDouble("y");
            t.px = (int) Math.round(r.left + r.width() / 2.0 + t.x * r.width());
            t.py = (int) Math.round(r.top + r.height() / 2.0 + t.y * r.height());
            taps.add(t);
        }
        final List<Action> actions = new ArrayList<>();
        for (int i = 0; i < taps.size(); i++) {
            actions.add(new Action(taps.get(i).d, true, i));
            actions.add(new Action(taps.get(i).u, false, i));
        }
        Collections.sort(actions);

        final List<Integer> active = new ArrayList<>(); // tap indexes, in pointer order
        final Map<Integer, Integer> pointerId = new HashMap<>();
        long gestureDown = 0;
        for (Action a : actions) {
            final long wait = a.t - SystemClock.uptimeMillis();
            if (wait > 0) SystemClock.sleep(wait);
            final int action;
            if (a.down) {
                int id = 0;
                while (pointerId.containsValue(id)) id++;
                pointerId.put(a.tap, id);
                active.add(a.tap);
                if (active.size() == 1) {
                    gestureDown = a.t;
                    action = MotionEvent.ACTION_DOWN;
                } else {
                    action = MotionEvent.ACTION_POINTER_DOWN | ((active.size() - 1) << MotionEvent.ACTION_POINTER_INDEX_SHIFT);
                }
            } else {
                final int index = active.indexOf(a.tap);
                action = active.size() == 1 ? MotionEvent.ACTION_UP
                        : MotionEvent.ACTION_POINTER_UP | (index << MotionEvent.ACTION_POINTER_INDEX_SHIFT);
            }
            final int n = active.size();
            final MotionEvent.PointerProperties[] props = new MotionEvent.PointerProperties[n];
            final MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[n];
            for (int i = 0; i < n; i++) {
                final Tap t = taps.get(active.get(i));
                props[i] = new MotionEvent.PointerProperties();
                props[i].id = pointerId.get(active.get(i));
                props[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
                coords[i] = new MotionEvent.PointerCoords();
                coords[i].x = t.px;
                coords[i].y = t.py;
                coords[i].pressure = 1f;
                coords[i].size = 1f;
            }
            final MotionEvent ev = MotionEvent.obtain(gestureDown, a.t, action, n, props, coords, 0, 0, 1f, 1f,
                    0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
            if (!mUa.injectInputEvent(ev, true)) Log.w(TAG, "injection refused at " + a.t);
            ev.recycle();
            if (!a.down) {
                active.remove((Integer) a.tap);
                pointerId.remove(a.tap);
            }
        }
        return taps;
    }

    /** A plain tap at a screen point (the Sign key, a button). */
    public void tap(int x, int y) {
        final long t = SystemClock.uptimeMillis();
        final MotionEvent down = MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, x, y, 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        mUa.injectInputEvent(down, true);
        down.recycle();
        SystemClock.sleep(70);
        final MotionEvent up = MotionEvent.obtain(t, t + 70, MotionEvent.ACTION_UP, x, y, 0);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        mUa.injectInputEvent(up, true);
        up.recycle();
    }

    /** Taps the strip's Sign / Enroll key. */
    public void tapSignKey() throws Exception {
        final JSONObject sign = snapshot().getJSONObject("sign");
        tap(sign.getInt("left") + sign.getInt("width") / 2, sign.getInt("top") + sign.getInt("height") / 2);
    }
}

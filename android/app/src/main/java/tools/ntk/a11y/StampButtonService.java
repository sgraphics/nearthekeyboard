package tools.ntk.a11y;

import android.accessibilityservice.AccessibilityService;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Parcelable;
import android.os.SystemClock;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Log;
import android.view.Gravity;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.widget.Toast;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import rkr.simplekeyboard.inputmethod.BuildConfig;
import tools.ntk.Links;
import tools.ntk.Ntk;

/**
 * Stamp buttons in other apps (TODO.md section 6). An accessibility service in
 * the keyboard's app: when the screen content changes or a scroll comes to
 * rest, it looks through the text on screen for NTK tags and puts a small
 * "NTK ✓" button over each visible one, in an accessibility overlay window.
 * The button sits on the tag's characters where the app tells where they are
 * (EXTRA_DATA_TEXT_CHARACTER_LOCATION_KEY), and at the end of the text block
 * otherwise. Buttons hide while the screen scrolls.
 *
 * A tap reads the text before the tag in the same text block (and the text
 * nodes before it in the same container, when the block is split into
 * several nodes) and opens the verify page in the browser, with the stamp id in
 * the path and that text in the address fragment. Screen text is read on the
 * phone only, to find tags; nothing is stored, logged or sent anywhere until a
 * button is tapped.
 */
public final class StampButtonService extends AccessibilityService {
    private static final String TAG = Ntk.TAG;
    /** Wait this long after content changes before reading the screen (changes come in bursts). */
    private static final long SETTLE_MS = 250;
    /** Buttons come back once the screen has not scrolled for this long. */
    private static final long SCROLL_QUIET_MS = 450;
    /** Upper bound on nodes visited per window and scan. */
    private static final int MAX_NODES = 5000;

    private static volatile StampButtonService sRunning;

    private final Handler mMain = new Handler(Looper.getMainLooper());
    private final List<Shown> mShown = new ArrayList<>();
    private WindowManager mWm;
    private long mLastScroll = -SCROLL_QUIET_MS;
    private long mScanAt = -1;
    private int mMinW, mMinH, mStep;

    /** A tag found on screen: its node, where the tag starts in the node's text, and its box. */
    private static final class Hit {
        AccessibilityNodeInfo node;
        String id;
        int start;
        Rect tag;       // the tag's own characters (exact), or null
        Rect block;     // the node's bounds
        int textLength;
    }

    /** A button on screen. */
    private static final class Shown {
        String id;
        Rect rect;
        boolean exact; // placed on the tag's characters, not at the end of the block
        Hit hit;       // where to read the text from on a tap
        StampButtonView view;
    }

    /** True while the service runs (the system has it switched on and bound). */
    public static boolean isRunning() {
        return sRunning != null;
    }

    /** True when the user has switched the service on in the accessibility settings. */
    public static boolean isEnabled(Context c) {
        final String list = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (list == null) return false;
        final ComponentName me = new ComponentName(c, StampButtonService.class);
        final TextUtils.SimpleStringSplitter split = new TextUtils.SimpleStringSplitter(':');
        split.setString(list);
        for (String s : split) {
            final ComponentName cn = ComponentName.unflattenFromString(s);
            if (me.equals(cn)) return true;
        }
        return false;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        mWm = (WindowManager) getSystemService(WINDOW_SERVICE);
        final StampButtonView probe = new StampButtonView(this);
        final int[] min = probe.minKeySize();
        mMinW = min[0];
        mMinH = min[1];
        mStep = probe.step();
        sRunning = this;
        debug("service connected");
        requestScan(SETTLE_MS);
    }

    @Override
    public boolean onUnbind(Intent intent) {
        stop();
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        stop();
        super.onDestroy();
    }

    private void stop() {
        mMain.removeCallbacks(mScan);
        mScanAt = -1;
        hideAll();
        sRunning = null;
    }

    @Override
    public void onInterrupt() {
        hideAll();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        switch (event.getEventType()) {
            case AccessibilityEvent.TYPE_VIEW_SCROLLED:
                // Hide while the screen moves; come back when it has been still for a moment.
                if (BuildConfig.DEBUG && SystemClock.uptimeMillis() - mLastScroll > SCROLL_QUIET_MS) debug("scrolling");
                mLastScroll = SystemClock.uptimeMillis();
                hideAll();
                requestScan(SCROLL_QUIET_MS);
                break;
            case AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED:
                // Another screen: old buttons would be in the wrong place.
                if (!getPackageName().contentEquals(nonNull(event.getPackageName()))) hideAll();
                requestScan(SETTLE_MS);
                break;
            default:
                requestScan(SETTLE_MS);
                break;
        }
    }

    private static CharSequence nonNull(CharSequence s) {
        return s == null ? "" : s;
    }

    // ---- when to read the screen ---------------------------------------------------------

    private final Runnable mScan = () -> {
        mScanAt = -1;
        final long quietAt = mLastScroll + SCROLL_QUIET_MS;
        if (SystemClock.uptimeMillis() < quietAt) {
            requestScan(quietAt - SystemClock.uptimeMillis());
            return;
        }
        try {
            scan();
        } catch (RuntimeException e) {
            // A window or node went away while it was read: the next event brings a new scan.
            debug("scan failed: " + e.getClass().getSimpleName());
        }
    };

    /**
     * At most one scan per {@link #SETTLE_MS} while content keeps changing, and
     * none until a scroll has been quiet for {@link #SCROLL_QUIET_MS}.
     */
    private void requestScan(long delayMs) {
        final long now = SystemClock.uptimeMillis();
        final long at = Math.max(now + delayMs, mLastScroll + SCROLL_QUIET_MS);
        if (mScanAt >= 0 && mScanAt <= at && mLastScroll + SCROLL_QUIET_MS <= mScanAt) return;
        mMain.removeCallbacks(mScan);
        mScanAt = at;
        mMain.postAtTime(mScan, at);
    }

    // ---- reading the screen ---------------------------------------------------------------

    private void scan() {
        final List<AccessibilityWindowInfo> windows = getWindows();
        final List<Hit> hits = new ArrayList<>();
        final List<Rect> covers = new ArrayList<>();
        final List<Integer> coverLayers = new ArrayList<>();
        final List<Integer> hitLayers = new ArrayList<>();
        for (AccessibilityWindowInfo w : windows) {
            final Rect wb = new Rect();
            w.getBoundsInScreen(wb);
            if (w.getType() == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY) continue; // our buttons, or others'
            covers.add(wb);
            coverLayers.add(w.getLayer());
            if (w.getType() != AccessibilityWindowInfo.TYPE_APPLICATION) continue;
            final AccessibilityNodeInfo root = w.getRoot();
            if (root == null) continue;
            if (getPackageName().contentEquals(nonNull(root.getPackageName()))) continue; // not on NTK's own screens
            final int before = hits.size();
            collect(root, wb, hits);
            for (int i = before; i < hits.size(); i++) hitLayers.add(w.getLayer());
        }

        // One button per tag on screen; where two nodes hold the same tag (a text and its own
        // span), keep the exact box and the longer text.
        final List<Shown> want = new ArrayList<>();
        for (int i = 0; i < hits.size(); i++) {
            final Hit h = hits.get(i);
            final Rect r = buttonRect(h);
            if (r == null) continue;
            if (covered(r, hitLayers.get(i), covers, coverLayers)) continue;
            final boolean exact = h.tag != null;
            Shown dup = null;
            for (Shown s : want) {
                if (s.id.equals(h.id) && Rect.intersects(s.rect, r)) dup = s;
            }
            if (dup != null) {
                // The box: an exact one over an end-of-block guess, and the tighter of two.
                if ((exact && !dup.exact) || (exact == dup.exact && area(r) < area(dup.rect))) {
                    dup.rect = r;
                    dup.exact = exact;
                }
                // The text: from the node that holds more of the block.
                if (h.textLength > dup.hit.textLength) dup.hit = h;
                continue;
            }
            final Shown s = new Shown();
            s.id = h.id;
            s.rect = r;
            s.exact = exact;
            s.hit = h;
            want.add(s);
        }
        // An app may say where the characters are on one read and not on the next: a button
        // already on the tag's characters stays there while its text block is still there.
        for (Shown w : want) {
            if (w.exact) continue;
            for (Shown old : mShown) {
                if (old.exact && old.id.equals(w.id) && w.hit.block.contains(old.rect.centerX(), old.rect.centerY())) {
                    w.rect = new Rect(old.rect);
                    w.exact = true;
                    break;
                }
            }
        }
        update(want);
    }

    private static long area(Rect r) {
        return (long) r.width() * r.height();
    }

    /** Is the button's middle under a window that lies above the tag's window (keyboard, bars, dialogs)? */
    private static boolean covered(Rect r, int layer, List<Rect> covers, List<Integer> layers) {
        final int cx = r.centerX();
        final int cy = r.centerY();
        for (int i = 0; i < covers.size(); i++) {
            if (layers.get(i) > layer && covers.get(i).contains(cx, cy)) return true;
        }
        return false;
    }

    /** Depth-first through one window's nodes, clipped to what scrolling containers show. */
    private void collect(AccessibilityNodeInfo root, Rect windowBounds, List<Hit> out) {
        final ArrayDeque<AccessibilityNodeInfo> nodes = new ArrayDeque<>();
        final ArrayDeque<Rect> clips = new ArrayDeque<>();
        nodes.push(root);
        clips.push(new Rect(windowBounds));
        int visited = 0;
        while (!nodes.isEmpty() && visited++ < MAX_NODES) {
            final AccessibilityNodeInfo n = nodes.pop();
            final Rect clip = clips.pop();
            final Rect b = new Rect();
            n.getBoundsInScreen(b);
            Rect childClip = clip;
            if (n.isScrollable()) {
                childClip = new Rect(clip);
                if (!childClip.intersect(b)) continue; // a scrolled-away container
            }
            if (n.isVisibleToUser() && !n.isEditable() && !n.isPassword()) {
                CharSequence text = n.getText();
                if (text == null) text = n.getContentDescription();
                if (TagText.mayHaveTag(text)) {
                    for (TagText.Tag t : TagText.find(text)) {
                        final Hit h = new Hit();
                        h.node = n;
                        h.id = t.id;
                        h.start = t.start;
                        h.block = new Rect(b);
                        h.textLength = text.length();
                        h.tag = text.length() == t.end - t.start ? new Rect(b) : charBox(n, t);
                        if (h.tag == OFF_SCREEN) continue; // the app says where its characters are: not on screen
                        if (h.tag != null && !insideClip(h.tag, childClip)) continue;
                        if (h.tag == null && !insideClip(b, childClip)) continue;
                        out.add(h);
                    }
                }
            }
            for (int i = n.getChildCount() - 1; i >= 0; i--) {
                final AccessibilityNodeInfo c = n.getChild(i);
                if (c == null) continue;
                nodes.push(c);
                clips.push(childClip);
            }
        }
    }

    /** True when the box's middle is on screen inside the clip. */
    private static boolean insideClip(Rect r, Rect clip) {
        return clip.contains(r.centerX(), r.centerY());
    }

    /** charBox: the app reports where characters are, and the tag's are not on screen. */
    private static final Rect OFF_SCREEN = new Rect();

    /**
     * The tag's characters' box on screen, if the app says where its characters
     * are; {@link #OFF_SCREEN} when it does and none of the tag's characters is
     * visible (a block that is partly scrolled away); null when it does not.
     */
    private static Rect charBox(AccessibilityNodeInfo n, TagText.Tag t) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null;
        final List<String> extras = n.getAvailableExtraData();
        if (extras == null || !extras.contains(AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_KEY)) return null;
        final Bundle args = new Bundle();
        args.putInt(AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_ARG_START_INDEX, t.start);
        args.putInt(AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_ARG_LENGTH, t.end - t.start);
        if (!n.refreshWithExtraData(AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_KEY, args)) return null;
        final Bundle ex = n.getExtras();
        final Parcelable[] boxes = ex == null ? null : ex.getParcelableArray(AccessibilityNodeInfo.EXTRA_DATA_TEXT_CHARACTER_LOCATION_KEY);
        if (boxes == null) return null;
        final List<int[]> chars = new ArrayList<>(boxes.length);
        for (Parcelable p : boxes) {
            if (p instanceof RectF) {
                final RectF f = (RectF) p;
                chars.add(new int[] { Math.round(f.left), Math.round(f.top), Math.round(f.right), Math.round(f.bottom) });
            } else {
                chars.add(null);
            }
        }
        final int[] box = TagText.lineBox(chars);
        return box == null ? OFF_SCREEN : new Rect(box[0], box[1], box[2], box[3]);
    }

    /**
     * The button's window, in screen pixels (the key plus one step of shadow).
     * Over the tag's characters when known: as wide as the tag and a little
     * taller than its line. Otherwise at the end of the text block.
     */
    private Rect buttonRect(Hit h) {
        final int s = mStep;
        if (h.tag != null) {
            final Rect t = h.tag;
            final int w = Math.max(t.width() + 2 * s, mMinW);
            final int hgt = Math.max(t.height() + 2 * s, mMinH);
            final int left = t.left - s;
            final int top = t.centerY() - hgt / 2;
            return new Rect(left, top, left + w + s, top + hgt + s);
        }
        final Rect b = h.block;
        if (b.width() < mMinW / 2 || b.height() <= 0) return null;
        final int right = b.right;
        final int bottom = b.bottom;
        return new Rect(right - mMinW - s, bottom - mMinH - s, right, bottom);
    }

    // ---- the buttons -----------------------------------------------------------------------

    /**
     * Keeps buttons that stay where they are and removes the rest. A new
     * button appears once two reads in a row put it in the same place, so
     * nothing is drawn while a page is still laying out or moving.
     */
    private void update(List<Shown> want) {
        final List<Shown> keep = new ArrayList<>();
        for (Shown old : mShown) {
            Shown same = null;
            for (Shown w : want) {
                if (w.view == null && w.id.equals(old.id) && w.rect.equals(old.rect)) {
                    same = w;
                    break;
                }
            }
            if (same != null) {
                old.hit = same.hit; // the newest node, for reading the text on tap
                same.view = old.view;
                keep.add(old);
            } else {
                remove(old);
            }
        }
        mShown.clear();
        mShown.addAll(keep);
        boolean waiting = false;
        for (Shown w : want) {
            if (w.view != null) continue;
            if (!mLastRead.contains(w.id + "@" + w.rect.flattenToString())) {
                waiting = true; // seen here once: confirm on the next read
                continue;
            }
            if (add(w)) mShown.add(w);
        }
        mLastRead.clear();
        for (Shown w : want) mLastRead.add(w.id + "@" + w.rect.flattenToString());
        if (waiting) requestScan(SETTLE_MS);
        if (BuildConfig.DEBUG) {
            final StringBuilder b = new StringBuilder("buttons:");
            for (Shown s : mShown) {
                b.append(' ').append(s.id).append(s.exact ? "@" : "~").append(s.rect.flattenToString());
            }
            if (waiting) b.append(" (+").append(want.size() - mShown.size()).append(" settling)");
            final String line = b.toString();
            if (!line.equals(mLastLog)) Log.d(TAG, line);
            mLastLog = line;
        }
    }

    /** Where the last read put each button ("id@rect"). */
    private final List<String> mLastRead = new ArrayList<>();
    private String mLastLog = "";

    private boolean add(final Shown s) {
        final StampButtonView v = new StampButtonView(this);
        v.setContentDescription("Verify NTK stamp " + s.id);
        v.setOnClickListener(x -> open(s));
        final WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                s.rect.width(), s.rect.height(),
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.LEFT;
        lp.x = s.rect.left;
        lp.y = s.rect.top;
        lp.setTitle("NTK stamp button");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            lp.setFitInsetsTypes(0);
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        try {
            mWm.addView(v, lp);
            s.view = v;
            return true;
        } catch (RuntimeException e) {
            debug("could not add a button: " + e.getClass().getSimpleName());
            return false;
        }
    }

    private void remove(Shown s) {
        if (s.view == null) return;
        try {
            mWm.removeViewImmediate(s.view);
        } catch (RuntimeException e) {
            // already gone
        }
        s.view = null;
    }

    private void hideAll() {
        mLastRead.clear();
        if (mShown.isEmpty()) return;
        for (Shown s : mShown) remove(s);
        mShown.clear();
        debug("hidden");
        mLastLog = "";
    }

    // ---- a tap -----------------------------------------------------------------------------

    /** Reads the text before the tag now, and opens the verify page with it. */
    private void open(Shown s) {
        final String before = textBefore(s.hit);
        final String url = Links.verifyUrl(Links.siteBase(this), s.id, before);
        if (BuildConfig.DEBUG) {
            Log.d(TAG, String.format(Locale.ROOT, "button %s tapped: %d characters before the tag", s.id, before.length()));
        }
        final Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.addCategory(Intent.CATEGORY_BROWSABLE);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No browser to open the verify page", Toast.LENGTH_SHORT).show();
        }
        hideAll();
    }

    /**
     * The text before the tag in its text block: the node's own text before the
     * tag, after the texts of the nodes before it in the same container (when
     * an app splits one block into several nodes, for example a tag in its own
     * span). Text rule 2.2 then takes the characters the stamp covers.
     */
    static String textBefore(Hit h) {
        final AccessibilityNodeInfo n = h.node;
        try {
            n.refresh();
        } catch (RuntimeException e) {
            // keep what was read
        }
        CharSequence text = n.getText();
        if (text == null) text = n.getContentDescription();
        if (text == null) return "";
        int at = TagText.locate(text, h.id, h.start);
        if (at < 0) at = Math.min(h.start, text.length());
        final Rect b = new Rect();
        n.getBoundsInScreen(b);
        final TagText.Piece own = new TagText.Piece(text.subSequence(0, at).toString(), b.top, b.bottom);

        final List<TagText.Piece> before = new ArrayList<>();
        final AccessibilityNodeInfo parent = n.getParent();
        if (parent != null) {
            boolean found = false;
            for (int i = 0; i < parent.getChildCount(); i++) {
                final AccessibilityNodeInfo c = parent.getChild(i);
                if (c == null) continue;
                if (c.equals(n)) {
                    found = true;
                    break;
                }
                final String t = subtreeText(c);
                if (t.isEmpty()) continue;
                final Rect cb = new Rect();
                c.getBoundsInScreen(cb);
                before.add(new TagText.Piece(t, cb.top, cb.bottom));
            }
            if (!found) before.clear(); // the node moved: use its own text only
        }
        return TagText.prefix(TagText.sameBlock(before, own), own);
    }

    /** The text of a node and its descendants, in order. */
    private static String subtreeText(AccessibilityNodeInfo root) {
        final StringBuilder out = new StringBuilder();
        final ArrayDeque<AccessibilityNodeInfo> stack = new ArrayDeque<>();
        stack.push(root);
        int visited = 0;
        while (!stack.isEmpty() && visited++ < 500) {
            final AccessibilityNodeInfo n = stack.pop();
            final CharSequence t = n.getText();
            if (t != null && t.length() > 0) {
                out.append(t); // a node with text speaks for its children
                continue;
            }
            for (int i = n.getChildCount() - 1; i >= 0; i--) {
                final AccessibilityNodeInfo c = n.getChild(i);
                if (c != null) stack.push(c);
            }
        }
        return out.toString();
    }

    /** Debug builds log states and counts, never screen text. */
    private static void debug(String msg) {
        if (BuildConfig.DEBUG) Log.d(TAG, "buttons: " + msg);
    }
}

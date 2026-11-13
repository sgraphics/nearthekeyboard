package tools.ntk;

import android.content.res.Configuration;
import android.inputmethodservice.InputMethodService;
import android.text.InputType;
import android.util.Log;
import android.util.SparseArray;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import rkr.simplekeyboard.inputmethod.BuildConfig;
import rkr.simplekeyboard.inputmethod.keyboard.Key;
import rkr.simplekeyboard.inputmethod.latin.utils.InputTypeUtils;

/**
 * Records how the user types, one session per text field (TODO.md 3.2, 3.3).
 *
 * The base keyboard calls in at four places: PointerTracker (touch down and up
 * of each key, with the event times), InputLogic (what each key produced, and
 * how the text before the cursor changed), LatinIME (a field starts or ends,
 * the selection moved) and MainKeyboardView (input is held while a call runs).
 * Everything runs on the main thread. Sessions live in memory only.
 */
public final class NtkCapture {
    private static final NtkCapture sInstance = new NtkCapture();

    public static NtkCapture get() {
        return sInstance;
    }

    /** Notified on the main thread when the session or the field changes. */
    public interface Listener {
        void onCaptureChanged();
    }

    /** A touch that went down on a key and has not come up yet. */
    private static final class Pending {
        final long d;
        final float x;
        final float y;
        final List<String> outputs = new ArrayList<>(2);

        Pending(long d, float x, float y) {
            this.d = d;
            this.x = x;
            this.y = y;
        }
    }

    private InputMethodService mIms;
    private final List<Listener> mListeners = new ArrayList<>();

    private TypingSession mSession;
    private String mFieldKey;
    private String mFieldPackage;
    private String mNotRecording;
    private TypingSession.Kind mKind = TypingSession.Kind.STAMP;
    private String mMode;
    private String mLayout = "qwerty-en-portrait-v1";
    private boolean mPortrait = true;

    private final SparseArray<Pending> mPending = new SparseArray<>();
    private int mActivePointer = -1;
    private boolean mPasting;

    // Cursor tracking: where our own edits will leave the cursor, in UTF-16 units.
    private int mConfirmedStart = -1;
    private int mConfirmedEnd = -1;
    private int mModelCursor = -1;
    private final ArrayDeque<Integer> mExpected = new ArrayDeque<>();

    private boolean mHolding;

    private NtkCapture() {}

    public void attach(InputMethodService ims) {
        mIms = ims;
    }

    public InputMethodService service() {
        return mIms;
    }

    public void addListener(Listener l) {
        if (!mListeners.contains(l)) mListeners.add(l);
    }

    public void removeListener(Listener l) {
        mListeners.remove(l);
    }

    private void changed() {
        for (Listener l : new ArrayList<>(mListeners)) l.onCaptureChanged();
    }

    // ---- state for the strip ---------------------------------------------------------

    public TypingSession session() {
        return mSession;
    }

    /** Why nothing is recorded in this field (password, incognito, not text), or null. */
    public String notRecordingReason() {
        return mNotRecording;
    }

    public boolean hasField() {
        return mFieldKey != null;
    }

    public boolean isPortrait() {
        return mPortrait;
    }

    public TypingSession.Kind kind() {
        return mKind;
    }

    public String mode() {
        return mMode;
    }

    public boolean isHolding() {
        return mHolding;
    }

    /** Typing is held while a call runs, so the tag lands right after the text it covers. */
    public void setHolding(boolean holding) {
        mHolding = holding;
        changed();
    }

    // ---- fields ----------------------------------------------------------------------

    /**
     * A field gained input. A new field (package, field id, input type) starts a
     * new session; a restart of the same field keeps it.
     */
    public void onStartInput(EditorInfo ei, boolean restarting, String layoutSet, Locale locale,
            Configuration conf) {
        mPortrait = conf == null || conf.orientation != Configuration.ORIENTATION_LANDSCAPE;
        if (ei == null) {
            reset(null);
            return;
        }
        final String key = ei.packageName + "#" + ei.fieldId + "#" + ei.inputType + "#" + ei.fieldName;
        final String lang = locale == null ? "en" : locale.getLanguage();
        mLayout = (layoutSet == null ? "qwerty" : layoutSet) + "-" + lang + "-"
                + (mPortrait ? "portrait" : "landscape") + "-v1";
        if (restarting && key.equals(mFieldKey) && mSession != null) {
            debug("field restarted, session kept (" + mSession.taps() + " taps)");
            onExternalSelection(ei.initialSelStart, ei.initialSelEnd);
            changed();
            return;
        }
        reset(key);
        mFieldPackage = ei.packageName;
        mConfirmedStart = ei.initialSelStart;
        mConfirmedEnd = ei.initialSelEnd;
        mModelCursor = (ei.initialSelStart >= 0 && ei.initialSelStart == ei.initialSelEnd) ? ei.initialSelStart : -1;

        final int cls = ei.inputType & InputType.TYPE_MASK_CLASS;
        mKind = TypingSession.Kind.STAMP;
        mMode = null;
        if (InputTypeUtils.isPasswordInputType(ei.inputType) || InputTypeUtils.isVisiblePasswordInputType(ei.inputType)) {
            mNotRecording = "Password field: nothing is recorded";
        } else if ((ei.imeOptions & EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING) != 0) {
            mNotRecording = "This app asked for no learning: nothing is recorded";
        } else if (cls != InputType.TYPE_CLASS_TEXT) {
            mNotRecording = "Not a text field: nothing is recorded";
        } else {
            mNotRecording = null;
            final String opts = ei.privateImeOptions;
            final boolean ours = mIms != null && mIms.getPackageName().equals(ei.packageName);
            if (ours && opts != null && opts.contains(Ntk.IME_OPTION_ENROLL)) {
                mKind = TypingSession.Kind.ENROLL;
                mMode = opts.contains(Ntk.IME_OPTION_ENROLL + "copy") ? "copy" : "compose";
            }
            mSession = new TypingSession(mKind, mMode, mLayout);
        }
        debug("field started: " + (mNotRecording != null ? "not recording" : mKind + (mMode != null ? "/" + mMode : "")));
        changed();
    }

    /** The field lost input: its session is dropped. */
    public void onFinishInput() {
        reset(null);
        changed();
    }

    private void reset(String fieldKey) {
        mFieldKey = fieldKey;
        mFieldPackage = null;
        mSession = null;
        mNotRecording = fieldKey == null ? "No text field" : null;
        mPending.clear();
        mActivePointer = -1;
        mExpected.clear();
        mConfirmedStart = mConfirmedEnd = mModelCursor = -1;
    }

    /** Starts a fresh session in the same field (after a tag, or when the field was emptied). */
    public void newSession(String why) {
        if (mFieldKey == null || mNotRecording != null) return;
        mSession = new TypingSession(mKind, mMode, mLayout);
        mPending.clear();
        debug("new session: " + why);
        changed();
    }

    public String fieldPackage() {
        return mFieldPackage;
    }

    // ---- touches (PointerTracker) ---------------------------------------------------

    /**
     * A finger went down on {@code key} at keyboard coordinates (kx, ky), the
     * coordinates keys are laid out and drawn in. The offset is from the key's
     * drawn centre, as a fraction of its width and height.
     */
    public void onTouchDown(int pointerId, Key key, int kx, int ky, long eventTime) {
        if (mSession == null || key == null || mHolding) return;
        final float w = Math.max(1, key.getWidth());
        final float h = Math.max(1, key.getHeight());
        final float x = clamp((kx - key.getX() - w / 2f) / w);
        final float y = clamp((ky - key.getY() - h / 2f) / h);
        mPending.put(pointerId, new Pending(eventTime, x, y));
    }

    private static float clamp(float v) {
        return Math.max(-1f, Math.min(1f, v));
    }

    /** Output produced while this pointer is being handled belongs to its tap. */
    public void beginOutput(int pointerId) {
        mActivePointer = pointerId;
    }

    public void endOutput() {
        mActivePointer = -1;
    }

    /** The finger came up: the tap is complete. Taps that produced nothing are dropped. */
    public void onTouchUp(int pointerId, long eventTime) {
        final Pending p = mPending.get(pointerId);
        if (p == null) return;
        mPending.remove(pointerId);
        if (mSession == null || p.outputs.isEmpty()) return;
        mSession.addTap(TypingSession.Event.tap(p.outputs.get(0), p.d, Math.max(eventTime, p.d), p.x, p.y));
        for (int i = 1; i < p.outputs.size(); i++) mSession.addUntimed(TypingSession.Event.bare(p.outputs.get(i)));
        changed();
    }

    // ---- what keys produce (InputLogic) ---------------------------------------------

    /**
     * A key produced {@code k} (one character, or a control key in angle
     * brackets) and moved the cursor by {@code cursorDelta} UTF-16 units.
     */
    public void onOutput(String k, int cursorDelta) {
        expect(cursorDelta);
        if (mSession == null) return;
        final Pending p = mActivePointer >= 0 ? mPending.get(mActivePointer) : null;
        if (p != null) {
            p.outputs.add(k);
        } else if (!(k.length() > 2 && k.startsWith("<") && k.endsWith(">"))) {
            // Text without a touch we saw: it was not typed.
            mSession.addUntimed(TypingSession.Event.inserted(k));
            changed();
        }
    }

    /** Text the keyboard inserts without key taps (its paste key). */
    public void onInserted(String text, int cursorDelta) {
        expect(cursorDelta);
        if (mSession == null || text == null || text.isEmpty()) return;
        mSession.addUntimed(TypingSession.Event.inserted(text));
        changed();
    }

    public void setPasting(boolean pasting) {
        mPasting = pasting;
    }

    public boolean isPasting() {
        return mPasting;
    }

    /** A backspace with a selection deletes it: the session can no longer follow the text. */
    public void onSelectionDeleted(int newCursor) {
        if (mSession != null) mSession.markChanged("text was selected and deleted");
        mModelCursor = newCursor;
        if (newCursor >= 0) mExpected.add(newCursor);
        changed();
    }

    private void expect(int delta) {
        if (mModelCursor < 0 || delta == 0) return;
        mModelCursor = Math.max(0, mModelCursor + delta);
        mExpected.add(mModelCursor);
        while (mExpected.size() > 256) mExpected.removeFirst();
    }

    // ---- the app's view of the field (LatinIME.onUpdateSelection) ----------------------

    public void onUpdateSelection(int newStart, int newEnd) {
        if (mFieldKey == null) return;
        if (newStart == newEnd && mExpected.contains(newStart)) {
            // One of our own edits arrived (updates may be coalesced or late).
            while (!mExpected.isEmpty()) {
                if (mExpected.removeFirst() == newStart) break;
            }
            mConfirmedStart = mConfirmedEnd = newStart;
            // Backspacing to an empty field keeps the session (its taps are still the user's typing),
            // unless the session can no longer be signed: then clearing the field is the way to start over.
            if (newStart == 0 && mSession != null && mSession.changedReason() != null) checkEmptied();
            return;
        }
        if (newStart == mConfirmedStart && newEnd == mConfirmedEnd) return;
        onExternalSelection(newStart, newEnd);
    }

    /** The cursor or the text changed in a way the keyboard did not cause. */
    private void onExternalSelection(int newStart, int newEnd) {
        final int base = mExpected.isEmpty() ? mModelCursor : mExpected.peekLast();
        mExpected.clear();
        final int oldStart = mConfirmedStart;
        mConfirmedStart = newStart;
        mConfirmedEnd = newEnd;
        mModelCursor = newStart == newEnd ? newStart : -1;
        if (mSession == null) return;
        if (newStart == 0 && newEnd == 0 && checkEmptied()) return;
        if (mSession.isEmpty()) {
            // Nothing typed yet: the session simply starts where the cursor now is.
            return;
        }
        if (newStart == newEnd && base >= 0 && newStart > base) {
            // The cursor moved forward: text arrived before it (a paste from the app's menu,
            // `adb shell input text`, or the cursor passed over existing text).
            final String arrived = textBeforeCursor(newStart - base);
            if (arrived != null && arrived.length() == newStart - base) {
                mSession.addUntimed(TypingSession.Event.inserted(arrived));
                debug("text arrived without taps: " + arrived.length() + " chars");
                changed();
                return;
            }
        }
        if (oldStart != newStart || newStart != newEnd) {
            mSession.markChanged("the cursor moved or the text changed outside the keyboard");
            debug("session marked changed");
            changed();
        }
    }

    /** The field is empty (a sent message): start a new session. */
    private boolean checkEmptied() {
        if (mSession == null || mSession.isEmpty() || mIms == null) return false;
        final InputConnection ic = mIms.getCurrentInputConnection();
        if (ic == null) return false;
        final CharSequence after = ic.getTextAfterCursor(1, 0);
        final CharSequence before = ic.getTextBeforeCursor(1, 0);
        if ((after == null || after.length() == 0) && (before == null || before.length() == 0)) {
            newSession("the field was emptied");
            return true;
        }
        return false;
    }

    public String textBeforeCursor(int n) {
        if (mIms == null || n <= 0) return null;
        final InputConnection ic = mIms.getCurrentInputConnection();
        if (ic == null) return null;
        final CharSequence s = ic.getTextBeforeCursor(n, 0);
        return s == null ? null : s.toString();
    }

    /** True when the field has a selection rather than a cursor. */
    public boolean hasSelection() {
        return mConfirmedStart != mConfirmedEnd;
    }

    /**
     * Inserts " [NTK id]" at the cursor and starts a new session, so a later
     * stamp covers only what is typed after this tag.
     */
    public boolean commitTag(String id) {
        if (mIms == null) return false;
        final InputConnection ic = mIms.getCurrentInputConnection();
        if (ic == null) return false;
        final String text = " " + TextRule.tag(id);
        ic.commitText(text, 1);
        expect(text.length());
        newSession("tag inserted");
        return true;
    }

    /** Debug builds log sizes and states, never what was typed. */
    static void debug(String msg) {
        if (BuildConfig.DEBUG) Log.d(Ntk.TAG, msg);
    }
}

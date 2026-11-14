package tools.ntk.ui;

import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.os.SystemClock;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

import java.util.Locale;

import rkr.simplekeyboard.inputmethod.R;
import tools.ntk.AccountStore;
import tools.ntk.BuildHooks;
import tools.ntk.Ntk;
import tools.ntk.NtkCapture;
import tools.ntk.NtkController;
import tools.ntk.SignFlow;
import tools.ntk.Terms;
import tools.ntk.TypingSession;

/**
 * The strip above the keys (TODO.md 3.6, 3.7), flat and light as in the owner's
 * mock: at the left the small NTK mark, a status light and the account name (or
 * a message) in small thin type; at the right the Sign key, a flat orange tile
 * with a white label and a row of ticks that turn white as the session approaches
 * the taps a stamp needs.
 *
 * While a Sign or Enroll call runs (seconds to minutes), typing is held: the keys
 * lie under a veil, and the middle of the strip is a dial, after an old radio's
 * tuning scale: evenly spaced fine black ticks from 0 to 100% and an orange needle
 * that moves with time toward 90%; when the call ends it swings to 100%, or back
 * to 0 if it failed. The mark is a vector drawable (BadgeView) whose gaps are
 * painted in ntk_display, the strip's colour. The strip's height is fixed, so the
 * keys never move.
 */
public final class StripView extends View implements NtkCapture.Listener, NtkController.Listener {
    public static final int MSG_INFO = 0;
    public static final int MSG_GOOD = 1;
    public static final int MSG_BAD = 2;

    /** The mark's height as a share of the strip's: 15 dp on the 44 dp strip. */
    private static final float BADGE_HEIGHT = 15f / 44f;
    /** A typical enclave call, in seconds: by then the needle is near 90% of the scale. */
    private static final float EXPECTED_S = 60f;
    /** The needle's swing when a call ends, and how long the dial stays before the message shows. */
    private static final long SWING_MS = 700, HOLD_MS = 900;
    /** The dial's scale: evenly spaced ticks from 0 to 100%, a longer one every quarter. */
    private static final int DIAL_STEPS = 40, DIAL_LONG_EVERY = 10;
    /** Ticks on the Sign key that turn white as the session fills. */
    private static final int SIGN_TICKS = 16;

    private final float mDp;
    private final TextPaint mText = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint mKeyText = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final Paint mPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint mLine = new Paint();
    private final Rect mSignRect = new Rect();
    private final Rect mBadgeRect = new Rect();
    private final Drawable mBadge;
    private final Tile mSignTile = new Tile();
    /** Over the keys while typing is held (a call runs): they cannot be used then. */
    private final ColorDrawable mVeil;
    private View mVeiled;

    private final int cDisplay, cInk, cMuted, cMutedLight, cAccent, cAccentPressed, cOnAccent, cKey, cKeyPressed;

    private String mFlash;
    private int mFlashKind;
    private long mFlashUntil;
    private boolean mSignPressed;
    private String mDrawnText = "";
    private String mDrawnLabel = "";

    // The dial: the call it shows (its busySince; 0 for none), and where the needle is.
    private long mDialCall;
    private boolean mDialEnding;
    private float mNeedle, mSwingFrom, mSwingTo = 1f;
    private long mSwingAt;

    public StripView(Context context, AttributeSet attrs) {
        super(context, attrs);
        mDp = getResources().getDisplayMetrics().density;
        cDisplay = context.getColor(R.color.ntk_display);
        cInk = context.getColor(R.color.ntk_legend);
        cMuted = context.getColor(R.color.ntk_muted);
        cMutedLight = context.getColor(R.color.ntk_muted_light);
        cAccent = context.getColor(R.color.ntk_accent);
        cAccentPressed = context.getColor(R.color.ntk_accent_pressed);
        cOnAccent = context.getColor(R.color.ntk_on_accent);
        cKey = context.getColor(R.color.ntk_key);
        cKeyPressed = context.getColor(R.color.ntk_key_pressed);
        mSignTile.set(cAccent, context.getColor(R.color.ntk_key_shadow), mDp, 8f, 2f, 0.75f);
        final float sp = getResources().getDisplayMetrics().scaledDensity;
        final Typeface thin = Typeface.create("sans-serif-thin", Typeface.NORMAL);
        mText.setTextSize(13 * sp);
        mText.setTypeface(thin);
        mKeyText.setTextSize(15 * sp);
        mKeyText.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL)); // white on orange stays legible
        mKeyText.setTextAlign(Paint.Align.CENTER);
        mVeil = new ColorDrawable(context.getColor(R.color.ntk_veil));
        mLine.setStrokeWidth(Math.max(1f, Math.round(0.4f * mDp))); // hairlines, on whole pixels
        mBadge = BadgeView.load(context); // its gaps are painted in ntk_display, the strip's colour
        setBackgroundColor(cDisplay);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        NtkCapture.get().addListener(this);
        NtkController.get(getContext()).addListener(this);
        BuildHooks.onKeyboardViews(getRootView().findViewById(R.id.keyboard_view), this);
        removeCallbacks(mTick);
        post(mTick);
        updateVeil();
    }

    @Override
    protected void onDetachedFromWindow() {
        NtkCapture.get().removeListener(this);
        NtkController.get(getContext()).removeListener(this);
        removeCallbacks(mTick);
        if (mVeiled != null) {
            mVeiled.getOverlay().remove(mVeil);
            mVeiled = null;
        }
        super.onDetachedFromWindow();
    }

    private final Runnable mTick = new Runnable() {
        @Override
        public void run() {
            invalidate();
            updateVeil();
            postDelayed(this, mDialCall != 0 ? 33 : NtkController.get(getContext()).isBusy() ? 250 : 1000);
        }
    };

    @Override
    public void onCaptureChanged() {
        invalidate();
        updateVeil();
    }

    /**
     * While typing is held (a Sign or Enroll call runs), the keys lie under a veil
     * of the floor's colour, so it is clear they cannot be used; the system's
     * navigation area below them stays clear. Drawing only.
     */
    private void updateVeil() {
        final View kv = getRootView().findViewById(R.id.keyboard_view);
        final View want = NtkCapture.get().isHolding() && kv != null && kv.isShown() ? kv : null;
        if (mVeiled != null && mVeiled != want) {
            mVeiled.getOverlay().remove(mVeil);
            mVeiled = null;
        }
        if (want != null) {
            mVeil.setBounds(0, 0, want.getWidth(), want.getHeight() - want.getPaddingBottom());
            if (mVeiled == null) {
                want.getOverlay().add(mVeil);
                mVeiled = want;
            }
        }
    }

    @Override
    public void onControllerChanged() {
        invalidate();
    }

    /** Shows a message in place of the account name for a while; after a call, it also sets where the needle goes. */
    public void flash(String message, int kind) {
        mFlash = message;
        mFlashKind = kind;
        mFlashUntil = SystemClock.uptimeMillis() + (kind == MSG_INFO ? 6000 : 12000);
        if (mDialCall != 0) {
            mSwingTo = kind == MSG_BAD ? 0f : 1f;
            if (mDialEnding) {
                mSwingFrom = mNeedle;
                mSwingAt = SystemClock.uptimeMillis();
            }
        }
        invalidate();
    }

    public Rect signKeyRect() {
        return new Rect(mSignRect);
    }

    /** What the strip shows now (debug hook for the robot typist). */
    public String debugText() {
        return mDrawnText + " | " + mDrawnLabel;
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        final int pad = Math.round(6 * mDp);
        final int keyW = Math.round(88 * mDp);
        final int keyH = h - 2 * pad;
        mSignRect.set(w - pad - keyW, pad, w - pad, pad + keyH);
        final int badgeH = Math.round(h * BADGE_HEIGHT);
        final int badgeW = BadgeView.widthFor(mBadge, badgeH);
        final int left = Math.round(14 * mDp);
        mBadgeRect.set(left, (h - badgeH) / 2, left + badgeW, (h - badgeH) / 2 + badgeH);
        mBadge.setBounds(mBadgeRect);
    }

    /** Where the needle points after {@code seconds} of a call: toward 90% of the scale. */
    private static float dial(float seconds) {
        return 0.9f * (1f - (float) Math.exp(-3f * Math.max(0f, seconds) / EXPECTED_S));
    }

    @Override
    protected void onDraw(Canvas c) {
        super.onDraw(c);
        final Context ctx = getContext();
        final NtkCapture cap = NtkCapture.get();
        final NtkController ctl = NtkController.get(ctx);
        final AccountStore.Account account = AccountStore.get(ctx).current();
        final TypingSession s = cap.session();
        final boolean busy = ctl.isBusy();
        final long now = SystemClock.uptimeMillis();

        mBadge.draw(c);

        // The dial follows Sign and Enroll calls; it stays a moment after one ends.
        final String op = ctl.busyOp();
        if (busy && ("stamp".equals(op) || "enroll".equals(op))) {
            if (mDialCall != ctl.busySince()) {
                mDialCall = ctl.busySince();
                mDialEnding = false;
                mSwingTo = 1f;
            }
            mNeedle = dial((System.currentTimeMillis() - mDialCall) / 1000f);
        } else if (mDialCall != 0) {
            if (!mDialEnding) {
                mDialEnding = true;
                mSwingFrom = mNeedle;
                mSwingAt = now;
            }
            final float k = Math.min(1f, (now - mSwingAt) / (float) SWING_MS);
            final float eased = 1f - (1f - k) * (1f - k) * (1f - k);
            mNeedle = mSwingFrom + (mSwingTo - mSwingFrom) * eased;
            if (now - mSwingAt > SWING_MS + HOLD_MS) mDialCall = 0;
        }

        // Text: a message, the call in progress, why we do not record, or the account.
        String text;
        int color = cInk;
        if (busy) {
            final long sec = (System.currentTimeMillis() - ctl.busySince()) / 1000;
            final String st = ctl.busyStatus();
            text = ("stamp".equals(op) ? "Checking with the enclave" : "enroll".equals(op) ? "Sealing into the enclave"
                    : "account".equals(op) ? "Setting up the account" : "Asking the enclave")
                    + (st.isEmpty() ? "" : " (" + st + ")") + String.format(Locale.ROOT, " %d:%02d", sec / 60, sec % 60);
        } else if (mFlash != null && now < mFlashUntil) {
            text = mFlash;
        } else if (!Terms.accepted(ctx)) {
            text = "Accept the terms first: tap " + (account == null ? "Set up" : "Sign");
            color = cMuted;
        } else if (account == null) {
            text = "Not set up: tap Set up";
            color = cMuted;
        } else if (cap.notRecordingReason() != null) {
            text = cap.notRecordingReason();
            color = cMuted;
        } else if (s != null && s.changedReason() != null && s.kind == TypingSession.Kind.STAMP) {
            text = "Retype to sign: " + s.changedReason();
            color = cMuted;
        } else if (ctl.keyWarning() != null) {
            text = ctl.keyWarning();
        } else {
            text = account.accountId;
        }
        if (mFlash != null && now >= mFlashUntil) mFlash = null;
        mDrawnText = text;

        final float midL = mBadgeRect.right + 14f * mDp;
        final float midR = mSignRect.left - 14f * mDp;
        if (mDialCall != 0) {
            drawDial(c, midL, midR, mNeedle);
        } else {
            // Status light: a small dot, orange while recording, blinking while a call runs.
            boolean lit = s != null && account != null;
            if (busy) lit = (now / 400) % 2 == 0;
            final float dot = 2f * mDp;
            final float dx = midL - 2f * mDp + dot;
            mPaint.setColor(lit ? cAccent : cMutedLight);
            c.drawCircle(dx, getHeight() / 2f, dot, mPaint);
            mText.setColor(color);
            final float tx = dx + dot + 8f * mDp;
            final float avail = midR - tx;
            final CharSequence shown = TextUtils.ellipsize(text, mText, Math.max(0, avail), TextUtils.TruncateAt.END);
            final Paint.FontMetrics fm = mText.getFontMetrics();
            c.drawText(shown, 0, shown.length(), tx, getHeight() / 2f - (fm.ascent + fm.descent) / 2f, mText);
        }

        drawSignKey(c, account, s, busy, cap);
    }

    /** The dial: a hairline with evenly spaced fine ticks from 0 to 100%, and the orange needle. */
    private void drawDial(Canvas c, float l, float r, float needle) {
        if (r - l < 40f * mDp) return;
        final float h = getHeight();
        final float base = h / 2f + 6f * mDp;        // the ticks stand on this line
        final float tall = 10f * mDp, small = 5f * mDp;
        mLine.setColor(cInk);
        c.drawLine(l, px(base), r, px(base), mLine);
        for (int i = 0; i <= DIAL_STEPS; i++) {
            final float x = px(l + (r - l) * i / DIAL_STEPS);
            c.drawLine(x, base - (i % DIAL_LONG_EVERY == 0 ? tall : small), x, base, mLine);
        }
        // The needle, from above the long ticks to below the line.
        final float x = l + (r - l) * Math.max(0f, Math.min(1f, needle));
        mPaint.setColor(cAccent);
        final float half = 0.75f * mDp;
        c.drawRect(x - half, base - tall - 6f * mDp, x + half, base + 5f * mDp, mPaint);
    }

    /** The centre of the pixel at {@code v}: hairlines land on whole pixels. */
    private static float px(float v) {
        return (float) Math.floor(v) + 0.5f;
    }

    private void drawSignKey(Canvas c, AccountStore.Account account, TypingSession s, boolean busy, NtkCapture cap) {
        final Rect r = mSignRect;
        String label;
        float fill = -1f; // no ticks
        boolean enabled = true;
        if (account == null) {
            label = "Set up";
        } else if (busy) {
            final long sec = (System.currentTimeMillis() - NtkController.get(getContext()).busySince()) / 1000;
            label = String.format(Locale.ROOT, "%d:%02d", sec / 60, sec % 60);
        } else if (s == null) {
            label = "Sign";
            enabled = false;
        } else if (s.kind == TypingSession.Kind.ENROLL) {
            label = "Enroll";
            fill = Math.min(1f, s.taps() / (float) Ntk.MIN_ENROLL_TAPS);
        } else {
            label = "Sign";
            fill = Math.min(1f, s.taps() / (float) Ntk.MIN_STAMP_TAPS);
            if (s.changedReason() != null || !cap.isPortrait()) enabled = false;
        }
        mDrawnLabel = label;
        // A flat tile inside the key's bounds: orange with a white label, or the keys' grey
        // with a muted label when Sign cannot be used now. Pressed: no shadow.
        final boolean down = mSignPressed;
        final float fl = r.left + mDp, ft = r.top + 0.5f * mDp, fr = r.right - mDp, fb = r.bottom - 2f * mDp;
        mSignTile.face = enabled ? (down ? cAccentPressed : cAccent) : (down ? cKeyPressed : cKey);
        mSignTile.draw(c, fl, ft, fr, fb, down, 255, null);
        final boolean ticks = enabled && fill >= 0f;
        final Paint.FontMetrics fm = mKeyText.getFontMetrics();
        final float cy = (ft + fb) / 2f - (ticks ? 2.5f * mDp : 0f);
        mKeyText.setColor(enabled ? cOnAccent : cMuted);
        c.drawText(label.toLowerCase(Locale.ROOT), (fl + fr) / 2f, cy - (fm.ascent + fm.descent) / 2f, mKeyText);
        if (ticks) {
            // A row of ticks along the bottom: white up to how far the session has come.
            final float tl = fl + 14f * mDp, tr = fr - 14f * mDp;
            final float tb = fb - 5f * mDp, tt = tb - 3f * mDp;
            final int on = Math.round(fill * SIGN_TICKS);
            for (int i = 0; i < SIGN_TICKS; i++) {
                final float x = px(tl + (tr - tl) * i / (SIGN_TICKS - 1));
                mLine.setColor(cOnAccent);
                mLine.setAlpha(i < on ? 255 : 90);
                c.drawLine(x, tt, x, tb, mLine);
            }
            mLine.setAlpha(255);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        final boolean inSign = mSignRect.contains((int) e.getX(), (int) e.getY());
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                mSignPressed = inSign;
                invalidate();
                return true;
            case MotionEvent.ACTION_UP:
                final boolean wasPressed = mSignPressed;
                mSignPressed = false;
                invalidate();
                if (wasPressed && inSign) {
                    performClick();
                    SignFlow.onSignKey(getContext(), this);
                } else if (!inSign && e.getX() < mSignRect.left) {
                    openSetup(getContext());
                }
                return true;
            case MotionEvent.ACTION_CANCEL:
                mSignPressed = false;
                invalidate();
                return true;
            default:
                return true;
        }
    }

    @Override
    public boolean performClick() {
        return super.performClick();
    }

    public static void openSetup(Context c) {
        final Intent i = new Intent(c, SetupActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        c.startActivity(i);
    }

    @Override
    protected void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        invalidate();
    }
}

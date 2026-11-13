package tools.ntk.ui;

import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
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
import tools.ntk.TypingSession;

/**
 * The strip above the keys (TODO.md 3.6, 3.7): at the left the NTK badge, a
 * status light and the account name (or a message); at the right the Sign key,
 * which fills as the session approaches the taps a stamp needs. Drawn in code
 * on the pixel grid. Its height is fixed, so the keys never move.
 */
public final class StripView extends View implements NtkCapture.Listener, NtkController.Listener {
    public static final int MSG_INFO = 0;
    public static final int MSG_GOOD = 1;
    public static final int MSG_BAD = 2;

    private final int mStep;
    private final float mDp;
    private final TextPaint mText = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint mKeyText = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final Paint mPaint = Pixel.paint(0);
    private final Rect mSignRect = new Rect();
    private final Rect mBadgeRect = new Rect();
    private final Bitmap mBadge;

    private final int cBackground, cText, cMuted, cOrange, cOrangeShade, cKeyFace, cKeyEdge, cKeyShadow, cOnOrange;

    private String mFlash;
    private int mFlashKind;
    private long mFlashUntil;
    private boolean mSignPressed;
    private String mDrawnText = "";
    private String mDrawnLabel = "";

    public StripView(Context context, AttributeSet attrs) {
        super(context, attrs);
        mDp = getResources().getDisplayMetrics().density;
        mStep = Pixel.step(context);
        cBackground = context.getColor(R.color.ntk_background);
        cText = context.getColor(R.color.ntk_legend);
        cMuted = context.getColor(R.color.ntk_muted);
        cOrange = context.getColor(R.color.ntk_orange);
        cOrangeShade = context.getColor(R.color.ntk_orange_shade);
        cKeyFace = context.getColor(R.color.ntk_key_face);
        cKeyEdge = context.getColor(R.color.ntk_key_edge);
        cKeyShadow = context.getColor(R.color.ntk_key_shadow);
        cOnOrange = context.getColor(R.color.ntk_on_orange);
        mText.setTextSize(13 * getResources().getDisplayMetrics().scaledDensity);
        mText.setColor(cText);
        mKeyText.setTextSize(14 * getResources().getDisplayMetrics().scaledDensity);
        mKeyText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        mKeyText.setTextAlign(Paint.Align.CENTER);
        mBadge = loadBadge(context);
        setBackgroundColor(cBackground);
    }

    /** The brand badge if the build has one (res/drawable-nodpi/ntk_badge.png), else null and a drawn placeholder. */
    private static Bitmap loadBadge(Context c) {
        return BadgeView.load(c);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        NtkCapture.get().addListener(this);
        NtkController.get(getContext()).addListener(this);
        BuildHooks.onKeyboardViews(getRootView().findViewById(R.id.keyboard_view), this);
        removeCallbacks(mTick);
        post(mTick);
    }

    @Override
    protected void onDetachedFromWindow() {
        NtkCapture.get().removeListener(this);
        NtkController.get(getContext()).removeListener(this);
        removeCallbacks(mTick);
        super.onDetachedFromWindow();
    }

    private final Runnable mTick = new Runnable() {
        @Override
        public void run() {
            invalidate();
            postDelayed(this, NtkController.get(getContext()).isBusy() ? 250 : 1000);
        }
    };

    @Override
    public void onCaptureChanged() {
        invalidate();
    }

    @Override
    public void onControllerChanged() {
        invalidate();
    }

    /** Shows a message in place of the account name for a while. */
    public void flash(String message, int kind) {
        mFlash = message;
        mFlashKind = kind;
        mFlashUntil = SystemClock.uptimeMillis() + (kind == MSG_INFO ? 6000 : 12000);
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
        final int rows = BadgeView.rows(mBadge);
        final int badgeH = rows * Math.max(1, Math.round(13 * mDp / rows));
        final int badgeW = mBadge != null ? Math.round(badgeH * (float) mBadge.getWidth() / mBadge.getHeight())
                : Math.round(58 * mDp);
        final int left = Math.round(10 * mDp);
        mBadgeRect.set(left, (h - badgeH) / 2, left + badgeW, (h - badgeH) / 2 + badgeH);
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

        drawBadge(c);

        // Status light: muted when nothing is recorded, legend colour while recording, blinking while a call runs.
        int light = cMuted;
        if (s != null && account != null) light = cText;
        if (busy && (now / 400) % 2 == 0) light = cMuted;
        final int ls = Math.round(8 * mDp);
        final int lx = mBadgeRect.right + Math.round(10 * mDp);
        final int ly = (getHeight() - ls) / 2;
        mPaint.setColor(light);
        Pixel.stepped(c, lx, ly, lx + ls, ly + ls, Math.max(1, mStep / 2 + 1), 1, mPaint);

        // Text: a message, the call in progress, why we do not record, or the account.
        String text;
        int color = cText;
        if (busy) {
            final long sec = (System.currentTimeMillis() - ctl.busySince()) / 1000;
            final String op = ctl.busyOp();
            final String st = ctl.busyStatus();
            text = ("stamp".equals(op) ? "Checking with the enclave" : "enroll".equals(op) ? "Sealing into the enclave"
                    : "account".equals(op) ? "Setting up the account" : "Asking the enclave")
                    + (st.isEmpty() ? "" : " (" + st + ")") + String.format(Locale.ROOT, " %d:%02d", sec / 60, sec % 60);
        } else if (mFlash != null && now < mFlashUntil) {
            text = mFlash;
            color = mFlashKind == MSG_BAD ? cText : cText;
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
        mText.setColor(color);
        final float tx = lx + ls + Math.round(8 * mDp);
        final float avail = mSignRect.left - tx - Math.round(8 * mDp);
        final CharSequence shown = TextUtils.ellipsize(text, mText, Math.max(0, avail), TextUtils.TruncateAt.END);
        mDrawnText = text;
        final Paint.FontMetrics fm = mText.getFontMetrics();
        c.drawText(shown, 0, shown.length(), tx, getHeight() / 2f - (fm.ascent + fm.descent) / 2f, mText);

        drawSignKey(c, account, s, busy, cap);
    }

    private void drawBadge(Canvas c) {
        BadgeView.draw(c, mBadgeRect, mBadge, mPaint, cText, cOrange);
    }

    private void drawSignKey(Canvas c, AccountStore.Account account, TypingSession s, boolean busy, NtkCapture cap) {
        final Rect r = mSignRect;
        final int st = mStep;
        String label;
        float fill = 0f;
        boolean enabled = true;
        if (account == null) {
            label = "Set up";
        } else if (busy) {
            final long sec = (System.currentTimeMillis() - NtkController.get(getContext()).busySince()) / 1000;
            label = String.format(Locale.ROOT, "%d:%02d", sec / 60, sec % 60);
            fill = 1f;
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
        // A key whose stepped edge is orange-shade; its face fills with orange from the left
        // as the session approaches the taps a stamp needs (palette: black legend on orange).
        mPaint.setColor(enabled ? cOrangeShade : cKeyShadow);
        Pixel.stepped(c, r.left, r.top, r.right, r.bottom, st, 2, mPaint);
        if (!enabled) {
            mPaint.setColor(cKeyEdge);
            Pixel.stepped(c, r.left, r.top, r.right, r.bottom - st, st, 2, mPaint);
        }
        final int fl = r.left + st, ft = r.top + st, fr = r.right - st, fb = r.bottom - 2 * st;
        mPaint.setColor(mSignPressed ? cKeyEdge : cKeyFace);
        Pixel.stepped(c, fl, ft, fr, fb, st, 1, mPaint);
        final int split = enabled ? fl + Math.round((fr - fl) * Math.max(0f, Math.min(1f, fill))) : fl;
        if (split > fl) {
            mPaint.setColor(mSignPressed ? cOrangeShade : cOrange);
            c.save();
            c.clipRect(r.left, r.top, split, r.bottom);
            Pixel.stepped(c, fl, ft, fr, fb, st, 1, mPaint);
            c.restore();
        }
        // The label: black over the orange part, the legend colour over the rest.
        final Paint.FontMetrics fm = mKeyText.getFontMetrics();
        final float ty = (ft + fb) / 2f - (fm.ascent + fm.descent) / 2f;
        c.save();
        c.clipRect(split, r.top, r.right, r.bottom);
        mKeyText.setColor(enabled ? cText : cMuted);
        c.drawText(label, r.exactCenterX(), ty, mKeyText);
        c.restore();
        if (split > fl) {
            c.save();
            c.clipRect(r.left, r.top, split, r.bottom);
            mKeyText.setColor(cOnOrange);
            c.drawText(label, r.exactCenterX(), ty, mKeyText);
            c.restore();
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

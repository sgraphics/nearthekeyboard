package tools.ntk.ui;

import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.os.Build;
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
 * The strip above the keys (TODO.md 3.6, 3.7), a dark display like the car's
 * screen: at the left the NTK mark, a status light and the account name (or a
 * message) in thin light type; at the right the Sign key, a graphite tile that
 * fills with metallic gold as the session approaches the taps a stamp needs. The
 * light and the key are drawn in code (the key is a {@link Tile}), the mark is a
 * vector drawable (BadgeView) whose gaps are painted in ntk_display, the strip's
 * colour. Its height is fixed, so the keys never move.
 */
public final class StripView extends View implements NtkCapture.Listener, NtkController.Listener {
    public static final int MSG_INFO = 0;
    public static final int MSG_GOOD = 1;
    public static final int MSG_BAD = 2;

    private final float mDp;
    private final TextPaint mText = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint mKeyText = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final Paint mPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint mGlow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Rect mSignRect = new Rect();
    private final Rect mBadgeRect = new Rect();
    private final Drawable mBadge;
    /** The Sign key: graphite where it has not filled, gold where it has. */
    private final Tile mGraphite = new Tile(), mGold = new Tile();

    /** The mark's height as a share of the strip's: 24 dp on the 44 dp strip. */
    private static final float BADGE_HEIGHT = 24f / 44f;

    private final int cDisplay, cEdge, cText, cMuted, cDot, cOrange, cOnGold, cOnGraphite, cOnGraphiteMuted;

    private String mFlash;
    private int mFlashKind;
    private long mFlashUntil;
    private boolean mSignPressed;
    private String mDrawnText = "";
    private String mDrawnLabel = "";

    public StripView(Context context, AttributeSet attrs) {
        super(context, attrs);
        mDp = getResources().getDisplayMetrics().density;
        cDisplay = context.getColor(R.color.ntk_display);
        cEdge = context.getColor(R.color.ntk_display_edge);
        cText = context.getColor(R.color.ntk_display_text);
        cMuted = context.getColor(R.color.ntk_display_muted);
        cDot = context.getColor(R.color.ntk_display_dot);
        cOrange = context.getColor(R.color.ntk_orange);
        cOnGold = context.getColor(R.color.ntk_on_gold);
        cOnGraphite = context.getColor(R.color.ntk_on_graphite);
        cOnGraphiteMuted = context.getColor(R.color.ntk_on_graphite_muted);
        final int shadow = context.getColor(R.color.ntk_display_shadow);
        mGraphite.sizes(mDp, 6f, 1.5f, 2.5f, 0.6f).colours(context.getColor(R.color.ntk_graphite),
                context.getColor(R.color.ntk_graphite_bottom), context.getColor(R.color.ntk_graphite_lip),
                context.getColor(R.color.ntk_graphite_highlight), shadow);
        mGold.sizes(mDp, 6f, 1.5f, 2.5f, 0.6f).colours(context.getColor(R.color.ntk_gold),
                context.getColor(R.color.ntk_gold_bottom), context.getColor(R.color.ntk_gold_lip),
                context.getColor(R.color.ntk_gold_highlight), shadow);
        final float sp = getResources().getDisplayMetrics().scaledDensity;
        mText.setTextSize(13 * sp);
        mText.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        mText.setLetterSpacing(0.02f);
        mText.setColor(cText);
        mKeyText.setTextSize(13.5f * sp);
        mKeyText.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        mKeyText.setLetterSpacing(0.04f);
        mKeyText.setTextAlign(Paint.Align.CENTER);
        mGlow.setColor(cOrange);
        mGlow.setAlpha(110);
        mGlow.setMaskFilter(new BlurMaskFilter(4f * mDp, BlurMaskFilter.Blur.NORMAL)); // the light's glow
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
        final int badgeH = Math.round(h * BADGE_HEIGHT);
        final int badgeW = BadgeView.widthFor(mBadge, badgeH);
        final int left = Math.round(12 * mDp);
        mBadgeRect.set(left, (h - badgeH) / 2, left + badgeW, (h - badgeH) / 2 + badgeH);
        mBadge.setBounds(mBadgeRect);
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

        // The display's top edge: a hairline of light, as on glass.
        mPaint.setColor(cEdge);
        c.drawRect(0, 0, getWidth(), Math.max(1f, Math.round(mDp * 0.6f)), mPaint);

        mBadge.draw(c);

        // Status light: a small dot, dim when nothing is recorded, orange while recording,
        // blinking while a call runs.
        boolean lit = s != null && account != null;
        if (busy) lit = (now / 400) % 2 == 0;
        final float dot = 3f * mDp;
        final float dx = mBadgeRect.right + 12f * mDp + dot;
        final float dy = getHeight() / 2f;
        if (lit && (!c.isHardwareAccelerated() || Build.VERSION.SDK_INT >= 28)) c.drawCircle(dx, dy, dot, mGlow);
        mPaint.setColor(lit ? cOrange : cDot);
        c.drawCircle(dx, dy, dot, mPaint);

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
            color = cText;
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
        final float tx = dx + dot + Math.round(9 * mDp);
        final float avail = mSignRect.left - tx - Math.round(10 * mDp);
        final CharSequence shown = TextUtils.ellipsize(text, mText, Math.max(0, avail), TextUtils.TruncateAt.END);
        mDrawnText = text;
        final Paint.FontMetrics fm = mText.getFontMetrics();
        c.drawText(shown, 0, shown.length(), tx, getHeight() / 2f - (fm.ascent + fm.descent) / 2f, mText);

        drawSignKey(c, account, s, busy, cap);
    }

    private void drawSignKey(Canvas c, AccountStore.Account account, TypingSession s, boolean busy, NtkCapture cap) {
        final Rect r = mSignRect;
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
        // A tile inside the key's bounds, room below for its lip and shadow: graphite
        // that turns into gold (dark legend) from the left as the session approaches the
        // taps a stamp needs. Disabled: graphite, muted legend. Pressed: pushed in.
        final boolean down = mSignPressed;
        final float fl = r.left + mDp, ft = r.top, fr = r.right - mDp, fb = r.bottom - 3.5f * mDp; // the face, up
        final float shift = down ? mGold.lipHeight : 0f;
        final float f = enabled ? Math.max(0f, Math.min(1f, fill)) : 0f;
        final float split = f >= 1f ? r.right : fl + (fr - fl) * f;
        c.save();
        c.clipRect(r);
        if (split < r.right) mGraphite.draw(c, fl, ft, fr, fb, down, 255, null);
        if (split > fl) {
            c.save();
            c.clipRect(r.left, r.top, split, r.bottom);
            mGold.draw(c, fl, ft, fr, fb, down, 255, null);
            c.restore();
        }
        // The label on the face: dark over the gold part, light over the rest.
        final Paint.FontMetrics fm = mKeyText.getFontMetrics();
        final float tx = (fl + fr) / 2f;
        final float ty = (ft + fb) / 2f + shift - (fm.ascent + fm.descent) / 2f;
        if (split < r.right) {
            c.save();
            c.clipRect(split, r.top, r.right, r.bottom);
            mKeyText.setColor(enabled ? cOnGraphite : cOnGraphiteMuted);
            c.drawText(label, tx, ty, mKeyText);
            c.restore();
        }
        if (split > fl) {
            c.save();
            c.clipRect(r.left, r.top, split, r.bottom);
            mKeyText.setColor(cOnGold);
            c.drawText(label, tx, ty, mKeyText);
            c.restore();
        }
        c.restore();
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

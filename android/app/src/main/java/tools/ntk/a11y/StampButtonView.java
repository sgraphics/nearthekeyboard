package tools.ntk.a11y;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.text.TextPaint;
import android.view.MotionEvent;
import android.view.View;

import tools.ntk.ui.Tile;

/**
 * The button drawn over a stamp tag in another app, in the NTK look: a flat
 * orange tile (tools.ntk.ui.Tile) with rounded corners and a barely visible
 * shadow, "NTK" and a check mark in white, in a medium weight. Pressed, it darkens
 * and loses its shadow. The look does not follow dark mode: it sits on other apps' screens and
 * must read as NTK's on any background.
 */
final class StampButtonView extends View {
    static final int ORANGE = 0xFFFD5B15;
    static final int ORANGE_PRESSED = 0xFFE24E0F;
    static final int INK = 0xFFFFFFFF; // white on orange

    private final int mStep;
    private final float mDp;
    private final Tile mTile = new Tile();
    private final Paint mCheck = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path mCheckPath = new Path();
    private final TextPaint mText = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final String mLabel = "NTK";
    private boolean mDown;

    StampButtonView(Context c) {
        super(c);
        mDp = c.getResources().getDisplayMetrics().density;
        mStep = Math.max(1, Math.round(1.5f * mDp));
        mTile.set(ORANGE, 0x2E1E2A3D, mDp, 5f, 1.5f, 0.75f);
        mText.setColor(INK);
        mText.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        mText.setLetterSpacing(0.06f);
        mText.setTextSize(13 * c.getResources().getDisplayMetrics().scaledDensity);
        mCheck.setColor(INK);
        mCheck.setStyle(Paint.Style.STROKE);
        mCheck.setStrokeWidth(1.6f * mDp);
        mCheck.setStrokeCap(Paint.Cap.ROUND);
        mCheck.setStrokeJoin(Paint.Join.ROUND);
        setClickable(true);
        setFocusable(false);
    }

    /** Room in pixels: the window is one step wider and taller than the key, for its shadow. */
    int step() {
        return mStep;
    }

    /** Width and height of the smallest key that fits the label, without the shadow. */
    int[] minKeySize() {
        final int pad = 3 * mStep;
        final int w = (int) Math.ceil(mText.measureText(mLabel)) + mStep * 2 + checkWidth() + 2 * pad;
        final Paint.FontMetricsInt fm = mText.getFontMetricsInt();
        final int h = Math.max(fm.descent - fm.ascent, checkHeight()) + 2 * mStep + 2 * mStep;
        return new int[] { w, h };
    }

    private int checkWidth() {
        return Math.round(8.5f * mDp);
    }

    private int checkHeight() {
        return Math.round(6.5f * mDp);
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                mDown = true;
                invalidate();
                break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                mDown = false;
                invalidate();
                break;
            default:
                break;
        }
        return super.onTouchEvent(e);
    }

    @Override
    protected void onDraw(Canvas c) {
        final int s = mStep;
        final int w = getWidth() - s;
        final int h = getHeight() - s;
        if (w <= 4 * s || h <= 4 * s) return;
        // The face fills the key; the step of room on the right and at the bottom holds the shadow.
        mTile.face = mDown ? ORANGE_PRESSED : ORANGE;
        mTile.draw(c, 0, 0, w, h, mDown, 255, null);

        // "NTK" and the check mark, centred together on the face.
        final float textW = mText.measureText(mLabel);
        final int gap = 2 * s;
        final int checkW = checkWidth();
        final int checkH = checkHeight();
        final float total = textW + gap + checkW;
        final float x0 = (w - total) / 2f;
        final Paint.FontMetrics fm = mText.getFontMetrics();
        c.drawText(mLabel, x0, h / 2f - (fm.ascent + fm.descent) / 2f, mText);
        final float cx = x0 + textW + gap;
        final float cy = (h - checkH) / 2f;
        mCheckPath.rewind();
        mCheckPath.moveTo(cx, cy + checkH * 0.55f);
        mCheckPath.lineTo(cx + checkW * 0.36f, cy + checkH);
        mCheckPath.lineTo(cx + checkW, cy);
        c.drawPath(mCheckPath, mCheck);
    }
}

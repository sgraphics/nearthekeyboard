package tools.ntk.a11y;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.text.TextPaint;
import android.view.MotionEvent;
import android.view.View;

import tools.ntk.ui.Pixel;

/**
 * The button drawn over a stamp tag in another app: an orange block (the top
 * face, a lit face along its bottom and a shaded face along its right, one grid
 * step deep) with "NTK" and a pixel check mark in near-black. Pressing it moves
 * the top face onto its side faces, like the web embed's button. The look does
 * not follow dark mode: it sits on other apps' screens and must read as the NTK
 * mark on any background.
 */
final class StampButtonView extends View {
    static final int ORANGE = 0xFFFF4F00;
    static final int ORANGE_LIT = 0xFFE04600;
    static final int ORANGE_SHADE = 0xFFC23D00;
    static final int INK = 0xFF111418;

    /** The check mark on a 7 x 6 grid. */
    private static final String[] CHECK = {
        "......#",
        ".....##",
        "#...##.",
        "##.##..",
        ".###...",
        "..#....",
    };

    private final int mStep;
    private final Paint mPaint = Pixel.paint(0);
    private final Paint mFaces = Pixel.paint(0xFF000000); // opaque: Pixel.sides applies its alpha
    private final TextPaint mText = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final String mLabel = "NTK";
    private boolean mDown;

    StampButtonView(Context c) {
        super(c);
        mStep = Pixel.step(c);
        mText.setColor(INK);
        mText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        mText.setTextSize(13 * c.getResources().getDisplayMetrics().scaledDensity);
        setClickable(true);
        setFocusable(false);
    }

    /** The grid step in pixels; the window is one step wider and taller than the key, for its side faces. */
    int step() {
        return mStep;
    }

    /** Width and height of the smallest key that fits the label, without the shadow. */
    int[] minKeySize() {
        final int pad = 3 * mStep;
        final int w = (int) Math.ceil(mText.measureText(mLabel)) + mStep * 2 + CHECK[0].length() * checkPx() + 2 * pad;
        final Paint.FontMetricsInt fm = mText.getFontMetricsInt();
        final int h = Math.max(fm.descent - fm.ascent, CHECK.length * checkPx()) + 2 * mStep + 2 * mStep;
        return new int[] { w, h };
    }

    private int checkPx() {
        return Math.max(1, Math.round(mStep * 0.75f));
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
        final int o = mDown ? s : 0; // pressed: the top face sits on its side faces
        if (!mDown) Pixel.sides(c, 0, 0, w, h, s, ORANGE_LIT, ORANGE_SHADE, mFaces);
        mPaint.setColor(ORANGE);
        c.drawRect(o, o, w + o, h + o, mPaint);

        // "NTK" and the check mark, centred together.
        final int cp = checkPx();
        final float textW = mText.measureText(mLabel);
        final int gap = 2 * s;
        final int checkW = CHECK[0].length() * cp;
        final int checkH = CHECK.length * cp;
        final float total = textW + gap + checkW;
        final float x0 = o + (w - total) / 2f;
        final Paint.FontMetrics fm = mText.getFontMetrics();
        final float baseline = o + h / 2f - (fm.ascent + fm.descent) / 2f;
        c.drawText(mLabel, x0, baseline, mText);
        mPaint.setColor(INK);
        final int cx = Math.round(x0 + textW + gap);
        final int cy = Math.round(o + (h - checkH) / 2f);
        for (int row = 0; row < CHECK.length; row++) {
            for (int col = 0; col < CHECK[row].length(); col++) {
                if (CHECK[row].charAt(col) == '#') {
                    c.drawRect(cx + col * cp, cy + row * cp, cx + (col + 1) * cp, cy + (row + 1) * cp, mPaint);
                }
            }
        }
    }
}

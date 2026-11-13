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
 * The button drawn over a stamp tag in another app, in the NTK look: a white
 * tile with rounded corners, a thin front edge and a soft shadow (tools.ntk.ui.
 * Tile), with "NTK" in near-black and a thin check mark in the orange of the NTK
 * mark. Pressing it pushes the tile in. The look does not follow dark mode: it
 * sits on other apps' screens and must read as NTK's on any background.
 */
final class StampButtonView extends View {
    static final int ORANGE = 0xFFFF4F00;
    static final int INK = 0xFF111318;

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
        mTile.sizes(mDp, 5f, 1f, 2f, 0f).colours(0xFFFFFFFF, 0xFFF3F4F6, 0xFFD3D7DD, 0, 0x66000000);
        mText.setColor(INK);
        mText.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        mText.setLetterSpacing(0.06f);
        mText.setTextSize(13 * c.getResources().getDisplayMetrics().scaledDensity);
        mCheck.setColor(ORANGE);
        mCheck.setStyle(Paint.Style.STROKE);
        mCheck.setStrokeWidth(1.7f * mDp);
        mCheck.setStrokeCap(Paint.Cap.ROUND);
        mCheck.setStrokeJoin(Paint.Join.ROUND);
        setClickable(true);
        setFocusable(false);
    }

    /** Room in pixels: the window is one step wider and taller than the key, for its lip and shadow. */
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
        // The face fills the key less its lip; the lip and the shadow use the step of room.
        final float faceB = h - mTile.lipHeight;
        mTile.draw(c, 0, 0, w, faceB, mDown, 255, null);
        final float o = mDown ? mTile.lipHeight : 0f; // pressed: the face sits on its lip

        // "NTK" and the check mark, centred together on the face.
        final float textW = mText.measureText(mLabel);
        final int gap = 2 * s;
        final int checkW = checkWidth();
        final int checkH = checkHeight();
        final float total = textW + gap + checkW;
        final float x0 = (w - total) / 2f;
        final float cyFace = o + faceB / 2f;
        final Paint.FontMetrics fm = mText.getFontMetrics();
        c.drawText(mLabel, x0, cyFace - (fm.ascent + fm.descent) / 2f, mText);
        final float cx = x0 + textW + gap;
        final float cy = cyFace - checkH / 2f;
        mCheckPath.rewind();
        mCheckPath.moveTo(cx, cy + checkH * 0.55f);
        mCheckPath.lineTo(cx + checkW * 0.36f, cy + checkH);
        mCheckPath.lineTo(cx + checkW, cy);
        c.drawPath(mCheckPath, mCheck);
    }
}

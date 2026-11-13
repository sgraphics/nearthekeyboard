package tools.ntk.ui;

import android.content.res.Resources;
import android.content.res.TypedArray;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.util.AttributeSet;

import org.xmlpull.v1.XmlPullParser;
import org.xmlpull.v1.XmlPullParserException;

import java.io.IOException;

import rkr.simplekeyboard.inputmethod.R;

/**
 * A key cap in the NTK look: a flat face, a soft stepped edge one grid pixel
 * wide, and a one-pixel hard shadow at the bottom; corners cut in two steps.
 * Drawn in code on whole device pixels, so edges are sharp on every density.
 * Inflated from XML (res/drawable/ntk_key_*.xml) with
 * {@code <drawable class="tools.ntk.ui.PixelKeyDrawable" app:ntkFace=… />}.
 * It changes how a key is drawn, never where it is or how big.
 */
public final class PixelKeyDrawable extends Drawable {
    private int mFace = 0xFFFFFFFF;
    private int mEdge = 0xFFD7D7D2;
    private int mShadow = 0xFFB4B4AE;
    private float mStepDp = 1.5f;
    private float mInsetDp = 0f;
    private final Rect mPadding = new Rect();
    private final Paint mPaint = Pixel.paint(0);
    private int mAlpha = 255;

    public PixelKeyDrawable() {
    }

    public PixelKeyDrawable(int face, int edge, int shadow) {
        mFace = face;
        mEdge = edge;
        mShadow = shadow;
    }

    @Override
    public void inflate(Resources r, XmlPullParser parser, AttributeSet attrs, Resources.Theme theme)
            throws XmlPullParserException, IOException {
        super.inflate(r, parser, attrs, theme);
        final TypedArray a = theme != null
                ? theme.obtainStyledAttributes(attrs, R.styleable.NtkPixelKey, 0, 0)
                : r.obtainAttributes(attrs, R.styleable.NtkPixelKey);
        try {
            mFace = a.getColor(R.styleable.NtkPixelKey_ntkFace, mFace);
            mEdge = a.getColor(R.styleable.NtkPixelKey_ntkEdge, mEdge);
            mShadow = a.getColor(R.styleable.NtkPixelKey_ntkShadow, mShadow);
            final float density = r.getDisplayMetrics().density;
            mStepDp = a.getDimension(R.styleable.NtkPixelKey_ntkStep, mStepDp * density) / density;
            mInsetDp = a.getDimension(R.styleable.NtkPixelKey_ntkInset, 0f) / density;
            mPadding.set(
                    a.getDimensionPixelSize(R.styleable.NtkPixelKey_ntkPaddingLeft, 0),
                    a.getDimensionPixelSize(R.styleable.NtkPixelKey_ntkPaddingTop, 0),
                    a.getDimensionPixelSize(R.styleable.NtkPixelKey_ntkPaddingRight, 0),
                    a.getDimensionPixelSize(R.styleable.NtkPixelKey_ntkPaddingBottom, 0));
        } finally {
            a.recycle();
        }
    }

    private int stepPx() {
        return Math.max(1, Math.round(mStepDp * Resources.getSystem().getDisplayMetrics().density));
    }

    @Override
    public void draw(Canvas c) {
        final Rect b = getBounds();
        final int s = stepPx();
        final int in = Math.round(mInsetDp * Resources.getSystem().getDisplayMetrics().density);
        final int l = b.left + in;
        final int t = b.top + in;
        final int r = b.right - in;
        final int bo = b.bottom - in;
        if (r - l < 4 * s || bo - t < 4 * s) return;
        // Shadow: the whole shape; the edge covers all but its bottom row.
        mPaint.setColor(withAlpha(mShadow));
        Pixel.stepped(c, l, t, r, bo, s, 2, mPaint);
        mPaint.setColor(withAlpha(mEdge));
        Pixel.stepped(c, l, t, r, bo - s, s, 2, mPaint);
        mPaint.setColor(withAlpha(mFace));
        Pixel.stepped(c, l + s, t + s, r - s, bo - 2 * s, s, 1, mPaint);
    }

    private int withAlpha(int color) {
        final int a = ((color >>> 24) * mAlpha) / 255;
        return (color & 0x00FFFFFF) | (a << 24);
    }

    @Override
    public boolean getPadding(Rect padding) {
        padding.set(mPadding);
        return mPadding.left != 0 || mPadding.top != 0 || mPadding.right != 0 || mPadding.bottom != 0;
    }

    @Override
    public void setAlpha(int alpha) {
        mAlpha = alpha;
        invalidateSelf();
    }

    @Override
    public int getAlpha() {
        return mAlpha;
    }

    @Override
    public void setColorFilter(ColorFilter colorFilter) {
        mPaint.setColorFilter(colorFilter);
    }

    @Override
    public int getOpacity() {
        return PixelFormat.TRANSLUCENT;
    }
}

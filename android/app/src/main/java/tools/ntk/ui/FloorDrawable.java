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
 * The floor under the keys: one flat colour, and under the keys, where the
 * system draws its navigation buttons, a base in two muted bands (as in the
 * owner's mock). The keyboard view says how tall that area is
 * ({@link #setBase}, its bottom padding). Inflated from XML
 * (res/drawable/ntk_keyboard_floor.xml) with
 * {@code <drawable class="tools.ntk.ui.FloorDrawable" app:ntkFace=… app:ntkBase=… app:ntkBaseLow=… />}.
 */
public final class FloorDrawable extends Drawable {
    private int mFloor = 0xFFE6EAF2;
    private int mBase = 0xFFBDC3D3, mBaseLow = 0xFF8E98B1;
    private float mBandPx;
    private int mBasePx;
    private final Paint mPaint = new Paint();
    private int mAlpha = 255;

    @Override
    public void inflate(Resources r, XmlPullParser parser, AttributeSet attrs, Resources.Theme theme)
            throws XmlPullParserException, IOException {
        super.inflate(r, parser, attrs, theme);
        final TypedArray a = theme != null
                ? theme.obtainStyledAttributes(attrs, R.styleable.NtkTile, 0, 0)
                : r.obtainAttributes(attrs, R.styleable.NtkTile);
        try {
            mFloor = a.getColor(R.styleable.NtkTile_ntkFace, mFloor);
            mBase = a.getColor(R.styleable.NtkTile_ntkBase, mBase);
            mBaseLow = a.getColor(R.styleable.NtkTile_ntkBaseLow, mBaseLow);
            mBandPx = a.getDimension(R.styleable.NtkTile_ntkBaseBand, 10f * r.getDisplayMetrics().density);
        } finally {
            a.recycle();
        }
    }

    /** The keyboard view's background, if it is a floor: its base is the bottom {@code px} pixels. */
    public static void setBase(Drawable d, int px) {
        if (d instanceof FloorDrawable && ((FloorDrawable) d).mBasePx != px) {
            ((FloorDrawable) d).mBasePx = Math.max(0, px);
            d.invalidateSelf();
        }
    }

    @Override
    public void draw(Canvas c) {
        final Rect b = getBounds();
        final int baseTop = b.bottom - mBasePx;
        fill(c, b.left, b.top, b.right, baseTop, mFloor);
        if (mBasePx <= 0) return;
        final int band = Math.min(mBasePx, Math.round(mBandPx));
        fill(c, b.left, baseTop, b.right, baseTop + band, mBase);
        fill(c, b.left, baseTop + band, b.right, b.bottom, mBaseLow);
    }

    private void fill(Canvas c, int l, int t, int r, int b, int colour) {
        if (b <= t) return;
        mPaint.setColor(colour);
        mPaint.setAlpha((colour >>> 24) * mAlpha / 255);
        c.drawRect(l, t, r, b, mPaint);
    }

    @Override
    public void setAlpha(int alpha) {
        mAlpha = alpha;
        invalidateSelf();
    }

    @Override
    public void setColorFilter(ColorFilter colorFilter) {
        mPaint.setColorFilter(colorFilter);
        invalidateSelf();
    }

    @Override
    public int getOpacity() {
        return mAlpha == 255 ? PixelFormat.OPAQUE : PixelFormat.TRANSLUCENT;
    }
}

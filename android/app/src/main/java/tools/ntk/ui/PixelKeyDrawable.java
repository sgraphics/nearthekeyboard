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
 * A key cap, button, card or field in the NTK look: a block (Pixel.block) with a
 * white top face, very light side faces along the bottom and the right, and a
 * soft blurred shadow, all inside its bounds; {@code app:ntkBlock="pressed"}
 * draws the top face pushed down onto its side faces. Inflated from XML
 * (res/drawable/ntk_*.xml) with
 * {@code <drawable class="tools.ntk.ui.PixelKeyDrawable" app:ntkFace=… />}.
 * It changes how a key is drawn, never where it is or how big.
 */
public final class PixelKeyDrawable extends Drawable {
    private int mFace = 0xFFFFFFFF;
    private int mLit = 0xFFF3F4F6;
    private int mShade = 0xFFE8EAED;
    private int mDrop = 0x33111827;
    private boolean mPressed;
    private float mStepDp = 2f;
    private float mInsetDp = 0f;
    private final Rect mPadding = new Rect();
    private final Paint mPaint = Pixel.paint(0xFF000000); // its alpha and filter apply to the block

    public PixelKeyDrawable() {
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
            mLit = a.getColor(R.styleable.NtkPixelKey_ntkLit, mLit);
            mShade = a.getColor(R.styleable.NtkPixelKey_ntkShade, mShade);
            mDrop = a.getColor(R.styleable.NtkPixelKey_ntkDrop, mDrop);
            mPressed = a.getInt(R.styleable.NtkPixelKey_ntkBlock, 1) == 2;
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

    private int insetPx() {
        return Math.round(mInsetDp * Resources.getSystem().getDisplayMetrics().density);
    }

    @Override
    public void draw(Canvas c) {
        final Rect b = getBounds();
        final int s = stepPx();
        final int in = insetPx();
        if (b.width() - 2 * in < 6 * s || b.height() - 2 * in < 6 * s) return;
        Pixel.block(c, b.left + in, b.top + in, b.right - in, b.bottom - in, s, mPressed,
                mFace, mLit, mShade, mDrop, mPaint);
    }

    /**
     * Where the top face is, in the coordinates of {@code bounds} (the bounds the
     * drawable is drawn in): the face of a block, else {@code bounds} itself.
     * Key legends go on it.
     */
    public static void face(Drawable d, Rect bounds, Rect out) {
        final Drawable cur = d == null ? null : d.getCurrent();
        if (!(cur instanceof PixelKeyDrawable)) {
            out.set(bounds);
            return;
        }
        final PixelKeyDrawable k = (PixelKeyDrawable) cur;
        final int in = k.insetPx();
        Pixel.blockFace(out, bounds.left + in, bounds.top + in, bounds.right - in, bounds.bottom - in,
                k.stepPx(), k.mPressed);
    }

    @Override
    public boolean getPadding(Rect padding) {
        padding.set(mPadding);
        return mPadding.left != 0 || mPadding.top != 0 || mPadding.right != 0 || mPadding.bottom != 0;
    }

    @Override
    public void setAlpha(int alpha) {
        mPaint.setAlpha(alpha);
        invalidateSelf();
    }

    @Override
    public int getAlpha() {
        return mPaint.getAlpha();
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

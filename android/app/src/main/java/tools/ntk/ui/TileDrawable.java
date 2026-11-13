package tools.ntk.ui;

import android.content.res.Resources;
import android.content.res.TypedArray;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.util.AttributeSet;

import org.xmlpull.v1.XmlPullParser;
import org.xmlpull.v1.XmlPullParserException;

import java.io.IOException;

import rkr.simplekeyboard.inputmethod.R;

/**
 * A key, button, field or panel in the NTK look: a flat {@link Tile} drawn
 * inside its bounds. The face is the bounds less {@code ntkInset*}, the room
 * its soft shadow fades out in; {@code app:ntkState="pressed"} draws it without
 * the shadow (give it its pressed colour). Inflated from XML
 * (res/drawable/ntk_*.xml) with
 * {@code <drawable class="tools.ntk.ui.TileDrawable" app:ntkFace=… />}.
 * It changes how a key is drawn, never where it is or how big.
 */
public final class TileDrawable extends Drawable {
    private final Tile mTile = new Tile();
    private boolean mPressed;
    private float mInsetL, mInsetT, mInsetR, mInsetB; // pixels
    private final Rect mPadding = new Rect();
    private int mAlpha = 255;
    private ColorFilter mFilter;

    public TileDrawable() {
        mTile.face = 0xFFECEFF6;
    }

    @Override
    public void inflate(Resources r, XmlPullParser parser, AttributeSet attrs, Resources.Theme theme)
            throws XmlPullParserException, IOException {
        super.inflate(r, parser, attrs, theme);
        final TypedArray a = theme != null
                ? theme.obtainStyledAttributes(attrs, R.styleable.NtkTile, 0, 0)
                : r.obtainAttributes(attrs, R.styleable.NtkTile);
        try {
            final float dp = r.getDisplayMetrics().density;
            final Tile t = mTile;
            t.face = a.getColor(R.styleable.NtkTile_ntkFace, t.face);
            t.shadow = a.getColor(R.styleable.NtkTile_ntkShadow, 0);
            t.radius = a.getDimension(R.styleable.NtkTile_ntkRadius, 8f * dp);
            t.blur = a.getDimension(R.styleable.NtkTile_ntkBlur, 2f * dp);
            t.drop = a.getDimension(R.styleable.NtkTile_ntkDrop, 0.75f * dp);
            mPressed = a.getInt(R.styleable.NtkTile_ntkState, 1) == 2;
            mInsetL = a.getDimension(R.styleable.NtkTile_ntkInsetLeft, 0f);
            mInsetT = a.getDimension(R.styleable.NtkTile_ntkInsetTop, 0f);
            mInsetR = a.getDimension(R.styleable.NtkTile_ntkInsetRight, 0f);
            mInsetB = a.getDimension(R.styleable.NtkTile_ntkInsetBottom, 0f);
            mPadding.set(
                    a.getDimensionPixelSize(R.styleable.NtkTile_ntkPaddingLeft, 0),
                    a.getDimensionPixelSize(R.styleable.NtkTile_ntkPaddingTop, 0),
                    a.getDimensionPixelSize(R.styleable.NtkTile_ntkPaddingRight, 0),
                    a.getDimensionPixelSize(R.styleable.NtkTile_ntkPaddingBottom, 0));
        } finally {
            a.recycle();
        }
    }

    @Override
    public void draw(Canvas c) {
        final Rect b = getBounds();
        if (b.isEmpty()) return;
        c.save();
        c.clipRect(b); // the shadow too stays inside the bounds
        mTile.draw(c, b.left + mInsetL, b.top + mInsetT, b.right - mInsetR, b.bottom - mInsetB,
                mPressed, mAlpha, mFilter);
        c.restore();
    }

    /**
     * Where a key's legends go, in the coordinates of {@code bounds} (the bounds
     * the key's background is drawn in): the tile's face, so legends are centred
     * on the key as drawn (about 1 dp above the centre of its bounds). Other
     * backgrounds: the bounds.
     */
    public static void legendBox(Drawable d, Rect bounds, Rect out) {
        final Drawable cur = d == null ? null : d.getCurrent();
        if (!(cur instanceof TileDrawable)) {
            out.set(bounds);
            return;
        }
        final TileDrawable k = (TileDrawable) cur;
        out.set(Math.round(bounds.left + k.mInsetL), Math.round(bounds.top + k.mInsetT),
                Math.round(bounds.right - k.mInsetR), Math.round(bounds.bottom - k.mInsetB));
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
        mFilter = colorFilter;
        invalidateSelf();
    }

    @Override
    public int getOpacity() {
        return PixelFormat.TRANSLUCENT;
    }
}

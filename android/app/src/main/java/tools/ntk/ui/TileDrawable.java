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
 * A key, button, card, field or panel in the NTK look: a {@link Tile}, drawn
 * inside its bounds. The face is the bounds less {@code ntkInset*} (keys leave
 * room on the right and at the bottom for the lip and the shadow);
 * {@code app:ntkState="pressed"} draws it pushed in. Inflated from XML
 * (res/drawable/ntk_*.xml) with
 * {@code <drawable class="tools.ntk.ui.TileDrawable" app:ntkFace=… />}.
 * It changes how a key is drawn, never where it is or how big.
 */
public final class TileDrawable extends Drawable {
    private final Tile mTile = new Tile();
    private boolean mPressed;
    private float mInsetL, mInsetT, mInsetR, mInsetB; // pixels
    private final Rect mPadding = new Rect();
    private float mDensity = 1f;
    private int mAlpha = 255;
    private ColorFilter mFilter;

    public TileDrawable() {
        mTile.colours(0xFFFFFFFF, 0xFFF5F6F8, 0, 0, 0x66000000);
    }

    @Override
    public void inflate(Resources r, XmlPullParser parser, AttributeSet attrs, Resources.Theme theme)
            throws XmlPullParserException, IOException {
        super.inflate(r, parser, attrs, theme);
        final TypedArray a = theme != null
                ? theme.obtainStyledAttributes(attrs, R.styleable.NtkTile, 0, 0)
                : r.obtainAttributes(attrs, R.styleable.NtkTile);
        try {
            mDensity = r.getDisplayMetrics().density;
            final float dp = mDensity;
            final Tile t = mTile;
            t.top = a.getColor(R.styleable.NtkTile_ntkFace, t.top);
            t.bottom = a.getColor(R.styleable.NtkTile_ntkFaceBottom, t.top);
            t.lip = a.getColor(R.styleable.NtkTile_ntkLip, 0);
            t.highlight = a.getColor(R.styleable.NtkTile_ntkHighlight, 0);
            t.shadow = a.getColor(R.styleable.NtkTile_ntkShadow, t.shadow);
            t.accent = a.getColor(R.styleable.NtkTile_ntkAccent, 0);
            t.radius = a.getDimension(R.styleable.NtkTile_ntkRadius, 6f * dp);
            t.lipHeight = a.getDimension(R.styleable.NtkTile_ntkLipHeight, 1.5f * dp);
            t.blur = a.getDimension(R.styleable.NtkTile_ntkBlur, 3f * dp);
            t.hairline = a.getDimension(R.styleable.NtkTile_ntkHairline, 0.6f * dp);
            t.accentWidth = a.getDimension(R.styleable.NtkTile_ntkAccentWidth, 10f * dp);
            t.accentHeight = a.getDimension(R.styleable.NtkTile_ntkAccentHeight, 2f * dp);
            t.accentLift = a.getDimension(R.styleable.NtkTile_ntkAccentLift, 6f * dp);
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
        c.clipRect(b); // the lip and the shadow too stay inside the bounds
        mTile.draw(c, b.left + mInsetL, b.top + mInsetT, b.right - mInsetR, b.bottom - mInsetB,
                mPressed, mAlpha, mFilter);
        c.restore();
    }

    /**
     * Where a key's legends go, in the coordinates of {@code bounds} (the bounds
     * the key's background is drawn in). Legends stay where they were when users
     * enrolled (the fingerprint stores where fingers land on a key): the bounds
     * less one step (2 dp, in whole pixels) on the right and four at the bottom,
     * the top face of the earlier block keys. A key tile's face has the same
     * width and is about 3 dp taller, so legends sit about 1.5 dp above its
     * centre. Pressed, they move down with the face. Other backgrounds: the bounds.
     */
    public static void legendBox(Drawable d, Rect bounds, Rect out) {
        final Drawable cur = d == null ? null : d.getCurrent();
        if (!(cur instanceof TileDrawable)) {
            out.set(bounds);
            return;
        }
        final TileDrawable k = (TileDrawable) cur;
        final int s = Math.max(1, Math.round(2f * k.mDensity));
        final int down = k.mPressed ? Math.round(k.mTile.lipHeight) : 0;
        out.set(bounds.left, bounds.top + down, bounds.right - s, bounds.bottom - 4 * s + down);
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

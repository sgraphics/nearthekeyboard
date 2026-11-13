package tools.ntk.ui;

import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Build;
import android.util.SparseArray;

/**
 * One tile of the NTK look (Dieter Rams; the owner's mock): a flat surface of one
 * colour with rounded corners, no outline, no gradient, and a barely visible soft
 * shadow. Keys, the Sign key, buttons, fields and the stamp buttons are tiles.
 *
 * {@link #draw} takes the face's rectangle. The shadow falls a little below it,
 * so callers leave room around the face and clip to their own bounds. Pressed,
 * a tile has no shadow (callers give it its pressed colour).
 */
public final class Tile {
    /** The face colour and the shadow colour (transparent: no shadow), ARGB. */
    public int face, shadow;
    /** Sizes in pixels: corner radius, shadow blur, how far the shadow falls below the face. */
    public float radius, blur, drop;

    private final Paint mPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF mRect = new RectF();
    private static final SparseArray<BlurMaskFilter> sBlurs = new SparseArray<>();

    /** Sets the colours and, from dp, the sizes. */
    public Tile set(int faceColour, int shadowColour, float density, float radiusDp, float blurDp, float dropDp) {
        face = faceColour;
        shadow = shadowColour;
        radius = radiusDp * density;
        blur = blurDp * density;
        drop = dropDp * density;
        return this;
    }

    /**
     * Draws the tile whose face is l..r by t..b. {@code alpha} (0..255) and
     * {@code filter} (may be null) apply to it. The shadow needs a canvas that
     * draws blur (software, or hardware from API 28); elsewhere there is none.
     */
    public void draw(Canvas c, float l, float t, float r, float b, boolean pressed, int alpha, ColorFilter filter) {
        if (r - l < 1f || b - t < 1f) return;
        final float rad = Math.min(radius, Math.min(r - l, b - t) / 2f);
        mPaint.setColorFilter(filter);
        if (!pressed && Color.alpha(shadow) != 0 && blur > 0f
                && (!c.isHardwareAccelerated() || Build.VERSION.SDK_INT >= 28)) {
            // The face's shape, a little narrower and lower, blurred: a soft halo, mostly below.
            final float in = blur * 0.25f;
            mPaint.setColor(shadow);
            mPaint.setAlpha(Color.alpha(shadow) * alpha / 255);
            mPaint.setMaskFilter(blurFilter(blur));
            mRect.set(l + in, t + drop, r - in, b + drop);
            c.drawRoundRect(mRect, rad, rad, mPaint);
            mPaint.setMaskFilter(null);
        }
        mPaint.setColor(face);
        mPaint.setAlpha(Color.alpha(face) * alpha / 255);
        mRect.set(l, t, r, b);
        c.drawRoundRect(mRect, rad, rad, mPaint);
    }

    private static BlurMaskFilter blurFilter(float radius) {
        final int key = Math.max(1, Math.round(radius));
        BlurMaskFilter f = sBlurs.get(key);
        if (f == null) {
            f = new BlurMaskFilter(key, BlurMaskFilter.Blur.NORMAL);
            sBlurs.put(key, f);
        }
        return f;
    }
}

package tools.ntk.ui;

import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Build;
import android.util.SparseArray;

/**
 * One tile of the NTK look, after a Polestar interior (white control tiles on
 * thin dark seams, a gold knob): rounded corners and no outlines; a face with a
 * barely visible vertical gradient; a faint highlight along its top edge; a thin
 * front edge under it (the lip), so it reads as a slab; and a soft layered drop
 * shadow, light falling from above and a little from the left. Keys, the Sign
 * key, the stamp buttons, buttons, cards and fields are tiles.
 *
 * {@link #draw} takes the face's rectangle when the tile is up. The lip and the
 * shadow go below it (and the shadow a little to the right), so callers leave
 * room there and clip to their own bounds. Pressed, the face sits on its lip,
 * {@link #lipHeight} lower, and the shadow tightens: the tile is pushed in.
 */
public final class Tile {
    /** Colours, ARGB. Transparent leaves the part out; {@code top == bottom} is a flat face. */
    public int top, bottom, lip, highlight, shadow, accent;
    /** Sizes, in pixels: corner radius, lip, shadow blur, top highlight, accent bar. */
    public float radius, lipHeight, blur, hairline, accentWidth, accentHeight, accentLift;

    private final Paint mPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF mRect = new RectF();
    private final SparseArray<Shader> mShaders = new SparseArray<>(); // the face's gradient, by face height
    private int mShaderTop, mShaderBottom;
    private static final SparseArray<BlurMaskFilter> sBlurs = new SparseArray<>();

    /** Sets the sizes from dp. */
    public Tile sizes(float density, float radiusDp, float lipDp, float blurDp, float hairlineDp) {
        radius = radiusDp * density;
        lipHeight = lipDp * density;
        blur = blurDp * density;
        hairline = hairlineDp * density;
        return this;
    }

    /** Sets the face, lip, highlight and shadow colours. */
    public Tile colours(int faceTop, int faceBottom, int lipColour, int highlightColour, int shadowColour) {
        top = faceTop;
        bottom = faceBottom;
        lip = lipColour;
        highlight = highlightColour;
        shadow = shadowColour;
        return this;
    }

    /**
     * Draws the tile whose face, up, is l..r by t..b. {@code alpha} (0..255) and
     * {@code filter} (may be null) apply to every part. The blurred shadow needs a
     * canvas that draws blur (software, or hardware from API 28); elsewhere the
     * tile has none.
     */
    public void draw(Canvas c, float l, float t, float r, float b, boolean pressed, int alpha, ColorFilter filter) {
        if (r - l < 1f || b - t < 1f) return;
        final float rad = Math.min(radius, Math.min(r - l, b - t) / 2f);
        mPaint.setColorFilter(filter);
        final float lh = Math.max(0f, lipHeight);
        if (Color.alpha(shadow) != 0 && blur > 0f && (!c.isHardwareAccelerated() || Build.VERSION.SDK_INT >= 28)) {
            final float slabT = t + lh, slabB = b + lh; // the slab's outline, lip included, moved down
            if (pressed) {
                shadow(c, l, slabT + blur * 0.1f, r, slabB + blur * 0.1f, rad, blur * 0.35f, 0.6f, alpha);
            } else {
                // Two layers: a wide, faint ambient shadow, and a tight, darker one where the slab meets the floor.
                shadow(c, l + blur * 0.2f, slabT + blur * 0.45f, r + blur * 0.2f, slabB + blur * 0.45f, rad, blur, 0.55f, alpha);
                shadow(c, l, slabT + blur * 0.12f, r, slabB + blur * 0.12f, rad, blur * 0.3f, 0.75f, alpha);
            }
        }
        final float d = pressed ? lh : 0f;
        if (!pressed && Color.alpha(lip) != 0 && lh > 0f) {
            // The front edge: the face's shape, lh lower, of which only the part below the face shows.
            c.save();
            c.clipRect(l, b - rad, r, b + lh);
            fill(c, l, t + lh, r, b + lh, rad, lip, alpha);
            c.restore();
        }
        float ft = t + d;
        if (Color.alpha(highlight) != 0 && hairline > 0f) {
            // The highlight: the face's shape, of which the face, drawn a hairline lower, leaves the top edge.
            c.save();
            c.clipRect(l, ft, r, ft + hairline + rad);
            fill(c, l, ft, r, b + d, rad, highlight, alpha);
            c.restore();
            ft += hairline;
        }
        face(c, l, ft, r, b + d, rad, alpha);
        if (Color.alpha(accent) != 0 && accentWidth > 0f && accentHeight > 0f) {
            final float cx = (l + r) / 2f, cy = b + d - accentLift;
            mRect.set(cx - accentWidth / 2f, cy - accentHeight / 2f, cx + accentWidth / 2f, cy + accentHeight / 2f);
            mPaint.setShader(null);
            mPaint.setColor(accent);
            mPaint.setAlpha(Color.alpha(accent) * alpha / 255);
            c.drawRoundRect(mRect, accentHeight / 2f, accentHeight / 2f, mPaint);
        }
    }

    private void face(Canvas c, float l, float t, float r, float b, float rad, int alpha) {
        if (top == bottom) {
            fill(c, l, t, r, b, rad, top, alpha);
            return;
        }
        if (mShaderTop != top || mShaderBottom != bottom) {
            mShaders.clear();
            mShaderTop = top;
            mShaderBottom = bottom;
        }
        final int h = Math.max(1, Math.round(b - t));
        Shader s = mShaders.get(h);
        if (s == null) {
            s = new LinearGradient(0f, 0f, 0f, h, top, bottom, Shader.TileMode.CLAMP);
            mShaders.put(h, s);
        }
        c.save();
        c.translate(l, t); // the gradient runs from 0 to h: one shader serves every tile of this height
        mPaint.setShader(s);
        mPaint.setColor(0xFF000000);
        mPaint.setAlpha(alpha);
        mRect.set(0f, 0f, r - l, b - t);
        c.drawRoundRect(mRect, rad, rad, mPaint);
        mPaint.setShader(null);
        c.restore();
    }

    private void fill(Canvas c, float l, float t, float r, float b, float rad, int colour, int alpha) {
        mPaint.setShader(null);
        mPaint.setColor(colour);
        mPaint.setAlpha(Color.alpha(colour) * alpha / 255);
        mRect.set(l, t, r, b);
        c.drawRoundRect(mRect, rad, rad, mPaint);
    }

    private void shadow(Canvas c, float l, float t, float r, float b, float rad, float blurPx, float strength,
            int alpha) {
        mPaint.setShader(null);
        mPaint.setColor(shadow);
        mPaint.setAlpha(Math.round(Color.alpha(shadow) * strength * alpha / 255f));
        mPaint.setMaskFilter(blurFilter(blurPx));
        mRect.set(l, t, r, b);
        c.drawRoundRect(mRect, rad, rad, mPaint);
        mPaint.setMaskFilter(null);
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

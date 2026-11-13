package tools.ntk.ui;

import android.content.Context;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.util.SparseArray;

/**
 * Drawing helpers for the NTK look: white blocks with very light side faces and a
 * soft shadow, as in the brand's isometric scene (brand/README.md), on whole
 * device pixels.
 */
public final class Pixel {
    private Pixel() {}

    /** One "pixel" of the grid, in device pixels: 1.5 dp, rounded to whole pixels. */
    public static int step(Context c) {
        return Math.max(1, Math.round(1.5f * c.getResources().getDisplayMetrics().density));
    }

    public static Paint paint(int color) {
        final Paint p = new Paint();
        p.setAntiAlias(false);
        p.setStyle(Paint.Style.FILL);
        p.setColor(color);
        return p;
    }

    private static final Paint sFace = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final Paint sShadow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final Path sPath = new Path();
    private static final SparseArray<BlurMaskFilter> sBlurs = new SparseArray<>();

    /**
     * A block: the top face, a lit face along its bottom and a shaded face along
     * its right, {@code s} deep and cut at 45 degrees, and a soft blurred shadow
     * under it; no outlines. Everything stays inside l..r, t..b: the top face is
     * l..r-s by t..b-4s, the side faces and the shadow fill the rest. Pressed, the
     * top face moves s down and right, onto its side faces, and the shadow
     * tightens. The blur needs a canvas that draws it (software, or hardware from
     * API 28); elsewhere the block has no shadow. The alpha of {@code p} applies.
     */
    public static void block(Canvas c, int l, int t, int r, int b, int s, boolean pressed,
            int top, int lit, int shade, int shadow, Paint p) {
        final int fr = r - s, fb = b - 4 * s; // the top face, up: l..fr, t..fb
        if (fr <= l || fb <= t || s <= 0) return;
        final int alpha = p.getAlpha();
        if (Color.alpha(shadow) != 0 && (!c.isHardwareAccelerated() || Build.VERSION.SDK_INT >= 28)) {
            final int dy = pressed ? s / 2 : s, blur = pressed ? s : 2 * s, off = pressed ? s : 0;
            sShadow.setColor(shadow);
            sShadow.setAlpha(Color.alpha(shadow) * alpha / 255);
            sShadow.setMaskFilter(blur(blur));
            c.drawRect(l + 2 * s + off, t + s + dy + off, fr - s + off, fb + s + dy, sShadow);
        }
        if (!pressed) sides(c, l, t, fr, fb, s, lit, shade, p);
        final int d = pressed ? s : 0;
        final Paint q = sFace;
        q.setColorFilter(p.getColorFilter());
        q.setColor(top);
        q.setAlpha(Color.alpha(top) * alpha / 255);
        c.drawRect(l + d, t + d, fr + d, fb + d, q);
    }

    /**
     * The side faces of a block whose top face is l..fr, t..fb: the lit face along
     * its bottom and the shaded face along its right, s deep, cut at 45 degrees.
     */
    public static void sides(Canvas c, int l, int t, int fr, int fb, int s, int lit, int shade, Paint p) {
        final int alpha = p.getAlpha();
        final Paint q = sFace;
        q.setColorFilter(p.getColorFilter());
        q.setColor(shade);
        q.setAlpha(Color.alpha(shade) * alpha / 255);
        quad(c, q, fr, t, fr + s, t + s, fr + s, fb + s, fr, fb);
        q.setColor(lit);
        q.setAlpha(Color.alpha(lit) * alpha / 255);
        quad(c, q, l, fb, fr, fb, fr + s, fb + s, l + s, fb + s);
    }

    /** The top face of {@link #block}: up, or pressed (s down and right). */
    public static void blockFace(Rect out, int l, int t, int r, int b, int s, boolean pressed) {
        final int d = pressed ? s : 0;
        out.set(l + d, t + d, r - s + d, b - 4 * s + d);
    }

    private static void quad(Canvas c, Paint p, float x0, float y0, float x1, float y1,
            float x2, float y2, float x3, float y3) {
        sPath.rewind();
        sPath.moveTo(x0, y0);
        sPath.lineTo(x1, y1);
        sPath.lineTo(x2, y2);
        sPath.lineTo(x3, y3);
        sPath.close();
        c.drawPath(sPath, p);
    }

    private static BlurMaskFilter blur(int radius) {
        BlurMaskFilter f = sBlurs.get(radius);
        if (f == null) {
            f = new BlurMaskFilter(Math.max(1, radius), BlurMaskFilter.Blur.NORMAL);
            sBlurs.put(radius, f);
        }
        return f;
    }
}

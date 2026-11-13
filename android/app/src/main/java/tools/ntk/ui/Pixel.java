package tools.ntk.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;

/** The 8-bit look: rectangles with stepped corners on a whole-pixel grid, no anti-aliasing. */
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

    /**
     * A block as on the site (web/assets/ntk.css, "depth 2"): the top face, a
     * lit face along its bottom and a shaded face along its right, each two
     * steps deep and starting with a one-step stair, and a soft drop one step
     * further; no outlines. Everything stays inside l..r, t..b: the top face is
     * that box less three steps at the right and the bottom. Pressed, the top
     * face sits two steps lower and further right, on its drop, without side
     * faces. Drawn as overlapping rectangles, so every edge stays sharp.
     */
    public static void block(Canvas c, int l, int t, int r, int b, int s, boolean pressed,
            int top, int lit, int shade, int drop, Paint p) {
        final int fr = r - 3 * s, fb = b - 3 * s; // the top face, up: l..fr, t..fb
        if (fr <= l || fb <= t) return;
        p.setColor(drop);
        c.drawRect(l + 3 * s, t + 3 * s, r, b, p);
        if (pressed) {
            p.setColor(top);
            c.drawRect(l + 2 * s, t + 2 * s, fr + 2 * s, fb + 2 * s, p);
            return;
        }
        p.setColor(shade);
        c.drawRect(l + 2 * s, t + 2 * s, fr + 2 * s, fb + 2 * s, p);
        c.drawRect(l + s, t + s, fr + s, fb + s, p);
        p.setColor(lit);
        c.drawRect(l + 2 * s, t + 4 * s, fr, fb + 2 * s, p);
        c.drawRect(l + s, t + 2 * s, fr, fb + s, p);
        p.setColor(top);
        c.drawRect(l, t, fr, fb, p);
    }

    /** The top face of {@link #block}: up, or pressed (two steps down and right). */
    public static void blockFace(Rect out, int l, int t, int r, int b, int s, boolean pressed) {
        final int d = pressed ? 2 * s : 0;
        out.set(l + d, t + d, r - 3 * s + d, b - 3 * s + d);
    }

    /**
     * A rectangle whose corners are cut in {@code steps} steps of {@code s}
     * pixels. Drawn as overlapping rectangles, so every edge stays sharp.
     */
    public static void stepped(Canvas c, int l, int t, int r, int b, int s, int steps, Paint p) {
        if (r <= l || b <= t) return;
        for (int i = 0; i <= steps; i++) {
            final int h = (steps - i) * s;
            final int v = i * s;
            if (l + h < r - h && t + v < b - v) c.drawRect(l + h, t + v, r - h, b - v, p);
        }
    }
}

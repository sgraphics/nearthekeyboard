package tools.ntk.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;

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

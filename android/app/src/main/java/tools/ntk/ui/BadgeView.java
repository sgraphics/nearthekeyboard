package tools.ntk.ui;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.util.AttributeSet;
import android.view.View;

import rkr.simplekeyboard.inputmethod.R;

/**
 * The NTK badge: the brand bitmap (res/drawable-nodpi/ntk_badge.png, light and
 * night versions) when the build has it, else a drawn placeholder: "NTK" in
 * 5x7 pixel letters followed by four thin orange lines.
 */
public final class BadgeView extends View {
    private final Bitmap mBadge;
    private final Paint mPaint = Pixel.paint(0);
    private final int mInk;
    private final int mOrange;

    public BadgeView(Context context, AttributeSet attrs) {
        super(context, attrs);
        mBadge = load(context);
        mInk = context.getColor(R.color.ntk_legend);
        mOrange = context.getColor(R.color.ntk_orange);
    }

    static Bitmap load(Context c) {
        final int id = c.getResources().getIdentifier("ntk_badge", "drawable", c.getPackageName());
        if (id == 0) return null;
        try {
            return BitmapFactory.decodeResource(c.getResources(), id);
        } catch (RuntimeException e) {
            return null;
        }
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        final int h = MeasureSpec.getSize(heightMeasureSpec);
        final int w = mBadge != null ? Math.round(h * (float) mBadge.getWidth() / mBadge.getHeight()) : Math.round(h * 4.2f);
        setMeasuredDimension(w, h);
    }

    @Override
    protected void onDraw(Canvas c) {
        draw(c, new Rect(0, 0, getWidth(), getHeight()), mBadge, mPaint, mInk, mOrange);
    }

    /** Draws the badge (or the placeholder) into {@code r}. */
    static void draw(Canvas c, Rect r, Bitmap badge, Paint paint, int ink, int orange) {
        if (badge != null) {
            // The badge is pixel art on a 7-row grid (84 px tall). Scale by whole grid cells,
            // without filtering, so every cell stays a sharp square.
            final int cell = Math.max(1, r.height() / 7);
            final int h = 7 * cell;
            final int w = Math.round(h * (float) badge.getWidth() / badge.getHeight());
            final int top = r.top + (r.height() - h) / 2;
            c.drawBitmap(badge, null, new Rect(r.left, top, r.left + w, top + h), null);
            return;
        }
        final String[][] glyphs = {
            { "X...X", "XX..X", "XX..X", "X.X.X", "X..XX", "X..XX", "X...X" },
            { "XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "..X.." },
            { "X...X", "X..X.", "X.X..", "XX...", "X.X..", "X..X.", "X...X" },
        };
        final int px = Math.max(1, r.height() / 7);
        final int y = r.top + (r.height() - 7 * px) / 2;
        int x = r.left;
        paint.setColor(ink);
        for (String[] g : glyphs) {
            for (int row = 0; row < 7; row++) {
                for (int col = 0; col < 5; col++) {
                    if (g[row].charAt(col) == 'X') {
                        c.drawRect(x + col * px, y + row * px, x + (col + 1) * px, y + (row + 1) * px, paint);
                    }
                }
            }
            x += 6 * px;
        }
        paint.setColor(orange);
        final int lineH = Math.max(1, px / 2);
        for (int i = 0; i < 4; i++) {
            final int ly = y + px / 2 + i * 2 * px;
            c.drawRect(x + px, ly, x + px + (6 - i) * px, ly + lineH, paint);
        }
    }
}

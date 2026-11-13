package tools.ntk.ui;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.AttributeSet;
import android.view.View;

import rkr.simplekeyboard.inputmethod.R;

/**
 * The NTK mark: N, T and K, each drawn as two parallel orange lines. A vector
 * drawable from brand/build.mjs (res/drawable/ntk_badge_light.xml and
 * ntk_badge_dark.xml), drawn smoothly at the view's height; the width follows
 * the mark's proportions. VectorDrawable has no masks, so the gaps between the
 * lines are painted in ntk_display, the dark display the mark sits on (the
 * keyboard's strip, the app's header, style NtkDisplay): draw it only on that colour.
 */
public final class BadgeView extends View {
    private final Drawable mMark;

    public BadgeView(Context context, AttributeSet attrs) {
        super(context, attrs);
        mMark = load(context);
    }

    /** The mark for the current theme: the drawable whose gaps match this theme's ntk_display. */
    static Drawable load(Context c) {
        final int night = c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return c.getDrawable(night == Configuration.UI_MODE_NIGHT_YES ? R.drawable.ntk_badge_dark : R.drawable.ntk_badge_light);
    }

    /** The mark's width, in pixels, when drawn {@code height} pixels tall. */
    static int widthFor(Drawable mark, int height) {
        return Math.round(height * (float) mark.getIntrinsicWidth() / mark.getIntrinsicHeight());
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        final int h = MeasureSpec.getSize(heightMeasureSpec);
        setMeasuredDimension(resolveSize(widthFor(mMark, h), widthMeasureSpec), h);
    }

    @Override
    protected void onDraw(Canvas c) {
        final int h = getHeight();
        mMark.setBounds(0, 0, widthFor(mMark, h), h);
        mMark.draw(c);
    }
}

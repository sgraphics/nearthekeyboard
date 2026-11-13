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
 * The floor under the keys, as in the brand's scene and on the site: a plain
 * colour with a faint square grid of one-pixel lines. Inflated from XML
 * (res/drawable/ntk_keyboard_floor.xml) with
 * {@code <drawable class="tools.ntk.ui.GridDrawable" app:ntkFace=… app:ntkShade=… app:ntkStep=… />}:
 * the floor colour, the line colour and the grid step.
 */
public final class GridDrawable extends Drawable {
    private int mFloor = 0xFFFFFFFF;
    private int mLine = 0xFFEEF0F3;
    private float mStepDp = 28f;
    private final Paint mPaint = Pixel.paint(0xFF000000);
    private int mAlpha = 255;

    @Override
    public void inflate(Resources r, XmlPullParser parser, AttributeSet attrs, Resources.Theme theme)
            throws XmlPullParserException, IOException {
        super.inflate(r, parser, attrs, theme);
        final TypedArray a = theme != null
                ? theme.obtainStyledAttributes(attrs, R.styleable.NtkPixelKey, 0, 0)
                : r.obtainAttributes(attrs, R.styleable.NtkPixelKey);
        try {
            mFloor = a.getColor(R.styleable.NtkPixelKey_ntkFace, mFloor);
            mLine = a.getColor(R.styleable.NtkPixelKey_ntkShade, mLine);
            final float density = r.getDisplayMetrics().density;
            mStepDp = a.getDimension(R.styleable.NtkPixelKey_ntkStep, mStepDp * density) / density;
        } finally {
            a.recycle();
        }
    }

    @Override
    public void draw(Canvas c) {
        final Rect b = getBounds();
        mPaint.setColor(mFloor);
        mPaint.setAlpha(mAlpha * (mFloor >>> 24) / 255);
        c.drawRect(b, mPaint);
        final int step = Math.max(4, Math.round(mStepDp * Resources.getSystem().getDisplayMetrics().density));
        mPaint.setColor(mLine);
        mPaint.setAlpha(mAlpha * (mLine >>> 24) / 255);
        for (int x = b.left; x < b.right; x += step) c.drawRect(x, b.top, x + 1, b.bottom, mPaint);
        for (int y = b.top; y < b.bottom; y += step) c.drawRect(b.left, y, b.right, y + 1, mPaint);
    }

    @Override
    public void setAlpha(int alpha) {
        mAlpha = alpha;
        invalidateSelf();
    }

    @Override
    public void setColorFilter(ColorFilter colorFilter) {
        mPaint.setColorFilter(colorFilter);
    }

    @Override
    public int getOpacity() {
        return PixelFormat.OPAQUE;
    }
}

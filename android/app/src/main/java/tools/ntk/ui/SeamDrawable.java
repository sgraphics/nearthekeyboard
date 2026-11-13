package tools.ntk.ui;

import android.content.res.Resources;
import android.content.res.TypedArray;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.util.AttributeSet;

import org.xmlpull.v1.XmlPullParser;
import org.xmlpull.v1.XmlPullParserException;

import java.io.IOException;

import rkr.simplekeyboard.inputmethod.R;

/**
 * The floor under the keys: a dark seam colour, a little lighter at the top,
 * which shows as thin dark gaps between the key tiles, like the seams of the
 * reference's control panel. Inflated from XML
 * (res/drawable/ntk_keyboard_floor.xml) with
 * {@code <drawable class="tools.ntk.ui.SeamDrawable" app:ntkFace=… app:ntkFaceBottom=… />}.
 */
public final class SeamDrawable extends Drawable {
    private int mTop = 0xFF2A2E35;
    private int mBottom = 0xFF1E2126;
    private final Paint mPaint = new Paint();
    private Shader mShader;
    private int mShaderTop = Integer.MIN_VALUE, mShaderBottom = Integer.MIN_VALUE;
    private int mAlpha = 255;

    @Override
    public void inflate(Resources r, XmlPullParser parser, AttributeSet attrs, Resources.Theme theme)
            throws XmlPullParserException, IOException {
        super.inflate(r, parser, attrs, theme);
        final TypedArray a = theme != null
                ? theme.obtainStyledAttributes(attrs, R.styleable.NtkTile, 0, 0)
                : r.obtainAttributes(attrs, R.styleable.NtkTile);
        try {
            mTop = a.getColor(R.styleable.NtkTile_ntkFace, mTop);
            mBottom = a.getColor(R.styleable.NtkTile_ntkFaceBottom, mTop);
        } finally {
            a.recycle();
        }
    }

    @Override
    public void draw(Canvas c) {
        final Rect b = getBounds();
        if (mShader == null || mShaderTop != b.top || mShaderBottom != b.bottom) {
            mShader = new LinearGradient(0f, b.top, 0f, b.bottom, mTop, mBottom, Shader.TileMode.CLAMP);
            mShaderTop = b.top;
            mShaderBottom = b.bottom;
        }
        mPaint.setShader(mShader);
        mPaint.setAlpha(mAlpha);
        c.drawRect(b, mPaint);
    }

    @Override
    public void setAlpha(int alpha) {
        mAlpha = alpha;
        invalidateSelf();
    }

    @Override
    public void setColorFilter(ColorFilter colorFilter) {
        mPaint.setColorFilter(colorFilter);
        invalidateSelf();
    }

    @Override
    public int getOpacity() {
        return mAlpha == 255 ? PixelFormat.OPAQUE : PixelFormat.TRANSLUCENT;
    }
}

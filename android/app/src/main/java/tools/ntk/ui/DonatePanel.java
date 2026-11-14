package tools.ntk.ui;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import rkr.simplekeyboard.inputmethod.R;
import tools.ntk.Donate;

/**
 * Over the keys after a tap on the DONATE ribbon under them: three amounts and a
 * thank-you note, on the keyboard's own floor. An amount opens ntk.tools/donate in
 * the browser, where the user's own wallet sends it. Lives in the input view
 * (res/layout/input_view.xml, res/layout-v28/input_view.xml), hidden until shown,
 * and hides again with the keyboard.
 */
public final class DonatePanel extends FrameLayout {

    public DonatePanel(final Context context, final AttributeSet attrs) {
        super(context, attrs);
        setBackgroundColor(context.getColor(R.color.ntk_floor));
        setClickable(true); // a touch on the panel never reaches the keys under it
        setVisibility(GONE);
        build(context);
    }

    private int dp(final float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView text(final Context c, final String s, final int colour, final float sp) {
        final TextView t = new TextView(c);
        t.setText(s);
        t.setGravity(Gravity.CENTER);
        t.setTextColor(c.getColor(colour));
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        t.setIncludeFontPadding(false);
        return t;
    }

    private void build(final Context c) {
        final LinearLayout column = new LinearLayout(c);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);

        final LinearLayout row = new LinearLayout(c);
        row.setOrientation(LinearLayout.HORIZONTAL);
        for (final int amount : Donate.AMOUNTS) {
            final TextView b = text(c, amount + " NEAR", R.color.ntk_legend, 18);
            b.setBackgroundResource(R.drawable.ntk_button_background);
            b.setMinHeight(dp(60));
            b.setOnClickListener(v -> open(amount));
            final LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f);
            lp.setMargins(dp(4), 0, dp(4), 0);
            row.addView(b, lp);
        }
        column.addView(row, new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

        final TextView thanks = text(c, Donate.THANKS, R.color.ntk_muted, 15);
        thanks.setLineSpacing(dp(4), 1f);
        final LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
        tp.topMargin = dp(20);
        column.addView(thanks, tp);

        final LayoutParams cp = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        cp.setMargins(dp(14), dp(24), dp(14), dp(24));
        addView(column, cp);

        final TextView close = text(c, "✕", R.color.ntk_legend, 18);
        close.setContentDescription("Close");
        close.setOnClickListener(v -> hide());
        addView(close, new LayoutParams(dp(52), dp(52), Gravity.TOP | Gravity.END));
    }

    /** Shows the panel of the input view that {@code from} is in. */
    public static void showFor(final View from) {
        final View panel = from.getRootView().findViewById(R.id.ntk_donate_panel);
        if (panel != null) panel.setVisibility(VISIBLE);
    }

    public void hide() {
        setVisibility(GONE);
    }

    private void open(final int amount) {
        final String url = Donate.url(amount);
        hide();
        if (url == null) return;
        try {
            getContext().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException e) {
            // No browser: nothing to open.
        }
    }

    @Override
    protected void onWindowVisibilityChanged(final int visibility) {
        super.onWindowVisibilityChanged(visibility);
        if (visibility != VISIBLE) hide(); // closes with the keyboard
    }
}

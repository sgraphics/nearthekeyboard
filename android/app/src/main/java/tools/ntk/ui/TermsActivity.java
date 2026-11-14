package tools.ntk.ui;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import rkr.simplekeyboard.inputmethod.R;
import tools.ntk.Terms;

/**
 * The first-run screen: what NTK measures and where it goes, the risks in a few
 * lines, the full Terms of use and Privacy notice in a scrollable box (bundled,
 * offline: res/raw/ntk_terms.txt), and a box to tick before Continue. Shown
 * before anything else in the app until the current terms version
 * ({@link Terms#VERSION}) is accepted; the keyboard's Sign and Enroll open it
 * too. Continue records the version and the time and opens the setup screen.
 */
public final class TermsActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.ntk_activity_terms);
        SetupActivity.applyInsets(findViewById(R.id.ntk_root));
        final TextView text = findViewById(R.id.ntk_terms_text);
        text.setText(readTerms());
        final CheckBox agree = findViewById(R.id.ntk_terms_agree);
        final Button go = findViewById(R.id.ntk_terms_continue);
        go.setEnabled(agree.isChecked());
        agree.setOnCheckedChangeListener((box, on) -> go.setEnabled(on));
        go.setOnClickListener(v -> {
            if (!agree.isChecked()) return;
            Terms.accept(this);
            startActivity(new Intent(this, SetupActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP));
            finish();
        });
    }

    private String readTerms() {
        try (InputStream in = getResources().openRawResource(R.raw.ntk_terms)) {
            final ByteArrayOutputStream out = new ByteArrayOutputStream();
            final byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "Terms of use: https://ntk.tools/terms/\nPrivacy notice: https://ntk.tools/privacy/";
        }
    }
}

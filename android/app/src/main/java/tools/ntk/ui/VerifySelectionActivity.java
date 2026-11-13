package tools.ntk.ui;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import java.util.List;

import tools.ntk.Links;
import tools.ntk.a11y.TagText;

/**
 * "Verify NTK stamp" in the text selection menu of any app
 * (ACTION_PROCESS_TEXT, TODO.md section 6). Needs no permission: the app that
 * shows the menu hands over the selected text. Opens the verify page for the
 * first tag in the selection, with the selected text before that tag in the
 * address fragment. Shows nothing of its own.
 */
public final class VerifySelectionActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final Intent in = getIntent();
        final CharSequence selected = in == null ? null : in.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
        final List<TagText.Tag> tags = TagText.find(selected);
        if (tags.isEmpty()) {
            Toast.makeText(this, "No NTK stamp in the selected text. A tag looks like [NTK e65ee28db5].",
                    Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        final TagText.Tag t = tags.get(0);
        final String before = selected.subSequence(0, t.start).toString();
        final Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(Links.verifyUrl(Links.siteBase(this), t.id, before)));
        view.addCategory(Intent.CATEGORY_BROWSABLE);
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(view);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No browser to open the verify page", Toast.LENGTH_SHORT).show();
        }
        finish();
    }
}

package tools.ntk.ui;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.Locale;

import rkr.simplekeyboard.inputmethod.R;
import tools.ntk.AccountStore;
import tools.ntk.NtkController;
import tools.ntk.SignFlow;
import tools.ntk.Terms;

/**
 * Enrollment (TODO.md 3.5): three prompts typed with NTK, under the terms the
 * user accepted on the first-run screen (one line recalls them: biometric data,
 * how to delete it), so nobody is asked twice. Each field carries privateImeOptions "tools.ntk.enroll=compose" or
 * "=copy", so the keyboard's key in the strip says Enroll and sends the
 * session to the enclave's `enroll` with that mode. The result screen is
 * driven by the enclave's `ready`; no fingerprint data comes back.
 */
public final class EnrollActivity extends Activity implements SignFlow.Listener {
    /** The copy prompt's sentence. */
    public static final String COPY_SENTENCE =
            "Typing on glass feels different from a real keyboard, my thumbs land a little low and to the right.";

    private static final String[] PROMPTS = {
        "Type what you ate yesterday and how you liked it.",
        "Copy this sentence.",
        "One more: describe the room you are in right now.",
    };

    private View mPrompts, mDone;
    private TextView mStep, mPrompt, mCopy, mResult, mDoneDetail;
    private EditText[] mFields;
    private int mIndex;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!Terms.accepted(this)) {
            startActivity(new Intent(this, TermsActivity.class));
            finish();
            return;
        }
        setContentView(R.layout.ntk_activity_enroll);
        SetupActivity.applyInsets(findViewById(R.id.ntk_root));
        mPrompts = findViewById(R.id.ntk_prompts);
        mDone = findViewById(R.id.ntk_done);
        mStep = findViewById(R.id.ntk_step);
        mPrompt = findViewById(R.id.ntk_prompt);
        mCopy = findViewById(R.id.ntk_copy_text);
        mResult = findViewById(R.id.ntk_enroll_result);
        mDoneDetail = findViewById(R.id.ntk_done_detail);
        mFields = new EditText[] { findViewById(R.id.ntk_field_1), findViewById(R.id.ntk_field_2), findViewById(R.id.ntk_field_3) };
        mCopy.setText(COPY_SENTENCE);

        findViewById(R.id.ntk_btn_done).setOnClickListener(v -> finish());

        if (AccountStore.get(this).current() == null) {
            startActivity(new Intent(this, SetupActivity.class));
            finish();
            return;
        }
        showPrompt(0);
    }

    @Override
    protected void onResume() {
        super.onResume();
        SignFlow.addListener(this);
    }

    @Override
    protected void onPause() {
        SignFlow.removeListener(this);
        super.onPause();
    }

    /** Shows prompt i (0..2) and focuses its field, which starts a new enrollment session. */
    public void showPrompt(int i) {
        mIndex = i;
        mDone.setVisibility(View.GONE);
        mPrompts.setVisibility(View.VISIBLE);
        mStep.setText(String.format(Locale.ROOT, "Prompt %d of 3%s", i + 1, i == 1 ? " (copy)" : ""));
        mPrompt.setText(PROMPTS[i]);
        mCopy.setVisibility(i == 1 ? View.VISIBLE : View.GONE);
        for (int k = 0; k < mFields.length; k++) mFields[k].setVisibility(k == i ? View.VISIBLE : View.GONE);
        final EditText f = mFields[i];
        f.requestFocus();
        showKeyboard(f);
    }

    /** Asks for the keyboard explicitly once the window has focus (the prompt is for typing). */
    private void showKeyboard(EditText f) {
        if (!hasWindowFocus()) {
            mPendingKeyboard = f;
            return;
        }
        mPendingKeyboard = null;
        f.post(() -> {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R && f.getWindowInsetsController() != null) {
                f.getWindowInsetsController().show(android.view.WindowInsets.Type.ime());
            }
            final InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(f, 0);
        });
    }

    private EditText mPendingKeyboard;

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && mPendingKeyboard != null) showKeyboard(mPendingKeyboard);
    }

    public int currentPrompt() {
        return mIndex;
    }

    public EditText currentField() {
        return mFields[mIndex];
    }

    @Override
    public void onResult(String op, NtkController.Result r) {
        if (!"enroll".equals(op)) return;
        if (r.kind != NtkController.Result.Kind.OK) {
            mResult.setText("Not enrolled: " + r.message + "\nTap Enroll again to retry.");
            return;
        }
        final JSONObject o = r.output;
        final boolean ready = o.optBoolean("ready");
        final String summary = String.format(Locale.ROOT, "Session sealed into the enclave. The fingerprint has %d sessions and %d key taps.",
                o.optInt("sessions"), o.optLong("taps"));
        if (mIndex < 2) {
            mResult.setText(summary);
            showPrompt(mIndex + 1);
        } else if (ready) {
            mPrompts.setVisibility(View.GONE);
            mDone.setVisibility(View.VISIBLE);
            mDoneDetail.setText(summary + "\nNo fingerprint data came back to this phone. Now type anywhere with NTK and tap Sign.");
            final InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.hideSoftInputFromWindow(mFields[mIndex].getWindowToken(), 0);
        } else {
            mResult.setText(summary + "\nNot ready yet: type one more text in this field and tap Enroll.");
            mFields[mIndex].setText("");
        }
    }
}

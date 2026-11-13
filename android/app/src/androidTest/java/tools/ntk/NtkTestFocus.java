package tools.ntk;

import android.app.Activity;
import android.view.View;
import android.widget.EditText;

import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;

import java.util.Collection;

/** Finds the text field that has focus in the resumed activity (main thread only). */
final class NtkTestFocus {
    private NtkTestFocus() {}

    static View focusedEditor() {
        final Collection<Activity> resumed = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED);
        for (Activity a : resumed) {
            final View f = a.getCurrentFocus();
            if (f instanceof EditText) return f;
        }
        return null;
    }
}

package tools.ntk.ui;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The NTK mark's drawables (from brand/build.mjs) paint the orange lines, then
 * the gaps between them in the background they sit on: VectorDrawable has no
 * masks. So each must carry its theme's ntk_orange and ntk_background exactly.
 * If this fails, rebuild the brand (cd brand && node build.mjs) and copy
 * brand/out/android/drawable/ntk_badge_*.xml into res/drawable/.
 */
public class BadgeDrawableTest {
    @Test
    public void lightDrawableMatchesTheLightTheme() throws IOException {
        check("drawable/ntk_badge_light.xml", "values/colors-ntk.xml");
    }

    @Test
    public void darkDrawableMatchesTheDarkTheme() throws IOException {
        check("drawable/ntk_badge_dark.xml", "values-night/colors-ntk.xml");
    }

    private static void check(String drawable, String colours) throws IOException {
        final List<String> fills = new ArrayList<>();
        final Matcher m = Pattern.compile("android:fillColor=\"(#[0-9A-Fa-f]{6,8})\"").matcher(read(drawable));
        while (m.find()) fills.add(argb(m.group(1)));
        final String theme = read(colours);
        assertEquals(drawable + ": two paths, the lines and then the gaps", 2, fills.size());
        assertEquals(drawable + ": the lines are ntk_orange", colour(theme, "ntk_orange"), fills.get(0));
        assertEquals(drawable + ": the gaps are ntk_background", colour(theme, "ntk_background"), fills.get(1));
    }

    private static String read(String res) throws IOException {
        return new String(Files.readAllBytes(Paths.get("src", "main", "res", res)), StandardCharsets.UTF_8);
    }

    private static String colour(String xml, String name) {
        final Matcher m = Pattern.compile("<color name=\"" + name + "\">(#[0-9A-Fa-f]{6,8})</color>").matcher(xml);
        assertTrue(name + " is defined", m.find());
        return argb(m.group(1));
    }

    private static String argb(String hex) {
        final String h = hex.substring(1).toUpperCase(Locale.ROOT);
        return h.length() == 6 ? "FF" + h : h;
    }
}

package tools.ntk;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * The first-run screen shows the Terms of use and the Privacy notice from
 * res/raw/ntk_terms.txt (a plain-text copy of web/terms/ and web/privacy/). It
 * must name both pages and be the version the app asks users to accept:
 * raise Terms.VERSION together with the text.
 */
public class TermsTextTest {
    @Test
    public void bundledTermsAreTheVersionTheAppAsksFor() throws IOException {
        final String t = new String(Files.readAllBytes(Paths.get("src", "main", "res", "raw", "ntk_terms.txt")),
                StandardCharsets.UTF_8);
        assertTrue("names the terms page", t.startsWith("Terms of use: https://ntk.tools/terms/\n"));
        assertTrue("names the privacy page", t.contains("Privacy notice: https://ntk.tools/privacy/"));
        assertTrue("is terms version " + Terms.VERSION, t.contains("Terms version " + Terms.VERSION + "."));
        assertTrue("has the privacy notice", t.contains("PRIVACY NOTICE"));
    }
}

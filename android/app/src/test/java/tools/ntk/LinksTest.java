package tools.ntk;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * The addresses the app opens. Expected values come from verifyUrl() in
 * web/lib/ntk-verify.js (run with Node), so the button, the selection menu and
 * the web pages build the same link for the same text.
 */
public class LinksTest {
    @Test
    public void verifyUrlMatchesTheWebLibrary() {
        assertEquals("https://ntk.tools/e65ee28db5#t=VGhpcyByZXBseSB3YXMgdHlwZWQgYnkgbWUsIGEgaHVtYW4sIG9uIG15IG93biBwaG9uZSwgb25lIGtleSBhdCBhIHRpbWUuIA",
                Links.verifyUrl("https://ntk.tools/", "e65ee28db5",
                        "This reply was typed by me, a human, on my own phone, one key at a time. "));
        assertEquals("https://ntk.tools/0123456789#t=R3LDvMOfZSDwn5GLIOKAlCBvaz8K",
                Links.verifyUrl("https://ntk.tools/", "0123456789", "Grüße 👋 — ok?\n"));
        assertEquals("https://ntk.tools/0123456789", Links.verifyUrl("https://ntk.tools/", "0123456789", ""));
        assertEquals("http://10.0.2.2:8080/e65ee28db5#t=eA", Links.verifyUrl("http://10.0.2.2:8080/", "e65ee28db5", "x"));
        assertEquals("https://ntk.tools/0123456789", Links.verifyUrl(null, "0123456789", null));
    }

    @Test
    public void base64UrlHasNoPadding() {
        assertEquals("YQ", Links.base64Url("a"));
        assertEquals("YWI", Links.base64Url("ab"));
        assertEquals("YWJj", Links.base64Url("abc"));
        assertEquals("w7vDvw", Links.base64Url("ûÿ"));
        assertEquals("w7w_", Links.base64Url("ü?")); // base64 "w7w/"
        assertEquals("fn5-", Links.base64Url("~~~")); // base64 "fn5+"
    }

    @Test
    public void urlEncodeIsEncodeURIComponent() {
        // encodeURIComponent results from Node.
        assertEquals("ed25519%3A9fXr3kQ2", Links.urlEncode("ed25519:9fXr3kQ2"));
        assertEquals("ntk%3A%2F%2Fauth", Links.urlEncode("ntk://auth"));
        assertEquals("a%20b%2Bc%2F%C3%A9!~*()_-.'", Links.urlEncode("a b+c/é!~*()_-.'"));
    }

    @Test
    public void loginUrlFollowsTheLoginPageContract() {
        assertEquals("https://ntk.tools/login#pk=ed25519%3A9fXr3kQ2&return=ntk%3A%2F%2Fauth&network=testnet",
                Links.loginUrl("https://ntk.tools/", "ed25519:9fXr3kQ2", Network.TESTNET));
        assertEquals("https://ntk.tools/login#pk=ed25519%3A9fXr3kQ2&return=ntk%3A%2F%2Fauth&network=mainnet",
                Links.loginUrl("https://ntk.tools/", "ed25519:9fXr3kQ2", Network.MAINNET));
    }
}

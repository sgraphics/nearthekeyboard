package tools.ntk;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The DONATE ribbon's amounts and links match the page (web/login/src/donate-model.js). */
public class DonateTest {
    @Test
    public void offersFiveTwentyFiveFifty() {
        assertArrayEquals(new int[] {5, 25, 50}, Donate.AMOUNTS);
        assertEquals("DONATE", Donate.LABEL);
        assertTrue(Donate.THANKS.startsWith("Thank you for your support."));
        assertTrue(Donate.THANKS.endsWith("NTK Team"));
    }

    @Test
    public void linksOnlyTheOfferedAmounts() {
        assertEquals("https://ntk.tools/donate/#amount=5", Donate.url(5));
        assertEquals("https://ntk.tools/donate/#amount=25", Donate.url(25));
        assertEquals("https://ntk.tools/donate/#amount=50", Donate.url(50));
        for (final int other : new int[] {0, 1, 7, 500, -5}) assertNull(Donate.url(other));
    }
}

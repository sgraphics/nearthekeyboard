package tools.ntk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import rkr.simplekeyboard.inputmethod.BuildConfig;
import tools.ntk.net.EnclaveClient;

/** The network configuration (Network) and how the app picks one. */
public class NetworkTest {
    @Test
    public void testnetIsTheDefaultAndWorksAsBefore() {
        assertSame(Network.TESTNET, Network.DEFAULT_NETWORK);
        assertTrue("the default network must be usable", Network.DEFAULT_NETWORK.available());
        final Network t = Network.TESTNET;
        assertEquals("testnet", t.id);
        assertEquals("https://ntk.tools/api", t.relay);
        assertEquals("nearthekeyboard.testnet/ntk", t.project());
        assertEquals("nearthekeyboard.testnet", t.projectOwner);
        assertEquals("https://rpc.testnet.fastnear.com", t.rpc);
        assertEquals("ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG", t.stampPk);
        assertEquals("4443a5935e077902ff3afc6a4d188c53168b8ec9bd9b0b847b4d1006ab95b729", t.transportPkHex);
        assertTrue(t.hasFaucet());
        assertEquals("the login kept before networks", "ntk_account", t.accountPrefs);
    }

    @Test
    public void mainnetIsConfiguredAndWaitsForItsKeys() {
        final Network m = Network.MAINNET;
        assertEquals("mainnet", m.id);
        assertEquals("https://ntk.tools/api/mainnet", m.relay);
        assertEquals("nearthekeyboard.near/ntk", m.project());
        assertEquals("https://rpc.mainnet.fastnear.com", m.rpc);
        assertFalse("no faucet on mainnet", m.hasFaucet());
        assertNotEquals("each network keeps its own login", Network.TESTNET.accountPrefs, m.accountPrefs);
        assertEquals(Network.MAINNET_STAMP_PK, m.stampPk);
        assertEquals(Network.MAINNET_TRANSPORT_PK_HEX, m.transportPkHex);
        // Fill in both keys, or neither; well-formed when filled in.
        assertEquals("both mainnet keys or neither", m.stampPk == null, m.transportPkHex == null);
        assertEquals(m.stampPk != null, m.available());
        if (m.available()) {
            assertTrue(m.stampPk, m.stampPk.matches("ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}"));
            assertTrue(m.transportPkHex, m.transportPkHex.matches("[0-9a-f]{64}"));
        }
    }

    @Test
    public void aStoredChoiceIsUsedOnlyWhenThatNetworkIsAvailable() {
        assertSame(Network.DEFAULT_NETWORK, Network.select(null));
        assertSame(Network.DEFAULT_NETWORK, Network.select("devnet"));
        assertSame(Network.TESTNET, Network.select("testnet"));
        assertSame(Network.MAINNET.available() ? Network.MAINNET : Network.DEFAULT_NETWORK, Network.select("mainnet"));
        assertSame(Network.MAINNET, Network.byId("mainnet"));
        assertNull(Network.byId("devnet"));
    }

    @Test
    public void callsGoToTheNetworksRelayOrOutLayer() {
        assertEquals("https://ntk.tools/api/call", EnclaveClient.relay(Network.TESTNET.relay).callUrl());
        assertEquals("https://ntk.tools/api/mainnet/call", EnclaveClient.relay(Network.MAINNET.relay).callUrl());
        assertEquals("https://ntk.tools/api/mainnet/calls/c1", EnclaveClient.relay(Network.MAINNET.relay).pollUrl("c1"));
        assertEquals("https://testnet-api.outlayer.ai/call/nearthekeyboard.testnet/ntk",
                EnclaveClient.direct("k", Network.TESTNET).callUrl());
        assertEquals("https://api.outlayer.ai/call/nearthekeyboard.near/ntk", EnclaveClient.direct("k", Network.MAINNET).callUrl());
        assertEquals("https://api.outlayer.ai/calls/c1", EnclaveClient.direct("k", Network.MAINNET).pollUrl("c1"));
    }

    @Test
    public void debugBuildsTakeEachNetworksPaymentKeyFromLocalProperties() {
        assertEquals(BuildConfig.NTK_PAYMENT_KEY, Network.TESTNET.debugPaymentKey());
        assertEquals(BuildConfig.NTK_PAYMENT_KEY_MAINNET, Network.MAINNET.debugPaymentKey());
    }
}

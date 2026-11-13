package tools.ntk;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.security.SecureRandom;

/** Sealing, sealed digest, NEP-413 hash and signature, and stamp verification against crypto-v1.json. */
public class CryptoVectorsTest {
    private static JSONObject v() throws Exception {
        return TextRuleTest.vectors("crypto-v1.json");
    }

    @Test
    public void sealMatchesTheVector() throws Exception {
        final JSONObject s = v().getJSONObject("seal");
        final byte[] transportSeed = Codec.unhex(s.getString("transport_seed_hex"));
        final byte[] transportPk = NtkCrypto.x25519Public(transportSeed);
        assertEquals(s.getString("transport_pk_hex"), Codec.hex(transportPk));
        final byte[] eph = Codec.unhex(s.getString("eph_secret_hex"));
        assertEquals(s.getString("epk_hex"), Codec.hex(NtkCrypto.x25519Public(eph)));
        final byte[] shared = NtkCrypto.x25519Shared(eph, transportPk);
        assertEquals(s.getString("shared_hex"), Codec.hex(shared));
        final byte[] epk = NtkCrypto.x25519Public(eph);
        assertEquals(s.getString("key_hex"), Codec.hex(NtkCrypto.transportKey(shared, epk, transportPk)));
        assertEquals(s.getString("aad"), new String(NtkCrypto.aad(s.getString("op"), s.getString("account")), "UTF-8"));

        final NtkCrypto.Sealed sealed = NtkCrypto.seal(transportPk, Codec.utf8(s.getString("plaintext")),
                s.getString("op"), s.getString("account"), eph, Codec.unhex(s.getString("nonce_hex")));
        assertEquals(s.getString("epk_hex"), Codec.hex(sealed.epk));
        assertEquals(s.getString("nonce_hex"), Codec.hex(sealed.nonce));
        assertEquals(s.getString("ct_b64"), Codec.b64(sealed.ct));
        assertEquals(s.getString("sealed_digest_hex"), sealed.digestHex());

        // It opens for the same operation and account only.
        assertArrayEquals(Codec.utf8(s.getString("plaintext")),
                NtkCrypto.open(transportSeed, sealed, s.getString("op"), s.getString("account")));
        boolean opened;
        try {
            NtkCrypto.open(transportSeed, sealed, "enroll", s.getString("account"));
            opened = true;
        } catch (IllegalStateException e) {
            opened = false;
        }
        assertFalse("a stamp session must not open as enroll", opened);
    }

    @Test
    public void freshSealsDifferAndOpen() throws Exception {
        final byte[] secret = new byte[32];
        secret[0] = 7;
        final byte[] pk = NtkCrypto.x25519Public(secret);
        final SecureRandom r = new SecureRandom();
        final NtkCrypto.Sealed a = NtkCrypto.seal(pk, Codec.utf8("{}"), "stamp", "a.testnet", r);
        final NtkCrypto.Sealed b = NtkCrypto.seal(pk, Codec.utf8("{}"), "stamp", "a.testnet", r);
        assertFalse(Codec.hex(a.epk).equals(Codec.hex(b.epk)));
        assertArrayEquals(Codec.utf8("{}"), NtkCrypto.open(secret, a, "stamp", "a.testnet"));
        assertTrue(a.toJson().startsWith("{\"epk\":\""));
    }

    @Test
    public void nep413MatchesTheVector() throws Exception {
        final JSONObject n = v().getJSONObject("nep413");
        final byte[] seed = Codec.unhex(n.getString("seed_hex"));
        final byte[] pub = NtkCrypto.ed25519Public(seed);
        assertEquals(n.getString("public_key"), Codec.ed25519String(pub));
        assertArrayEquals(pub, Codec.ed25519Key(n.getString("public_key")));
        final byte[] nonce = Codec.unb64(n.getString("nonce_b64"));
        final byte[] hash = NtkCrypto.nep413Hash(n.getString("message"), nonce, n.getString("recipient"));
        assertEquals(n.getString("hash_hex"), Codec.hex(hash));
        final byte[] sig = NtkCrypto.ed25519Sign(seed, hash);
        assertEquals(n.getString("signature_b64"), Codec.b64(sig));
        assertTrue(NtkCrypto.ed25519Verify(pub, hash, sig));
        hash[0] ^= 1;
        assertFalse(NtkCrypto.ed25519Verify(pub, hash, sig));
    }

    @Test
    public void authMessageIsTheSignedString() throws Exception {
        final JSONObject n = v().getJSONObject("nep413");
        final JSONObject s = v().getJSONObject("seal");
        final String msg = Auth.message("stamp", "ntk-alice.testnet", s.getString("sealed_digest_hex"), 1794569167000L);
        assertEquals(n.getString("message"), msg);
        final byte[] seed = Codec.unhex(n.getString("seed_hex"));
        final JSONObject auth = new JSONObject(Auth.build(seed, "ntk-alice.testnet", msg, Codec.unb64(n.getString("nonce_b64"))));
        assertEquals(n.getString("signature_b64"), auth.getString("signature"));
        assertEquals(n.getString("public_key"), auth.getString("public_key"));
        assertEquals("near-the-keyboard", auth.getString("recipient"));
        assertEquals(msg, auth.getString("message"));
        assertEquals("ntk-alice.testnet", auth.getString("account_id"));
    }

    @Test
    public void realStampVerifies() throws Exception {
        final JSONObject st = v().getJSONObject("stamp");
        assertEquals(st.getString("sig_sha256_hex"), Codec.hex(Codec.sha256(Codec.unb64(st.getString("sig")))));
        final StampCheck.Result ok = StampCheck.verify(st, Ntk.STAMP_PK, "ntk-alice.testnet", st.getString("text"));
        assertTrue(ok.failure, ok.ok);
        assertEquals("e65ee28db5", ok.id);
        // Surrounding whitespace does not matter for a v1 record; an edited word does.
        assertTrue(StampCheck.verify(st, Ntk.STAMP_PK, null, "  " + st.getString("text") + "\n").ok);
        assertFalse(StampCheck.verify(st, Ntk.STAMP_PK, null, st.getString("text").replace("human", "robot")).ok);
        assertFalse(StampCheck.verify(st, Ntk.STAMP_PK, "someone-else.testnet", st.getString("text")).ok);
        // Another key, an altered record, or a wrong id are refused.
        assertFalse(StampCheck.verify(st, "ed25519:3WTypo2uYrwMHJ5yFFwUPX6T25n39PwNwke7pz22P4Ut", null, null).ok);
        final JSONObject altered = new JSONObject(st.toString());
        altered.put("record", st.getString("record").replace("\"score_pct\":98", "\"score_pct\":99"));
        assertFalse(StampCheck.verify(altered, Ntk.STAMP_PK, null, null).ok);
        final JSONObject wrongId = new JSONObject(st.toString());
        wrongId.put("id", "0000000000");
        assertFalse(StampCheck.verify(wrongId, Ntk.STAMP_PK, null, null).ok);
    }

    @Test
    public void liveV2StampVerifies() throws Exception {
        // Published by enclave 0.2.0 for the demo reply (docs: tag [NTK 26144e35e7]).
        final JSONObject st = TextRuleTest.vectors("stamp-v2-26144e35e7.json");
        final String reply = "I agree with this, and I typed every word myself.";
        final StampCheck.Result ok = StampCheck.verify(st, Ntk.STAMP_PK, "ntk-alice.testnet", reply);
        assertTrue(ok.failure, ok.ok);
        assertEquals("26144e35e7", ok.id);
        assertEquals(2, ok.record.getInt("v"));
        // v2: whitespace runs do not matter, one changed word does.
        assertTrue(StampCheck.verify(st, Ntk.STAMP_PK, null, " I agree  with this,\nand I typed every word myself. ").ok);
        assertFalse(StampCheck.verify(st, Ntk.STAMP_PK, null, reply.replace("every", "each")).ok);
        // What a verifier does with the text before the tag (text rule v2).
        final String post = "@someone said: I agree with this, and I typed every word myself. [NTK 26144e35e7]";
        final int at = post.indexOf("[NTK ");
        assertEquals("26144e35e7", TextRule.findTagId(post));
        assertEquals(reply, TextRule.covered(post.substring(0, at), ok.record.getInt("text_chars"), 2));
    }

    @Test
    public void base58RoundTrips() {
        final byte[] z = new byte[] { 0, 0, 1, 2, (byte) 255 };
        assertArrayEquals(z, Codec.unbase58(Codec.base58(z)));
        assertEquals("11111111111111111111111111111111", Codec.base58(new byte[32]));
        assertArrayEquals(new byte[32], Codec.unbase58("11111111111111111111111111111111"));
    }
}

package tools.ntk;

import org.bouncycastle.crypto.digests.SHA256Digest;
import org.bouncycastle.crypto.generators.HKDFBytesGenerator;
import org.bouncycastle.crypto.modes.ChaCha20Poly1305;
import org.bouncycastle.crypto.params.AEADParameters;
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters;
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters;
import org.bouncycastle.crypto.params.HKDFParameters;
import org.bouncycastle.crypto.params.KeyParameter;
import org.bouncycastle.crypto.signers.Ed25519Signer;
import org.bouncycastle.math.ec.rfc7748.X25519;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.SecureRandom;

/**
 * The cryptography of the NTK protocol (docs/protocol.md), on BouncyCastle:
 * sealing a session to the enclave's X25519 transport key, the sealed digest,
 * the NEP-413 request hash and signature, and stamp signatures.
 */
public final class NtkCrypto {
    private NtkCrypto() {}

    static final byte[] TRANSPORT_INFO = Codec.utf8("ntk/v1/transport");
    public static final String STAMP_DOMAIN = "NTK-STAMP/v1\n";
    /** 2^31 + 413, the NEP-413 tag. */
    static final int NEP413_TAG = (int) 2147484061L;

    /** A session sealed to the enclave: {"epk": hex, "nonce": hex, "ct": base64}. */
    public static final class Sealed {
        public final byte[] epk;
        public final byte[] nonce;
        public final byte[] ct;

        Sealed(final byte[] epk, final byte[] nonce, final byte[] ct) {
            this.epk = epk;
            this.nonce = nonce;
            this.ct = ct;
        }

        /** hex(SHA-256(epk || nonce || ct)): what the signed request commits to. */
        public String digestHex() {
            return Codec.hex(Codec.sha256(epk, nonce, ct));
        }

        public String toJson() {
            return "{\"epk\":" + Json.quote(Codec.hex(epk)) + ",\"nonce\":" + Json.quote(Codec.hex(nonce))
                    + ",\"ct\":" + Json.quote(Codec.b64(ct)) + "}";
        }
    }

    public static byte[] x25519Public(final byte[] secret) {
        final byte[] pk = new byte[32];
        X25519.generatePublicKey(secret, 0, pk, 0);
        return pk;
    }

    public static byte[] x25519Shared(final byte[] secret, final byte[] publicKey) {
        final byte[] out = new byte[32];
        if (!X25519.calculateAgreement(secret, 0, publicKey, 0, out, 0)) {
            throw new IllegalArgumentException("X25519 agreement is all zero");
        }
        return out;
    }

    /** HKDF-SHA256(ikm = shared, salt = epk || transport_pk, info = "ntk/v1/transport"), 32 bytes. */
    public static byte[] transportKey(final byte[] shared, final byte[] epk, final byte[] transportPk) {
        final HKDFBytesGenerator g = new HKDFBytesGenerator(new SHA256Digest());
        g.init(new HKDFParameters(shared, Codec.concat(epk, transportPk), TRANSPORT_INFO));
        final byte[] key = new byte[32];
        g.generateBytes(key, 0, 32);
        return key;
    }

    public static byte[] aad(final String op, final String account) {
        return Codec.utf8("ntk/v1|" + op + "|" + account);
    }

    /** Seal with a fresh ephemeral key and nonce. */
    public static Sealed seal(final byte[] transportPk, final byte[] plaintext, final String op,
            final String account, final SecureRandom random) {
        final byte[] eph = new byte[32];
        final byte[] nonce = new byte[12];
        random.nextBytes(eph);
        random.nextBytes(nonce);
        try {
            return seal(transportPk, plaintext, op, account, eph, nonce);
        } finally {
            java.util.Arrays.fill(eph, (byte) 0);
        }
    }

    /** Seal with a given ephemeral secret and nonce (test vectors). */
    public static Sealed seal(final byte[] transportPk, final byte[] plaintext, final String op,
            final String account, final byte[] ephSecret, final byte[] nonce) {
        final byte[] epk = x25519Public(ephSecret);
        final byte[] shared = x25519Shared(ephSecret, transportPk);
        final byte[] key = transportKey(shared, epk, transportPk);
        final ChaCha20Poly1305 aead = new ChaCha20Poly1305();
        aead.init(true, new AEADParameters(new KeyParameter(key), 128, nonce, aad(op, account)));
        final byte[] ct = new byte[aead.getOutputSize(plaintext.length)];
        final int n = aead.processBytes(plaintext, 0, plaintext.length, ct, 0);
        try {
            aead.doFinal(ct, n);
        } catch (Exception e) {
            throw new IllegalStateException("seal failed", e);
        }
        java.util.Arrays.fill(key, (byte) 0);
        java.util.Arrays.fill(shared, (byte) 0);
        return new Sealed(epk, nonce.clone(), ct);
    }

    /** Opens a sealed session; only used by tests (the enclave is the one that opens). */
    public static byte[] open(final byte[] transportSecret, final Sealed s, final String op, final String account) {
        final byte[] transportPk = x25519Public(transportSecret);
        final byte[] shared = x25519Shared(transportSecret, s.epk);
        final byte[] key = transportKey(shared, s.epk, transportPk);
        final ChaCha20Poly1305 aead = new ChaCha20Poly1305();
        aead.init(false, new AEADParameters(new KeyParameter(key), 128, s.nonce, aad(op, account)));
        final byte[] pt = new byte[aead.getOutputSize(s.ct.length)];
        final int n = aead.processBytes(s.ct, 0, s.ct.length, pt, 0);
        try {
            aead.doFinal(pt, n);
        } catch (Exception e) {
            throw new IllegalStateException("does not open", e);
        }
        return pt;
    }

    private static byte[] u32le(final int v) {
        return ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(v).array();
    }

    private static byte[] borshString(final String s) {
        final byte[] b = Codec.utf8(s);
        return Codec.concat(u32le(b.length), b);
    }

    /** sha256(u32le(2^31+413) || borsh(message) || nonce || borsh(recipient) || 0x00). */
    public static byte[] nep413Hash(final String message, final byte[] nonce32, final String recipient) {
        if (nonce32.length != 32) throw new IllegalArgumentException("NEP-413 nonce must be 32 bytes");
        return Codec.sha256(u32le(NEP413_TAG), borshString(message), nonce32, borshString(recipient), new byte[] { 0 });
    }

    public static byte[] ed25519Public(final byte[] seed32) {
        return new Ed25519PrivateKeyParameters(seed32, 0).generatePublicKey().getEncoded();
    }

    public static byte[] ed25519Sign(final byte[] seed32, final byte[] message) {
        final Ed25519Signer s = new Ed25519Signer();
        s.init(true, new Ed25519PrivateKeyParameters(seed32, 0));
        s.update(message, 0, message.length);
        return s.generateSignature();
    }

    public static boolean ed25519Verify(final byte[] publicKey, final byte[] message, final byte[] signature) {
        if (publicKey == null || publicKey.length != 32 || signature == null || signature.length != 64) return false;
        try {
            final Ed25519Signer s = new Ed25519Signer();
            s.init(false, new Ed25519PublicKeyParameters(publicKey, 0));
            s.update(message, 0, message.length);
            return s.verifySignature(signature);
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** The short public id of a stamp: the first 10 hex characters of SHA-256(signature). */
    public static String stampId(final byte[] signature) {
        return Codec.hex(Codec.sha256(signature)).substring(0, 10);
    }
}

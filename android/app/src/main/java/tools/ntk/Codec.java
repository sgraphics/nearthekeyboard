package tools.ntk;

import org.bouncycastle.crypto.digests.SHA256Digest;
import org.bouncycastle.util.encoders.Base64;
import org.bouncycastle.util.encoders.Hex;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;

/** Encodings used by the NTK protocol: hex, base64 (standard, padded), base58, UTF-8, SHA-256. */
public final class Codec {
    private Codec() {}

    private static final String B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    private static final BigInteger FIFTY_EIGHT = BigInteger.valueOf(58);

    public static byte[] utf8(final String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    public static String hex(final byte[] b) {
        return Hex.toHexString(b);
    }

    public static byte[] unhex(final String s) {
        if (s == null || s.length() % 2 != 0) throw new IllegalArgumentException("not hex");
        return Hex.decode(s);
    }

    public static String b64(final byte[] b) {
        return Base64.toBase64String(b);
    }

    public static byte[] unb64(final String s) {
        return Base64.decode(s);
    }

    public static byte[] sha256(final byte[]... parts) {
        final SHA256Digest d = new SHA256Digest();
        for (final byte[] p : parts) d.update(p, 0, p.length);
        final byte[] out = new byte[32];
        d.doFinal(out, 0);
        return out;
    }

    public static String sha256Hex(final String s) {
        return hex(sha256(utf8(s)));
    }

    public static byte[] concat(final byte[]... parts) {
        int n = 0;
        for (final byte[] p : parts) n += p.length;
        final byte[] out = new byte[n];
        int o = 0;
        for (final byte[] p : parts) {
            System.arraycopy(p, 0, out, o, p.length);
            o += p.length;
        }
        return out;
    }

    public static String base58(final byte[] b) {
        BigInteger n = new BigInteger(1, b);
        final StringBuilder sb = new StringBuilder();
        while (n.signum() > 0) {
            final BigInteger[] qr = n.divideAndRemainder(FIFTY_EIGHT);
            sb.append(B58.charAt(qr[1].intValue()));
            n = qr[0];
        }
        for (final byte x : b) {
            if (x != 0) break;
            sb.append('1');
        }
        return sb.reverse().toString();
    }

    public static byte[] unbase58(final String s) {
        BigInteger n = BigInteger.ZERO;
        for (int i = 0; i < s.length(); i++) {
            final int d = B58.indexOf(s.charAt(i));
            if (d < 0) throw new IllegalArgumentException("not base58");
            n = n.multiply(FIFTY_EIGHT).add(BigInteger.valueOf(d));
        }
        byte[] body = n.toByteArray();
        if (body.length > 1 && body[0] == 0) {
            final byte[] t = new byte[body.length - 1];
            System.arraycopy(body, 1, t, 0, t.length);
            body = t;
        } else if (n.signum() == 0) {
            body = new byte[0];
        }
        int zeros = 0;
        while (zeros < s.length() && s.charAt(zeros) == '1') zeros++;
        final byte[] out = new byte[zeros + body.length];
        System.arraycopy(body, 0, out, zeros, body.length);
        return out;
    }

    /** {@code ed25519:<base58>} to 32 bytes. */
    public static byte[] ed25519Key(final String s) {
        if (s == null || !s.startsWith("ed25519:")) throw new IllegalArgumentException("not ed25519:<base58>");
        final byte[] k = unbase58(s.substring(8));
        if (k.length != 32) throw new IllegalArgumentException("ed25519 key is not 32 bytes");
        return k;
    }

    public static String ed25519String(final byte[] pk) {
        return "ed25519:" + base58(pk);
    }
}

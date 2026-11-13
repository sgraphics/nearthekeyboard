package tools.ntk;

/** The request signature: NEP-413 (NEAR wallets' signMessage) over the NTK message. */
public final class Auth {
    private Auth() {}

    /** {"ntk":1,"op":…,"account":…,"payload":…,"ts":…}: the exact string that is signed and sent. */
    public static String message(String op, String account, String payloadHex, long ts) {
        return "{\"ntk\":1,\"op\":" + Json.quote(op) + ",\"account\":" + Json.quote(account)
                + ",\"payload\":" + Json.quote(payloadHex == null ? "" : payloadHex) + ",\"ts\":" + ts + "}";
    }

    /** The {@code auth} object, as JSON. */
    public static String build(byte[] seed32, String account, String message, byte[] nonce32) {
        final byte[] pub = NtkCrypto.ed25519Public(seed32);
        final byte[] sig = NtkCrypto.ed25519Sign(seed32, NtkCrypto.nep413Hash(message, nonce32, Ntk.RECIPIENT));
        return "{\"account_id\":" + Json.quote(account)
                + ",\"public_key\":" + Json.quote(Codec.ed25519String(pub))
                + ",\"signature\":" + Json.quote(Codec.b64(sig))
                + ",\"nonce\":" + Json.quote(Codec.b64(nonce32))
                + ",\"message\":" + Json.quote(message)
                + ",\"recipient\":" + Json.quote(Ntk.RECIPIENT) + "}";
    }

    /** The whole enclave input {"operation", "auth", "sealed"} as JSON. */
    public static String input(String op, String authJson, NtkCrypto.Sealed sealed) {
        final StringBuilder b = new StringBuilder("{\"operation\":").append(Json.quote(op));
        if (authJson != null) b.append(",\"auth\":").append(authJson);
        if (sealed != null) b.append(",\"sealed\":").append(sealed.toJson());
        return b.append('}').toString();
    }
}

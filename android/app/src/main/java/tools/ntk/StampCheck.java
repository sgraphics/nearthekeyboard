package tools.ntk;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * The keyboard's own check of a stamp the enclave returned, before anything is
 * inserted: signed by the pinned stamp key, the id belongs to the signature,
 * the record names this project and account, and its text hash is the hash of
 * the text the session replays to (text rule v2, or v1 for older records).
 */
public final class StampCheck {
    private StampCheck() {}

    public static final class Result {
        public final boolean ok;
        public final String failure;
        public final String id;
        public final JSONObject record;

        Result(boolean ok, String failure, String id, JSONObject record) {
            this.ok = ok;
            this.failure = failure;
            this.id = id;
            this.record = record;
        }
    }

    private static Result fail(String why, String id, JSONObject record) {
        return new Result(false, why, id, record);
    }

    /**
     * @param stamp the published stamp {"id", "record", "sig", "pk"}
     * @param pinnedPk the network's pinned stamp key (Network.stampPk)
     * @param project the network's NTK project, "owner/name" (Network.project())
     * @param account the account the request was signed for, or null to skip that check
     * @param replayed the text the sealed session replays to, or null to skip the text check
     */
    public static Result verify(JSONObject stamp, String pinnedPk, String project, String account, String replayed) {
        final String id = stamp.optString("id", "");
        final String recordJson = stamp.optString("record", "");
        final String pk = stamp.optString("pk", "");
        if (!pinnedPk.equals(pk)) return fail("the stamp is not signed with the pinned NTK key", id, null);
        final byte[] sig;
        try {
            sig = Codec.unb64(stamp.optString("sig", ""));
        } catch (RuntimeException e) {
            return fail("the stamp signature is not base64", id, null);
        }
        final boolean sigOk = NtkCrypto.ed25519Verify(Codec.ed25519Key(pinnedPk),
                Codec.utf8(NtkCrypto.STAMP_DOMAIN + recordJson), sig);
        if (!sigOk) return fail("the stamp signature does not verify", id, null);
        if (!NtkCrypto.stampId(sig).equals(id)) return fail("the stamp id does not belong to its signature", id, null);
        final JSONObject record;
        try {
            record = new JSONObject(recordJson);
        } catch (JSONException e) {
            return fail("the stamp record is not JSON", id, null);
        }
        if (!"ntk-stamp".equals(record.optString("kind")) || !project.equals(record.optString("project"))) {
            return fail("the stamp was not issued by the NTK project", id, record);
        }
        if (account != null && !account.equals(record.optString("account"))) {
            return fail("the stamp names another account", id, record);
        }
        if (replayed != null) {
            final int v = record.optInt("v", 1);
            final String text = TextRule.forRecord(replayed, v);
            if (!Codec.sha256Hex(text).equals(record.optString("text_sha256"))) {
                return fail("the stamped text is not the text typed in this field", id, record);
            }
            if (record.optInt("text_chars", -1) != TextRule.charCount(text)) {
                return fail("the stamp covers a different number of characters", id, record);
            }
        }
        return new Result(true, null, id, record);
    }
}

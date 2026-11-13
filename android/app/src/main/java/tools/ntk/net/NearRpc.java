package tools.ntk.net;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;

import tools.ntk.Json;
import tools.ntk.Ntk;

/** NEAR testnet: the RPC queries the keyboard needs, and the testnet faucet. */
public final class NearRpc {
    private NearRpc() {}

    private static JSONObject query(String paramsJson) throws IOException {
        final String body = "{\"jsonrpc\":\"2.0\",\"id\":\"ntk\",\"method\":\"query\",\"params\":" + paramsJson + "}";
        final Http.Response r = Http.postJson(Ntk.RPC_URL, body, null, 30_000);
        if (!r.ok()) throw new IOException("NEAR RPC HTTP " + r.code + ": " + Http.brief(r.body));
        try {
            return new JSONObject(r.body);
        } catch (JSONException e) {
            throw new IOException("NEAR RPC answer is not JSON: " + Http.brief(r.body));
        }
    }

    public static boolean accountExists(String accountId) throws IOException {
        final JSONObject o = query("{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":"
                + Json.quote(accountId) + "}");
        return o.optJSONObject("result") != null && o.optJSONObject("error") == null;
    }

    /** The access key's permission: "FullAccess", a {"FunctionCall": {...}} object, or null when the key is not on the account. */
    public static Object accessKeyPermission(String accountId, String publicKey) throws IOException {
        final JSONObject o = query("{\"request_type\":\"view_access_key\",\"finality\":\"final\",\"account_id\":"
                + Json.quote(accountId) + ",\"public_key\":" + Json.quote(publicKey) + "}");
        final JSONObject result = o.optJSONObject("result");
        if (result == null || result.has("error")) return null;
        return result.opt("permission");
    }

    /** Asks the public testnet faucet to create a funded top-level account with this key. */
    public static void createTestnetAccount(String accountId, String publicKey) throws IOException {
        final String body = "{\"newAccountId\":" + Json.quote(accountId) + ",\"newAccountPublicKey\":" + Json.quote(publicKey) + "}";
        final Http.Response r = Http.postJson(Ntk.FAUCET_URL, body, null, 60_000);
        if (!r.ok()) throw new IOException("testnet faucet HTTP " + r.code + ": " + Http.brief(r.body));
    }
}

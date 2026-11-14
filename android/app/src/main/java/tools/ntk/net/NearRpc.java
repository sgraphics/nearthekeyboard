package tools.ntk.net;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;

import tools.ntk.Json;
import tools.ntk.Network;

/** NEAR: the RPC queries the keyboard needs, on a network, and the testnet faucet. */
public final class NearRpc {
    private NearRpc() {}

    private static JSONObject query(Network network, String paramsJson) throws IOException {
        final String body = "{\"jsonrpc\":\"2.0\",\"id\":\"ntk\",\"method\":\"query\",\"params\":" + paramsJson + "}";
        final Http.Response r = Http.postJson(network.rpc, body, null, 30_000);
        if (!r.ok()) throw new IOException("NEAR RPC HTTP " + r.code + ": " + Http.brief(r.body));
        try {
            return new JSONObject(r.body);
        } catch (JSONException e) {
            throw new IOException("NEAR RPC answer is not JSON: " + Http.brief(r.body));
        }
    }

    public static boolean accountExists(Network network, String accountId) throws IOException {
        final JSONObject o = query(network, "{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":"
                + Json.quote(accountId) + "}");
        return o.optJSONObject("result") != null && o.optJSONObject("error") == null;
    }

    /** The access key's permission: "FullAccess", a {"FunctionCall": {...}} object, or null when the key is not on the account. */
    public static Object accessKeyPermission(Network network, String accountId, String publicKey) throws IOException {
        final JSONObject o = query(network, "{\"request_type\":\"view_access_key\",\"finality\":\"final\",\"account_id\":"
                + Json.quote(accountId) + ",\"public_key\":" + Json.quote(publicKey) + "}");
        final JSONObject result = o.optJSONObject("result");
        if (result == null || result.has("error")) return null;
        return result.opt("permission");
    }

    /** Asks the network's faucet (testnet only) to create a funded top-level account with this key. */
    public static void createTestnetAccount(Network network, String accountId, String publicKey) throws IOException {
        if (!network.hasFaucet()) throw new IOException("there is no faucet on " + network.id);
        final String body = "{\"newAccountId\":" + Json.quote(accountId) + ",\"newAccountPublicKey\":" + Json.quote(publicKey) + "}";
        final Http.Response r = Http.postJson(network.faucetUrl, body, null, 60_000);
        if (!r.ok()) throw new IOException("testnet faucet HTTP " + r.code + ": " + Http.brief(r.body));
    }
}

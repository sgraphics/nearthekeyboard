package tools.ntk.net;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Collections;
import java.util.Map;

import tools.ntk.Ntk;

/**
 * Calls the NTK enclave asynchronously (docs/protocol.md, "Calling the enclave"):
 * start a call, then poll it every 2 s for up to 6 min.
 *
 * Through the relay (release builds): POST {relay}/call {"input"} and GET
 * {relay}/calls/{id}. Directly (debug builds only, with a testnet payment key
 * from local.properties): POST {api}/call/{owner}/{project} {"input", "async": true}
 * and GET {api}/calls/{id}, with the X-Payment-Key header.
 */
public final class EnclaveClient {
    public interface Progress {
        /** Called from the worker thread while waiting: status ("pending", "running"), elapsed ms. */
        void onProgress(String status, long elapsedMs, String callId);

        boolean isCancelled();
    }

    public static final class CallException extends Exception {
        public final String code;

        public CallException(String message, String code) {
            super(message);
            this.code = code;
        }
    }

    private final String mRelay;
    private final String mPaymentKey;

    private EnclaveClient(String relay, String paymentKey) {
        mRelay = relay;
        mPaymentKey = paymentKey;
    }

    public static EnclaveClient relay(String baseUrl) {
        return new EnclaveClient(baseUrl.replaceAll("/+$", ""), null);
    }

    public static EnclaveClient direct(String paymentKey) {
        return new EnclaveClient(null, paymentKey);
    }

    public boolean isDirect() {
        return mPaymentKey != null;
    }

    public String describe() {
        return isDirect() ? "OutLayer directly (debug)" : mRelay;
    }

    private Map<String, String> headers() {
        return isDirect() ? Collections.singletonMap("X-Payment-Key", mPaymentKey) : null;
    }

    /** Starts an asynchronous call and returns its id. */
    public String start(String inputJson) throws IOException, CallException {
        final String url;
        final String body;
        if (isDirect()) {
            url = Ntk.OUTLAYER_API + "/call/" + Ntk.PROJECT_OWNER + "/" + Ntk.PROJECT_NAME;
            body = "{\"input\":" + inputJson + ",\"async\":true}";
        } else {
            url = mRelay + "/call";
            body = "{\"input\":" + inputJson + "}";
        }
        final Http.Response r = Http.postJson(url, body, headers(), 60_000);
        if (!r.ok()) throw new CallException("the enclave call was not accepted (HTTP " + r.code + "): " + Http.brief(r.body), "HTTP_" + r.code);
        try {
            final JSONObject o = new JSONObject(r.body);
            final String id = o.optString("call_id", "");
            if (id.isEmpty()) throw new CallException("no call id in the answer: " + Http.brief(r.body), "NO_CALL_ID");
            return id;
        } catch (JSONException e) {
            throw new CallException("the answer is not JSON: " + Http.brief(r.body), "BAD_JSON");
        }
    }

    /** One poll: OutLayer's call object. */
    public JSONObject poll(String callId) throws IOException, CallException {
        final String url = (isDirect() ? Ntk.OUTLAYER_API : mRelay) + "/calls/" + callId;
        final Http.Response r = Http.get(url, headers(), 30_000);
        if (!r.ok()) throw new CallException("polling failed (HTTP " + r.code + "): " + Http.brief(r.body), "HTTP_" + r.code);
        try {
            return new JSONObject(r.body);
        } catch (JSONException e) {
            throw new CallException("the poll answer is not JSON: " + Http.brief(r.body), "BAD_JSON");
        }
    }

    /** Polls until the call completes; returns the enclave's output (parsed when it is a JSON string). */
    public JSONObject await(String callId, long timeoutMs, Progress progress)
            throws IOException, CallException, InterruptedException {
        final long t0 = System.currentTimeMillis();
        int transientErrors = 0;
        while (true) {
            if (progress != null && progress.isCancelled()) throw new CallException("cancelled", "CANCELLED");
            final long elapsed = System.currentTimeMillis() - t0;
            if (elapsed > timeoutMs) {
                throw new CallException("no answer from the enclave after " + (timeoutMs / 60000) + " minutes", "TIMEOUT");
            }
            JSONObject call = null;
            try {
                call = poll(callId);
                transientErrors = 0;
            } catch (IOException e) {
                if (++transientErrors > 5) throw e;
            }
            if (call != null) {
                final String status = call.optString("status", "");
                if ("completed".equals(status)) return output(call);
                if ("failed".equals(status)) {
                    final Object err = call.opt("error");
                    throw new CallException("the enclave call failed: " + Http.brief(String.valueOf(err != null ? err : call)), "CALL_FAILED");
                }
                if (progress != null) progress.onProgress(status, elapsed, callId);
            }
            Thread.sleep(Ntk.POLL_INTERVAL_MS);
        }
    }

    private static JSONObject output(JSONObject call) throws CallException {
        final Object out = call.opt("output");
        if (out instanceof JSONObject) return (JSONObject) out;
        if (out instanceof String) {
            try {
                return new JSONObject((String) out);
            } catch (JSONException e) {
                throw new CallException("the enclave output is not JSON: " + Http.brief((String) out), "BAD_OUTPUT");
            }
        }
        throw new CallException("the call completed without output", "NO_OUTPUT");
    }

    /** The enclave's info output: through the relay's cached GET /info, or as a call. */
    public JSONObject info(long timeoutMs, Progress progress) throws IOException, CallException, InterruptedException {
        if (!isDirect()) {
            final Http.Response r = Http.get(mRelay + "/info", null, 30_000);
            if (r.ok()) {
                try {
                    final JSONObject o = new JSONObject(r.body);
                    final Object out = o.opt("output");
                    if (out instanceof JSONObject) return (JSONObject) out;
                    if (out instanceof String) return new JSONObject((String) out);
                } catch (JSONException e) {
                    // fall through to a call
                }
            }
        }
        return await(start("{\"operation\":\"info\"}"), timeoutMs, progress);
    }
}

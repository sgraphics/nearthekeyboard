//! Host glue: the OutLayer interfaces (keystore keys, sealed storage, RPC, env).
//!
//! # Errors
//!
//! An error answer is `{"ok": false, "error": "<text>", "code": "<code>"}`. The
//! text is for people and may be reworded; the code is stable, so the keyboard
//! can show its own message. The codes:
//!
//! | Code | Meaning |
//! |---|---|
//! | `E_INPUT` | The input is not `{"operation", "auth", "sealed"}` JSON. |
//! | `E_OPERATION` | No such operation. |
//! | `E_PAYER` | The call was not paid by the project owner. Only the owner's (the relay's) calls touch fingerprints. |
//! | `E_AUTH_MISSING` | The operation needs `auth`. |
//! | `E_AUTH_FORMAT` | `auth.public_key`, `auth.nonce` or `auth.signature` is malformed. |
//! | `E_AUTH_RECIPIENT` | `auth.recipient` is not `near-the-keyboard`. |
//! | `E_AUTH_MESSAGE` | `auth.message` is not an NTK message for this operation and account. |
//! | `E_AUTH_PAYLOAD` | `auth.message` does not commit to this sealed session. |
//! | `E_AUTH_CLOCK` | `ts` is more than 10 minutes from the enclave's clock. |
//! | `E_AUTH_SIGNATURE` | The NEP-413 signature does not verify. |
//! | `E_AUTH_KEY_NOT_FOUND` | The key is not an access key of the account. |
//! | `E_AUTH_KEY_OTHER_APP` | The key is a function-call key the account issued to another app. |
//! | `E_RPC` | NEAR RPC did not say whether the key belongs to the account. A fresh request may pass. |
//! | `E_SEALED_MISSING` | The operation needs a sealed session. |
//! | `E_SEALED_FORMAT` | `sealed.epk`, `sealed.nonce` or `sealed.ct` is malformed. |
//! | `E_SEALED_OPEN` | The session does not open: sealed to another key, for another operation or account, or altered. |
//! | `E_SESSION_INVALID` | The opened session is not session JSON, or its `mode` is not `compose` or `copy`. |
//! | `E_REPLAY` | `ts` is not after the account's last accepted `enroll` or `stamp`: a replayed or out-of-order request. Sign a fresh one. |
//! | `E_ENROLL_SHORT` | An enrollment session with fewer than `min_enroll_taps` key taps. |
//! | `E_NOT_ENROLLED` | No fingerprint for this account. |
//! | `E_NOT_READY` | The fingerprint needs more sessions or key taps. |
//! | `E_RATE_LIMIT` | Too many failed stamps in the last 24 hours. |
//! | `E_STAMP_ID` | Every id tried for the stamp was taken; nothing was published. |
//! | `E_KEYSTORE` | The keystore gave no key or no signature. |
//! | `E_STORAGE` | A storage call failed. |
//! | `E_INTERNAL` | Anything else. |
//!
//! A stamp that does not match is an answer, not an error:
//! `{"ok": true, "verdict": "NO_MATCH", "code", "reason", ...}`, where `code`
//! is `R_EMPTY`, `R_TOO_SHORT`, `R_PASTED` or `R_MISMATCH` (`model::Refusal`).

use crate::{crypto, model};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use outlayer::{encryption_keys, env, signing_keys, storage};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const VERSION: &str = env!("CARGO_PKG_VERSION");
/// NEP-413 recipient every NTK request is signed for.
const RECIPIENT: &str = "near-the-keyboard";
/// Signing key (manifest): ed25519, bound to the project, caller "none" — one
/// key for every caller, the voice of this code. Signs stamps only.
const STAMP_KEY: &str = "stamp";
/// Encryption key (manifest): seals fingerprints and derives the transport key.
const VAULT: &str = "vault";
const TRANSPORT_LABEL: &[u8] = b"ntk/v1/transport-x25519";
const MAX_SKEW_MS: u64 = 10 * 60 * 1000;
const FAIL_WINDOW_MS: u64 = 24 * 3600 * 1000;
const MAX_FAILS_PER_WINDOW: usize = 20;
/// Signatures tried for a free stamp id (each one millisecond later).
const STAMP_ID_TRIES: u64 = 4;

const E_INPUT: &str = "E_INPUT";
const E_OPERATION: &str = "E_OPERATION";
const E_PAYER: &str = "E_PAYER";
const E_AUTH_MISSING: &str = "E_AUTH_MISSING";
const E_AUTH_FORMAT: &str = "E_AUTH_FORMAT";
const E_AUTH_RECIPIENT: &str = "E_AUTH_RECIPIENT";
const E_AUTH_MESSAGE: &str = "E_AUTH_MESSAGE";
const E_AUTH_PAYLOAD: &str = "E_AUTH_PAYLOAD";
const E_AUTH_CLOCK: &str = "E_AUTH_CLOCK";
const E_AUTH_SIGNATURE: &str = "E_AUTH_SIGNATURE";
const E_AUTH_KEY_NOT_FOUND: &str = "E_AUTH_KEY_NOT_FOUND";
const E_AUTH_KEY_OTHER_APP: &str = "E_AUTH_KEY_OTHER_APP";
const E_RPC: &str = "E_RPC";
const E_SEALED_MISSING: &str = "E_SEALED_MISSING";
const E_SEALED_FORMAT: &str = "E_SEALED_FORMAT";
const E_SEALED_OPEN: &str = "E_SEALED_OPEN";
const E_SESSION_INVALID: &str = "E_SESSION_INVALID";
const E_REPLAY: &str = "E_REPLAY";
const E_ENROLL_SHORT: &str = "E_ENROLL_SHORT";
const E_NOT_ENROLLED: &str = "E_NOT_ENROLLED";
const E_NOT_READY: &str = "E_NOT_READY";
const E_RATE_LIMIT: &str = "E_RATE_LIMIT";
const E_STAMP_ID: &str = "E_STAMP_ID";
const E_KEYSTORE: &str = "E_KEYSTORE";
const E_STORAGE: &str = "E_STORAGE";
const E_INTERNAL: &str = "E_INTERNAL";

/// An error answer: a stable code and a text for people.
struct Fail {
    code: &'static str,
    error: String,
}

fn fail(code: &'static str, error: impl Into<String>) -> Fail {
    Fail { code, error: error.into() }
}

type Res<T> = Result<T, Fail>;

#[derive(Deserialize)]
struct Request {
    operation: String,
    #[serde(default)]
    auth: Option<Auth>,
    #[serde(default)]
    sealed: Option<Sealed>,
}

/// A NEP-413 signature (NEAR wallet `signMessage`) over an NTK message.
#[derive(Deserialize)]
struct Auth {
    account_id: String,
    public_key: String,
    /// base64, 64 bytes
    signature: String,
    /// base64, 32 bytes
    nonce: String,
    /// The signed message: AuthMessage as JSON.
    message: String,
    #[serde(default)]
    recipient: Option<String>,
}

#[derive(Deserialize)]
struct AuthMessage {
    ntk: u32,
    op: String,
    account: String,
    /// sealed_digest of the sealed session, "" when there is none.
    payload: String,
    /// ms since the epoch.
    ts: u64,
}

/// A session sealed to the transport key.
#[derive(Deserialize)]
struct Sealed {
    /// hex, 32 bytes
    epk: String,
    /// hex, 12 bytes
    nonce: String,
    /// base64
    ct: String,
}

/// A sealed session, decoded.
struct SealedBytes {
    epk: [u8; 32],
    nonce: [u8; 12],
    ct: Vec<u8>,
}

/// What a stamp says. Signed as STAMP_DOMAIN + this JSON, published as is.
/// Record v2: `text_sha256` is the hash of the canonical text (text rule v2),
/// `text_chars` its length in Unicode scalar values.
#[derive(Serialize)]
struct StampRecord {
    v: u32,
    kind: &'static str,
    account: String,
    text_sha256: String,
    text_chars: usize,
    taps: usize,
    typed_pct: u32,
    score_pct: u32,
    threshold_pct: u32,
    profile_sessions: u32,
    issued_at_ms: u64,
    project: String,
    network: String,
    call_id: String,
    enclave: &'static str,
}

struct Caller {
    account: String,
    ts: u64,
}

pub fn main() {
    let out = handle().unwrap_or_else(|f| json!({ "ok": false, "error": f.error, "code": f.code }));
    let _ = env::output_json(&out);
}

fn handle() -> Res<Value> {
    let req: Request = env::input_json()
        .map_err(|e| fail(E_INPUT, format!("bad input: {e}")))?
        .ok_or_else(|| fail(E_INPUT, "empty input"))?;
    if req.operation != "info" {
        relayed_by_owner()?;
    }
    match req.operation.as_str() {
        "info" => info(),
        "enroll" => enroll(&req),
        "stamp" => stamp(&req),
        "status" => status(&req),
        "forget" => forget(&req),
        other => Err(fail(E_OPERATION, format!("unknown operation '{other}'"))),
    }
}

/// Every fingerprint lives in one storage cell: the project owner's. Storage and
/// encryption keys follow the paying account, so a run paid by anyone else would
/// open an empty, parallel cell where a stolen account key could enroll a new
/// fingerprint. Only runs the owner pays for are served.
fn relayed_by_owner() -> Res<()> {
    let payer = env::var("NEAR_USER_ACCOUNT_ID").unwrap_or_default();
    let owner = env::var("OUTLAYER_PROJECT_OWNER").unwrap_or_default();
    if payer.is_empty() || payer != owner {
        return Err(fail(E_PAYER, format!("NTK serves requests paid by its project owner ({owner}) only, not by '{payer}'")));
    }
    Ok(())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Fractions leave the enclave as whole percentages: integers serialise to the
/// same bytes in every language, so an attested output can be re-checked byte for byte.
fn pct(x: f64) -> u32 {
    (x * 100.0).round().clamp(0.0, 100.0) as u32
}

fn sealed_bytes(s: &Sealed) -> Res<SealedBytes> {
    let malformed = |what: &str| fail(E_SEALED_FORMAT, format!("sealed.{what} is malformed"));
    Ok(SealedBytes {
        epk: hex::decode(&s.epk).ok().and_then(|b| b.try_into().ok()).ok_or_else(|| malformed("epk (32 bytes, hex)"))?,
        nonce: hex::decode(&s.nonce).ok().and_then(|b| b.try_into().ok()).ok_or_else(|| malformed("nonce (12 bytes, hex)"))?,
        ct: B64.decode(&s.ct).map_err(|_| malformed("ct (base64)"))?,
    })
}

fn project() -> String {
    env::var("OUTLAYER_PROJECT_ID").unwrap_or_default()
}

fn stamp_public_key() -> Res<String> {
    let pk = signing_keys::public_key(STAMP_KEY, None).map_err(|e| fail(E_KEYSTORE, format!("stamp key: {}", e.0)))?;
    Ok(format!("ed25519:{}", bs58::encode(pk).into_string()))
}

/// The transport key pair: an X25519 secret derived from the keystore key
/// `vault` (HMAC under a key only this project's runs receive).
fn transport() -> Res<crypto::Transport> {
    let tag = encryption_keys::mac(VAULT, None, TRANSPORT_LABEL).map_err(|e| fail(E_KEYSTORE, format!("transport key: {}", e.0)))?;
    let seed: [u8; 32] = tag.as_slice().try_into().map_err(|_| fail(E_KEYSTORE, "mac is not 32 bytes"))?;
    Ok(crypto::Transport::from_seed(seed))
}

fn info() -> Res<Value> {
    Ok(json!({
        "ok": true,
        "ntk": VERSION,
        "project": project(),
        "network": env::var("NEAR_NETWORK_ID").unwrap_or_default(),
        "caller": env::signer_account_id(),
        "transport_pk": hex::encode(transport()?.public),
        "stamp_pk": stamp_public_key()?,
        "recipient": RECIPIENT,
        "params": {
            "match_threshold_pct": pct(model::MATCH_THRESHOLD),
            "min_typed_pct": pct(model::MIN_TYPED_RATIO),
            "min_stamp_taps": model::MIN_STAMP_TAPS,
            "min_enroll_taps": model::MIN_ENROLL_TAPS,
            "min_profile_sessions": model::MIN_PROFILE_SESSIONS,
            "min_profile_taps": model::MIN_PROFILE_TAPS,
        },
    }))
}

/// Checks the request's NEP-413 signature and that its key belongs to the
/// account it names.
fn authenticate(req: &Request, op: &str) -> Res<Caller> {
    let a = req
        .auth
        .as_ref()
        .ok_or_else(|| fail(E_AUTH_MISSING, "auth required: a NEP-413 signature by a key of the NEAR account"))?;
    if a.recipient.as_deref().unwrap_or(RECIPIENT) != RECIPIENT {
        return Err(fail(E_AUTH_RECIPIENT, format!("auth.recipient must be '{RECIPIENT}'")));
    }
    let m: AuthMessage = serde_json::from_str(&a.message).map_err(|_| fail(E_AUTH_MESSAGE, "auth.message is not an NTK message"))?;
    if m.ntk != 1 || m.op != op || m.account != a.account_id {
        return Err(fail(E_AUTH_MESSAGE, "auth.message does not match this request (version, operation or account)"));
    }
    let payload = match &req.sealed {
        Some(s) => {
            let b = sealed_bytes(s)?;
            crypto::sealed_digest(&b.epk, &b.nonce, &b.ct)
        }
        None => String::new(),
    };
    if m.payload != payload {
        return Err(fail(E_AUTH_PAYLOAD, "auth.message does not commit to this sealed session"));
    }
    let now = now_ms();
    if now.abs_diff(m.ts) > MAX_SKEW_MS {
        return Err(fail(E_AUTH_CLOCK, format!("auth.message ts is more than 10 minutes from the enclave clock ({now})")));
    }
    let pk = crypto::parse_ed25519_pk(&a.public_key).map_err(|e| fail(E_AUTH_FORMAT, e))?;
    let nonce: [u8; 32] = B64
        .decode(&a.nonce)
        .ok()
        .and_then(|b| b.try_into().ok())
        .ok_or_else(|| fail(E_AUTH_FORMAT, "auth.nonce must be 32 bytes, base64"))?;
    let signature = B64.decode(&a.signature).map_err(|_| fail(E_AUTH_FORMAT, "auth.signature must be base64"))?;
    crypto::verify_nep413(&pk, &signature, &a.message, &nonce, RECIPIENT).map_err(|e| fail(E_AUTH_SIGNATURE, e))?;
    key_belongs_to(&a.account_id, &a.public_key, &pk)?;
    Ok(Caller { account: a.account_id.clone(), ts: m.ts })
}

/// An implicit account is its key; a named account must list the key among its
/// access keys on chain (asked through the worker's NEAR RPC host function).
fn key_belongs_to(account: &str, pk_str: &str, pk: &[u8; 32]) -> Res<()> {
    if crypto::is_implicit(account) {
        return if hex::encode(pk) == account {
            Ok(())
        } else {
            Err(fail(E_AUTH_KEY_NOT_FOUND, "the key is not this implicit account's"))
        };
    }
    let (result, error) = outlayer::raw::rpc::view_access_key(account, pk_str, "final");
    let v: Value = serde_json::from_str(&result).unwrap_or(Value::Null);
    let permission = v.get("result").unwrap_or(&v).get("permission");
    let owner = env::var("OUTLAYER_PROJECT_OWNER").unwrap_or_default();
    match permission {
        // the account's own full-access key: what a wallet's signMessage uses
        Some(Value::String(p)) if p == "FullAccess" => Ok(()),
        // a key the account issued to NTK itself ("sign in with NEAR" to NTK); a
        // function-call key issued to any other app must not speak for the account
        Some(Value::Object(o)) if o.get("FunctionCall").and_then(|f| f.get("receiver_id")).and_then(|r| r.as_str()) == Some(owner.as_str()) => Ok(()),
        Some(_) => Err(fail(
            E_AUTH_KEY_OTHER_APP,
            format!("{pk_str} is a function-call key of {account} for another app; use a full-access key or a key issued to {owner}"),
        )),
        None => {
            let why: String = if error.is_empty() { &result } else { &error }.chars().take(200).collect();
            // NEAR answers a missing key or account with an error that says so;
            // anything else means the question did not get through.
            let says_missing = |t: &str| ["does not exist", "UNKNOWN_ACCESS_KEY", "UNKNOWN_ACCOUNT", "INVALID_ACCOUNT"].iter().any(|m| t.contains(m));
            if v.get("result").and_then(|r| r.get("error")).is_some() || says_missing(&result) || says_missing(&error) {
                Err(fail(E_AUTH_KEY_NOT_FOUND, format!("{pk_str} is not an access key of {account}: {why}")))
            } else {
                Err(fail(E_RPC, format!("could not check on chain whether {pk_str} is a key of {account}: {why}")))
            }
        }
    }
}

fn open_session(req: &Request, c: &Caller, op: &str) -> Res<model::Session> {
    let s = req.sealed.as_ref().ok_or_else(|| fail(E_SEALED_MISSING, "sealed session required"))?;
    let b = sealed_bytes(s)?;
    let aad = format!("ntk/v1|{op}|{}", c.account);
    let plain = transport()?.open(&b.epk, &b.nonce, &b.ct, aad.as_bytes()).map_err(|e| fail(E_SEALED_OPEN, e))?;
    serde_json::from_slice(&plain).map_err(|e| fail(E_SESSION_INVALID, format!("session is not valid JSON: {e}")))
}

fn profile_name(account: &str) -> String {
    format!("profile:v1:{account}")
}

fn load(account: &str) -> Res<Option<model::Profile>> {
    match storage::sealed::get(VAULT, None, &profile_name(account)).map_err(|e| fail(E_STORAGE, format!("storage: {}", e.0)))? {
        Some(s) => serde_json::from_slice(s.plaintext()).map(Some).map_err(|e| fail(E_STORAGE, format!("profile: {e}"))),
        None => Ok(None),
    }
}

fn save(account: &str, p: &model::Profile) -> Res<()> {
    let bytes = serde_json::to_vec(p).map_err(|e| fail(E_INTERNAL, e.to_string()))?;
    storage::sealed::set(VAULT, None, &profile_name(account), &bytes).map_err(|e| fail(E_STORAGE, format!("storage: {}", e.0)))
}

fn enroll(req: &Request) -> Res<Value> {
    let c = authenticate(req, "enroll")?;
    let session = open_session(req, &c, "enroll")?;
    let mode = session.enrollment_mode().map_err(|e| fail(E_SESSION_INVALID, e))?;
    let f = model::extract(&session.events);
    if f.taps < model::MIN_ENROLL_TAPS {
        return Err(fail(
            E_ENROLL_SHORT,
            format!("an enrollment session needs at least {} key taps, this one has {}", model::MIN_ENROLL_TAPS, f.taps),
        ));
    }
    let mut p = load(&c.account)?.unwrap_or_default();
    if c.ts <= p.last_ts {
        return Err(fail(E_REPLAY, "replayed or out-of-order request"));
    }
    p.last_ts = c.ts;
    p.absorb(&f);
    if let Some(m) = mode {
        p.modes.add(m);
    }
    save(&c.account, &p)?;
    Ok(json!({
        "ok": true, "account": c.account, "session_taps": f.taps,
        "sessions": p.sessions, "taps": p.taps, "modes": p.modes, "ready": p.ready(),
    }))
}

fn stamp(req: &Request) -> Res<Value> {
    let c = authenticate(req, "stamp")?;
    let session = open_session(req, &c, "stamp")?;
    let mut p = load(&c.account)?.ok_or_else(|| fail(E_NOT_ENROLLED, "no fingerprint for this account: enroll first"))?;
    if !p.ready() {
        return Err(fail(
            E_NOT_READY,
            format!(
                "fingerprint not ready: {} of {} sessions, {} of {} key taps",
                p.sessions, model::MIN_PROFILE_SESSIONS, p.taps, model::MIN_PROFILE_TAPS
            ),
        ));
    }
    if c.ts <= p.last_ts {
        return Err(fail(E_REPLAY, "replayed or out-of-order request"));
    }
    let now = now_ms();
    p.fails.retain(|t| now.saturating_sub(*t) < FAIL_WINDOW_MS);
    if p.fails.len() >= MAX_FAILS_PER_WINDOW {
        return Err(fail(E_RATE_LIMIT, "too many failed stamps in the last 24 hours"));
    }
    p.last_ts = c.ts;

    let f = model::extract(&session.events);
    let r = model::replay(&session.events);
    let s = model::score(&p, &f);
    if let Err(refusal) = model::verdict(s.score, r.typed_ratio(), f.taps, r.total_chars) {
        p.fails.push(now);
        save(&c.account, &p)?;
        // Coarse figures only: a failed attempt must not teach a forger the fingerprint.
        return Ok(json!({
            "ok": true, "verdict": "NO_MATCH", "code": refusal.code(), "reason": refusal.reason(),
            "score_pct": pct((s.score * 20.0).floor() / 20.0),
            "typed_pct": pct(r.typed_ratio()), "taps": f.taps,
        }));
    }

    let mut record = StampRecord {
        v: 2,
        kind: "ntk-stamp",
        account: c.account.clone(),
        text_sha256: hex::encode(Sha256::digest(r.text.as_bytes())),
        text_chars: r.text_chars,
        taps: f.taps,
        typed_pct: pct(r.typed_ratio()),
        score_pct: pct(s.score),
        threshold_pct: pct(model::MATCH_THRESHOLD),
        profile_sessions: p.sessions,
        issued_at_ms: now,
        project: project(),
        network: env::var("NEAR_NETWORK_ID").unwrap_or_default(),
        call_id: env::var("OUTLAYER_CALL_ID").unwrap_or_default(),
        enclave: VERSION,
    };
    let pk = stamp_public_key()?;
    // Worker storage (SDK 0.2.1) has no insert-if-absent, so the id is looked up
    // first; a taken id means signing again one millisecond later.
    let signed = crypto::sign_free_id(
        now,
        STAMP_ID_TRIES,
        |t| {
            record.issued_at_ms = t;
            let json = serde_json::to_string(&record).map_err(|e| fail(E_INTERNAL, e.to_string()))?;
            let sig = signing_keys::sign(STAMP_KEY, None, &crypto::stamp_message(&json)).map_err(|e| fail(E_KEYSTORE, format!("sign: {}", e.0)))?;
            Ok((json, sig))
        },
        |id| {
            storage::get_worker(&stamp_key(id))
                .map(|v| v.is_some())
                .map_err(|e| fail(E_STORAGE, format!("stamp lookup: {}", e.0)))
        },
    )?
    .ok_or_else(|| fail(E_STAMP_ID, "every stamp id tried was already taken; nothing was published"))?;
    let published = json!({ "id": signed.id, "record": signed.record, "sig": B64.encode(&signed.sig), "pk": pk });
    // Public record: anyone can fetch it by id from OutLayer's public storage API.
    storage::set_worker_with_options(&stamp_key(&signed.id), published.to_string().as_bytes(), Some(false))
        .map_err(|e| fail(E_STORAGE, format!("publish: {}", e.0)))?;

    // Fresh statistics: a matching session updates the fingerprint.
    p.absorb(&f);
    p.stamps += 1;
    save(&c.account, &p)?;

    Ok(json!({
        "ok": true, "verdict": "MATCH", "id": signed.id,
        "tag": crypto::tag(&signed.id),
        "stamp": published,
        "detail": {
            "dwell_pct": pct(s.dwell.sim), "flight_pct": pct(s.flight.sim), "offset_pct": pct(s.offset.sim),
            "features": s.dwell.features + s.flight.features + s.offset.features,
        },
    }))
}

fn stamp_key(id: &str) -> String {
    format!("stamp:{id}")
}

fn status(req: &Request) -> Res<Value> {
    let c = authenticate(req, "status")?;
    let now = now_ms();
    Ok(match load(&c.account)? {
        Some(p) => json!({
            "ok": true, "account": c.account, "enrolled": true, "ready": p.ready(),
            "sessions": p.sessions, "taps": p.taps, "stamps": p.stamps, "modes": p.modes,
            "failed_24h": p.fails.iter().filter(|t| now.saturating_sub(**t) < FAIL_WINDOW_MS).count(),
        }),
        None => json!({ "ok": true, "account": c.account, "enrolled": false }),
    })
}

fn forget(req: &Request) -> Res<Value> {
    let c = authenticate(req, "forget")?;
    let deleted = storage::sealed::delete(VAULT, None, &profile_name(&c.account)).map_err(|e| fail(E_STORAGE, format!("storage: {}", e.0)))?;
    Ok(json!({ "ok": true, "account": c.account, "deleted": deleted }))
}

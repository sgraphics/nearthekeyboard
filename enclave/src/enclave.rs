//! Host glue: the OutLayer interfaces (keystore keys, sealed storage, RPC, env).

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

/// What a stamp says. Signed as STAMP_DOMAIN + this JSON, published as is.
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
    let out = handle().unwrap_or_else(|e| json!({ "ok": false, "error": e }));
    let _ = env::output_json(&out);
}

fn handle() -> Result<Value, String> {
    let req: Request = env::input_json()
        .map_err(|e| format!("bad input: {e}"))?
        .ok_or("empty input")?;
    if req.operation != "info" {
        relayed_by_owner()?;
    }
    match req.operation.as_str() {
        "info" => info(),
        "enroll" => enroll(&req),
        "stamp" => stamp(&req),
        "status" => status(&req),
        "forget" => forget(&req),
        other => Err(format!("unknown operation '{other}'")),
    }
}

/// Every fingerprint lives in one storage cell: the project owner's. Storage and
/// encryption keys follow the paying account, so a run paid by anyone else would
/// open an empty, parallel cell where a stolen account key could enroll a new
/// fingerprint. Only runs the owner pays for are served.
fn relayed_by_owner() -> Result<(), String> {
    let payer = env::var("NEAR_USER_ACCOUNT_ID").unwrap_or_default();
    let owner = env::var("OUTLAYER_PROJECT_OWNER").unwrap_or_default();
    if payer.is_empty() || payer != owner {
        return Err(format!("NTK serves requests paid by its project owner ({owner}) only, not by '{payer}'"));
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

fn hex_bytes(s: &str, what: &str) -> Result<Vec<u8>, String> {
    hex::decode(s).map_err(|_| format!("{what} must be hex"))
}

fn b64_bytes(s: &str, what: &str) -> Result<Vec<u8>, String> {
    B64.decode(s).map_err(|_| format!("{what} must be base64"))
}

fn project() -> String {
    env::var("OUTLAYER_PROJECT_ID").unwrap_or_default()
}

fn stamp_public_key() -> Result<String, String> {
    let pk = signing_keys::public_key(STAMP_KEY, None).map_err(|e| format!("stamp key: {}", e.0))?;
    Ok(format!("ed25519:{}", bs58::encode(pk).into_string()))
}

/// The transport key pair: an X25519 secret derived from the keystore key
/// `vault` (HMAC under a key only this project's runs receive).
fn transport() -> Result<crypto::Transport, String> {
    let tag = encryption_keys::mac(VAULT, None, TRANSPORT_LABEL).map_err(|e| format!("transport key: {}", e.0))?;
    let seed: [u8; 32] = tag.as_slice().try_into().map_err(|_| "mac is not 32 bytes")?;
    Ok(crypto::Transport::from_seed(seed))
}

fn info() -> Result<Value, String> {
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
fn authenticate(req: &Request, op: &str) -> Result<Caller, String> {
    let a = req.auth.as_ref().ok_or("auth required: a NEP-413 signature by a key of the NEAR account")?;
    if a.recipient.as_deref().unwrap_or(RECIPIENT) != RECIPIENT {
        return Err(format!("auth.recipient must be '{RECIPIENT}'"));
    }
    let m: AuthMessage = serde_json::from_str(&a.message).map_err(|_| "auth.message is not an NTK message")?;
    if m.ntk != 1 || m.op != op || m.account != a.account_id {
        return Err("auth.message does not match this request (version, operation or account)".into());
    }
    let payload = match &req.sealed {
        Some(s) => crypto::sealed_digest(&hex_bytes(&s.epk, "sealed.epk")?, &hex_bytes(&s.nonce, "sealed.nonce")?, &b64_bytes(&s.ct, "sealed.ct")?),
        None => String::new(),
    };
    if m.payload != payload {
        return Err("auth.message does not commit to this sealed session".into());
    }
    let now = now_ms();
    if now.abs_diff(m.ts) > MAX_SKEW_MS {
        return Err(format!("auth.message ts is more than 10 minutes from the enclave clock ({now})"));
    }
    let pk = crypto::parse_ed25519_pk(&a.public_key)?;
    let nonce: [u8; 32] = b64_bytes(&a.nonce, "auth.nonce")?.try_into().map_err(|_| "auth.nonce must be 32 bytes")?;
    crypto::verify_nep413(&pk, &b64_bytes(&a.signature, "auth.signature")?, &a.message, &nonce, RECIPIENT)?;
    key_belongs_to(&a.account_id, &a.public_key, &pk)?;
    Ok(Caller { account: a.account_id.clone(), ts: m.ts })
}

/// An implicit account is its key; a named account must list the key among its
/// access keys on chain (asked through the worker's NEAR RPC host function).
fn key_belongs_to(account: &str, pk_str: &str, pk: &[u8; 32]) -> Result<(), String> {
    if crypto::is_implicit(account) {
        return if hex::encode(pk) == account { Ok(()) } else { Err("the key is not this implicit account's".into()) };
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
        Some(_) => Err(format!("{pk_str} is a function-call key of {account} for another app; use a full-access key or a key issued to {owner}")),
        None => {
            let why: String = if error.is_empty() { result } else { error }.chars().take(200).collect();
            Err(format!("{pk_str} is not an access key of {account}: {why}"))
        }
    }
}

fn open_session(req: &Request, c: &Caller, op: &str) -> Result<model::Session, String> {
    let s = req.sealed.as_ref().ok_or("sealed session required")?;
    let epk: [u8; 32] = hex_bytes(&s.epk, "sealed.epk")?.try_into().map_err(|_| "sealed.epk must be 32 bytes")?;
    let nonce: [u8; 12] = hex_bytes(&s.nonce, "sealed.nonce")?.try_into().map_err(|_| "sealed.nonce must be 12 bytes")?;
    let aad = format!("ntk/v1|{op}|{}", c.account);
    let plain = transport()?.open(&epk, &nonce, &b64_bytes(&s.ct, "sealed.ct")?, aad.as_bytes())?;
    serde_json::from_slice(&plain).map_err(|e| format!("session is not valid JSON: {e}"))
}

fn profile_name(account: &str) -> String {
    format!("profile:v1:{account}")
}

fn load(account: &str) -> Result<Option<model::Profile>, String> {
    match storage::sealed::get(VAULT, None, &profile_name(account)).map_err(|e| format!("storage: {}", e.0))? {
        Some(s) => serde_json::from_slice(s.plaintext()).map(Some).map_err(|e| format!("profile: {e}")),
        None => Ok(None),
    }
}

fn save(account: &str, p: &model::Profile) -> Result<(), String> {
    let bytes = serde_json::to_vec(p).map_err(|e| e.to_string())?;
    storage::sealed::set(VAULT, None, &profile_name(account), &bytes).map_err(|e| format!("storage: {}", e.0))
}

fn enroll(req: &Request) -> Result<Value, String> {
    let c = authenticate(req, "enroll")?;
    let session = open_session(req, &c, "enroll")?;
    let f = model::extract(&session.events);
    if f.taps < model::MIN_ENROLL_TAPS {
        return Err(format!("an enrollment session needs at least {} key taps, this one has {}", model::MIN_ENROLL_TAPS, f.taps));
    }
    let mut p = load(&c.account)?.unwrap_or_default();
    if c.ts <= p.last_ts {
        return Err("replayed or out-of-order request".into());
    }
    p.last_ts = c.ts;
    p.absorb(&f);
    save(&c.account, &p)?;
    Ok(json!({
        "ok": true, "account": c.account, "session_taps": f.taps,
        "sessions": p.sessions, "taps": p.taps, "ready": p.ready(),
    }))
}

fn stamp(req: &Request) -> Result<Value, String> {
    let c = authenticate(req, "stamp")?;
    let session = open_session(req, &c, "stamp")?;
    let mut p = load(&c.account)?.ok_or("no fingerprint for this account: enroll first")?;
    if !p.ready() {
        return Err(format!(
            "fingerprint not ready: {} of {} sessions, {} of {} key taps",
            p.sessions, model::MIN_PROFILE_SESSIONS, p.taps, model::MIN_PROFILE_TAPS
        ));
    }
    if c.ts <= p.last_ts {
        return Err("replayed or out-of-order request".into());
    }
    let now = now_ms();
    p.fails.retain(|t| now.saturating_sub(*t) < FAIL_WINDOW_MS);
    if p.fails.len() >= MAX_FAILS_PER_WINDOW {
        return Err("too many failed stamps in the last 24 hours".into());
    }
    p.last_ts = c.ts;

    let f = model::extract(&session.events);
    let r = model::replay(&session.events);
    let s = model::score(&p, &f);
    if let Err(reason) = model::verdict(s.score, r.typed_ratio(), f.taps, r.total_chars) {
        p.fails.push(now);
        save(&c.account, &p)?;
        // Coarse figures only: a failed attempt must not teach a forger the fingerprint.
        return Ok(json!({
            "ok": true, "verdict": "NO_MATCH", "reason": reason,
            "score_pct": pct((s.score * 20.0).floor() / 20.0),
            "typed_pct": pct(r.typed_ratio()), "taps": f.taps,
        }));
    }

    let record = StampRecord {
        v: 1,
        kind: "ntk-stamp",
        account: c.account.clone(),
        text_sha256: hex::encode(Sha256::digest(r.text.as_bytes())),
        text_chars: r.total_chars,
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
    let record_json = serde_json::to_string(&record).map_err(|e| e.to_string())?;
    let sig = signing_keys::sign(STAMP_KEY, None, &crypto::stamp_message(&record_json)).map_err(|e| format!("sign: {}", e.0))?;
    let id = crypto::stamp_id(&sig);
    let published = json!({ "id": id, "record": record_json, "sig": B64.encode(&sig), "pk": stamp_public_key()? });
    // Public record: anyone can fetch it by id from OutLayer's public storage API.
    storage::set_worker_with_options(&format!("stamp:{id}"), published.to_string().as_bytes(), Some(false))
        .map_err(|e| format!("publish: {}", e.0))?;

    // Fresh statistics: a matching session updates the fingerprint.
    p.absorb(&f);
    p.stamps += 1;
    save(&c.account, &p)?;

    Ok(json!({
        "ok": true, "verdict": "MATCH", "id": id,
        "tag": format!("[NTK @{} {}]", c.account, id),
        "stamp": published,
        "detail": {
            "dwell_pct": pct(s.dwell.sim), "flight_pct": pct(s.flight.sim), "offset_pct": pct(s.offset.sim),
            "features": s.dwell.features + s.flight.features + s.offset.features,
        },
    }))
}

fn status(req: &Request) -> Result<Value, String> {
    let c = authenticate(req, "status")?;
    let now = now_ms();
    Ok(match load(&c.account)? {
        Some(p) => json!({
            "ok": true, "account": c.account, "enrolled": true, "ready": p.ready(),
            "sessions": p.sessions, "taps": p.taps, "stamps": p.stamps,
            "failed_24h": p.fails.iter().filter(|t| now.saturating_sub(**t) < FAIL_WINDOW_MS).count(),
        }),
        None => json!({ "ok": true, "account": c.account, "enrolled": false }),
    })
}

fn forget(req: &Request) -> Result<Value, String> {
    let c = authenticate(req, "forget")?;
    let deleted = storage::sealed::delete(VAULT, None, &profile_name(&c.account)).map_err(|e| format!("storage: {}", e.0))?;
    Ok(json!({ "ok": true, "account": c.account, "deleted": deleted }))
}

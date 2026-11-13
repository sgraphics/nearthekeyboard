//! Cryptography of the NTK protocol. Pure code, tested on the host.
//!
//! - Transport: the keyboard seals each session to the enclave's X25519 key
//!   (ephemeral X25519 + HKDF-SHA256 + ChaCha20-Poly1305), so only code running
//!   inside the enclave can read the measurements: not the relay, not the
//!   OutLayer coordinator, not the user's own storage.
//! - Identity: every request carries a NEP-413 signature (NEAR `signMessage`)
//!   by a key of the user's NEAR account.
//! - Stamps: signed by the enclave's ed25519 key under a fixed domain prefix.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::ChaCha20Poly1305;
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};

/// NEP-413 tag: 2^31 + 413, borsh u32 before the payload.
const NEP413_TAG: u32 = 2_147_484_061;
const TRANSPORT_INFO: &[u8] = b"ntk/v1/transport";
/// Everything the enclave signs as a stamp starts with this line.
pub const STAMP_DOMAIN: &[u8] = b"NTK-STAMP/v1\n";

fn borsh_string(buf: &mut Vec<u8>, s: &str) {
    buf.extend_from_slice(&(s.len() as u32).to_le_bytes());
    buf.extend_from_slice(s.as_bytes());
}

/// The 32-byte hash a NEP-413 signature signs:
/// sha256(borsh(2^31 + 413) || borsh({message, nonce, recipient, callback_url})).
pub fn nep413_hash(message: &str, nonce: &[u8; 32], recipient: &str, callback_url: Option<&str>) -> [u8; 32] {
    let mut buf = Vec::with_capacity(message.len() + recipient.len() + 64);
    buf.extend_from_slice(&NEP413_TAG.to_le_bytes());
    borsh_string(&mut buf, message);
    buf.extend_from_slice(nonce);
    borsh_string(&mut buf, recipient);
    match callback_url {
        None => buf.push(0),
        Some(u) => {
            buf.push(1);
            borsh_string(&mut buf, u);
        }
    }
    Sha256::digest(&buf).into()
}

/// `ed25519:<base58>` -> 32 bytes.
pub fn parse_ed25519_pk(s: &str) -> Result<[u8; 32], String> {
    let b58 = s.strip_prefix("ed25519:").ok_or("public_key must be ed25519:<base58>")?;
    let bytes = bs58::decode(b58).into_vec().map_err(|_| "public_key is not base58")?;
    bytes.try_into().map_err(|_| "public_key must be 32 bytes".to_string())
}

pub fn verify_nep413(pk: &[u8; 32], signature: &[u8], message: &str, nonce: &[u8; 32], recipient: &str) -> Result<(), String> {
    let vk = ed25519_dalek::VerifyingKey::from_bytes(pk).map_err(|_| "invalid ed25519 public key")?;
    let sig = ed25519_dalek::Signature::from_slice(signature).map_err(|_| "signature must be 64 bytes")?;
    vk.verify_strict(&nep413_hash(message, nonce, recipient, None), &sig)
        .map_err(|_| "NEP-413 signature does not verify".to_string())
}

/// A NEAR implicit account: 64 lowercase hex characters, the ed25519 public key itself.
pub fn is_implicit(account: &str) -> bool {
    account.len() == 64 && account.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// The enclave's transport key pair. The secret is derived inside the run from a
/// keystore key and never leaves it.
pub struct Transport {
    secret: StaticSecret,
    pub public: [u8; 32],
}

fn transport_key(shared: &[u8; 32], epk: &[u8; 32], pk: &[u8; 32]) -> [u8; 32] {
    let mut salt = [0u8; 64];
    salt[..32].copy_from_slice(epk);
    salt[32..].copy_from_slice(pk);
    let mut okm = [0u8; 32];
    hkdf::Hkdf::<Sha256>::new(Some(&salt), shared)
        .expand(TRANSPORT_INFO, &mut okm)
        .expect("32 bytes is a valid HKDF output length");
    okm
}

impl Transport {
    pub fn from_seed(seed: [u8; 32]) -> Self {
        let secret = StaticSecret::from(seed);
        let public = PublicKey::from(&secret).to_bytes();
        Transport { secret, public }
    }

    /// Open a sealed session. `aad` binds it to the operation and the account.
    pub fn open(&self, epk: &[u8; 32], nonce: &[u8; 12], ct: &[u8], aad: &[u8]) -> Result<Vec<u8>, String> {
        let shared = self.secret.diffie_hellman(&PublicKey::from(*epk));
        if !shared.was_contributory() {
            return Err("invalid ephemeral key".into());
        }
        let key = transport_key(shared.as_bytes(), epk, &self.public);
        ChaCha20Poly1305::new((&key).into())
            .decrypt(nonce.into(), Payload { msg: ct, aad })
            .map_err(|_| "sealed session does not open (wrong key, tampered, or wrong account/operation)".into())
    }
}

/// Seal to a transport public key: what the keyboard does (used here by tests).
pub fn seal(recipient: &[u8; 32], eph_secret: [u8; 32], nonce: [u8; 12], plaintext: &[u8], aad: &[u8]) -> ([u8; 32], Vec<u8>) {
    let esk = StaticSecret::from(eph_secret);
    let epk = PublicKey::from(&esk).to_bytes();
    let shared = esk.diffie_hellman(&PublicKey::from(*recipient));
    let key = transport_key(shared.as_bytes(), &epk, recipient);
    let ct = ChaCha20Poly1305::new((&key).into())
        .encrypt((&nonce).into(), Payload { msg: plaintext, aad })
        .expect("encryption cannot fail");
    (epk, ct)
}

/// hex(sha256(epk || nonce || ct)): what the user's NEP-413 message commits to.
pub fn sealed_digest(epk: &[u8], nonce: &[u8], ct: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(epk);
    h.update(nonce);
    h.update(ct);
    hex::encode(h.finalize())
}

pub fn stamp_message(record_json: &str) -> Vec<u8> {
    [STAMP_DOMAIN, record_json.as_bytes()].concat()
}

/// The short public id of a stamp: the first 10 hex characters of sha256(signature).
pub fn stamp_id(signature: &[u8]) -> String {
    hex::encode(&Sha256::digest(signature)[..5])
}

/// The tag the keyboard puts after the stamped text. The record names the
/// account; the stamp is looked up by id alone.
pub fn tag(id: &str) -> String {
    format!("[NTK {id}]")
}

/// A stamp ready to publish: the record as signed, its signature and its id.
#[derive(Debug, Clone, PartialEq)]
pub struct Signed {
    pub record: String,
    pub sig: Vec<u8>,
    pub id: String,
}

/// A published stamp is never overwritten. `sign(t)` signs the record issued at
/// `t` ms; while `taken(id)` says the signature's id is already published, the
/// record is signed again one millisecond later, `tries` times at most. None
/// when every id tried was taken.
pub fn sign_free_id<E>(
    issued_at_ms: u64,
    tries: u64,
    mut sign: impl FnMut(u64) -> Result<(String, Vec<u8>), E>,
    mut taken: impl FnMut(&str) -> Result<bool, E>,
) -> Result<Option<Signed>, E> {
    for t in issued_at_ms..issued_at_ms.saturating_add(tries) {
        let (record, sig) = sign(t)?;
        let id = stamp_id(&sig);
        if !taken(&id)? {
            return Ok(Some(Signed { record, sig, id }));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn seal_and_open_roundtrip_and_aad_binding() {
        let t = Transport::from_seed([7u8; 32]);
        let (epk, ct) = seal(&t.public, [9u8; 32], [1u8; 12], b"hello", b"ntk/v1|enroll|alice.testnet");
        assert_eq!(t.open(&epk, &[1u8; 12], &ct, b"ntk/v1|enroll|alice.testnet").unwrap(), b"hello");
        assert!(t.open(&epk, &[1u8; 12], &ct, b"ntk/v1|stamp|alice.testnet").is_err());
        assert!(t.open(&epk, &[1u8; 12], &ct, b"ntk/v1|enroll|bob.testnet").is_err());
        let other = Transport::from_seed([8u8; 32]);
        assert!(other.open(&epk, &[1u8; 12], &ct, b"ntk/v1|enroll|alice.testnet").is_err());
    }

    #[test]
    fn nep413_signature_verifies_and_rejects_changes() {
        let sk = SigningKey::from_bytes(&[3u8; 32]);
        let pk = sk.verifying_key().to_bytes();
        let nonce = [5u8; 32];
        let msg = r#"{"ntk":1,"op":"stamp","account":"alice.testnet","payload":"ab","ts":1}"#;
        let sig = sk.sign(&nep413_hash(msg, &nonce, "near-the-keyboard", None)).to_bytes();
        assert!(verify_nep413(&pk, &sig, msg, &nonce, "near-the-keyboard").is_ok());
        assert!(verify_nep413(&pk, &sig, msg, &nonce, "evil-site").is_err());
        assert!(verify_nep413(&pk, &sig, &msg.replace("stamp", "enroll"), &nonce, "near-the-keyboard").is_err());
    }

    #[test]
    fn implicit_accounts_and_keys() {
        assert!(is_implicit(&"ab".repeat(32)));
        assert!(!is_implicit("alice.testnet"));
        assert!(!is_implicit(&"AB".repeat(32)));
        let pk = parse_ed25519_pk("ed25519:11111111111111111111111111111111").unwrap();
        assert_eq!(pk, [0u8; 32]);
        assert_eq!(stamp_id(b"sig").len(), 10);
    }

    #[test]
    fn the_tag_is_the_short_form() {
        assert_eq!(tag("e65ee28db5"), "[NTK e65ee28db5]");
    }

    #[test]
    fn a_taken_id_is_signed_again_one_millisecond_later() {
        let sk = SigningKey::from_bytes(&[4u8; 32]);
        let sign = |t: u64| -> Result<(String, Vec<u8>), String> {
            let record = format!(r#"{{"issued_at_ms":{t}}}"#);
            let sig = sk.sign(&stamp_message(&record)).to_bytes().to_vec();
            Ok((record, sig))
        };
        let first = stamp_id(&sign(1000).unwrap().1);
        let second = stamp_id(&sign(1001).unwrap().1);
        assert_ne!(first, second);

        let free = sign_free_id(1000, 3, sign, |_| Ok(false)).unwrap().unwrap();
        assert_eq!((free.id.as_str(), free.record.as_str()), (first.as_str(), r#"{"issued_at_ms":1000}"#));

        let published = [first.clone()];
        let again = sign_free_id(1000, 3, sign, |id| Ok(published.contains(&id.to_string()))).unwrap().unwrap();
        assert_eq!((again.id.as_str(), again.record.as_str()), (second.as_str(), r#"{"issued_at_ms":1001}"#));

        // Every id taken: no stamp, nothing overwritten. A failed lookup is an error, not a free id.
        assert_eq!(sign_free_id(1000, 3, sign, |_| Ok(true)), Ok(None));
        assert!(sign_free_id(1000, 3, sign, |_| Err("storage".to_string())).is_err());
    }

    /// docs/test-vectors/crypto-v1.json, shared with the keyboard and every verifier.
    const CRYPTO_VECTORS: &str = include_str!("../../docs/test-vectors/crypto-v1.json");

    fn vectors() -> serde_json::Value {
        serde_json::from_str(CRYPTO_VECTORS).unwrap()
    }

    fn s<'a>(v: &'a serde_json::Value, key: &str) -> &'a str {
        v[key].as_str().unwrap_or_else(|| panic!("{key} missing"))
    }

    fn b64(v: &serde_json::Value, key: &str) -> Vec<u8> {
        use base64::{engine::general_purpose::STANDARD, Engine};
        STANDARD.decode(s(v, key)).unwrap()
    }

    fn bytes<const N: usize>(hex_str: &str) -> [u8; N] {
        hex::decode(hex_str).unwrap().try_into().unwrap()
    }

    #[test]
    fn shared_vector_sealed_session_opens_in_the_enclave() {
        let v = vectors();
        let seal_v = &v["seal"];
        let t = Transport::from_seed(bytes(s(seal_v, "transport_seed_hex")));
        assert_eq!(hex::encode(t.public), s(seal_v, "transport_pk_hex"));
        let epk: [u8; 32] = bytes(s(seal_v, "epk_hex"));
        let nonce: [u8; 12] = bytes(s(seal_v, "nonce_hex"));
        let ct = b64(seal_v, "ct_b64");
        let aad = s(seal_v, "aad");
        assert_eq!(aad, format!("ntk/v1|{}|{}", s(seal_v, "op"), s(seal_v, "account")));

        let plain = t.open(&epk, &nonce, &ct, aad.as_bytes()).unwrap();
        assert_eq!(plain, s(seal_v, "plaintext").as_bytes());
        let session: crate::model::Session = serde_json::from_slice(&plain).unwrap();
        assert_eq!(session.events.len(), 2);
        assert!(t.open(&epk, &nonce, &ct, b"ntk/v1|enroll|ntk-alice.testnet").is_err());
        assert_eq!(sealed_digest(&epk, &nonce, &ct), s(seal_v, "sealed_digest_hex"));

        // The keyboard's side: the same ephemeral key and nonce give the same bytes.
        let (epk2, ct2) = seal(&t.public, bytes(s(seal_v, "eph_secret_hex")), nonce, &plain, aad.as_bytes());
        assert_eq!((epk2, ct2), (epk, ct));
    }

    #[test]
    fn shared_vector_nep413_signature_verifies() {
        let v = vectors();
        let n = &v["nep413"];
        let pk = parse_ed25519_pk(s(n, "public_key")).unwrap();
        let sk = SigningKey::from_bytes(&bytes(s(n, "seed_hex")));
        assert_eq!(pk, sk.verifying_key().to_bytes());
        let nonce: [u8; 32] = b64(n, "nonce_b64").try_into().unwrap();
        let (message, recipient) = (s(n, "message"), s(n, "recipient"));
        assert_eq!(hex::encode(nep413_hash(message, &nonce, recipient, None)), s(n, "hash_hex"));
        assert!(verify_nep413(&pk, &b64(n, "signature_b64"), message, &nonce, recipient).is_ok());
        assert!(verify_nep413(&pk, &b64(n, "signature_b64"), message, &nonce, "near").is_err());
        // The signed message commits to the sealed session of the seal vector.
        let m: serde_json::Value = serde_json::from_str(message).unwrap();
        assert_eq!(m["payload"], v["seal"]["sealed_digest_hex"]);
    }

    #[test]
    fn shared_vector_real_stamp_id_and_signature() {
        let v = vectors();
        let st = &v["stamp"];
        let sig = b64(st, "sig");
        assert_eq!(stamp_id(&sig), s(st, "id"));
        assert_eq!(hex::encode(Sha256::digest(&sig)), s(st, "sig_sha256_hex"));
        assert_eq!(s(st, "pk"), "ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG");
        let vk = ed25519_dalek::VerifyingKey::from_bytes(&parse_ed25519_pk(s(st, "pk")).unwrap()).unwrap();
        let signature = ed25519_dalek::Signature::from_slice(&sig).unwrap();
        assert!(vk.verify_strict(&stamp_message(s(st, "record")), &signature).is_ok());
        assert!(vk.verify_strict(&stamp_message(&s(st, "record").replace("98", "99")), &signature).is_err());
        // A v1 record: the hash is of the text with CR removed and trimmed.
        let record: serde_json::Value = serde_json::from_str(s(st, "record")).unwrap();
        assert_eq!(hex::encode(Sha256::digest(s(st, "text").trim().as_bytes())), s(&record, "text_sha256"));
    }
}

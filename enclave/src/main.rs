//! NTK (Near The Keyboard) enclave.
//!
//! Runs on NEAR OutLayer inside Intel TDX. The keyboard is a window into this
//! enclave: it streams each typing session here sealed, the enclave keeps the
//! typing fingerprint sealed in its own storage, and only the enclave's key can
//! sign a stamp saying "this text was typed by the owner of this NEAR account".
//!
//! Operations (input JSON `{"operation": ..., "auth": ..., "sealed": ...}`):
//! - `info`   — the enclave's transport key and stamp key (no auth);
//! - `enroll` — add a sealed typing session to the caller's fingerprint;
//! - `stamp`  — compare a sealed session with the fingerprint; on a match, sign
//!              and publish a stamp for the text it produced;
//! - `status` — how far enrollment is, never the fingerprint itself;
//! - `forget` — delete the caller's fingerprint.

#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

mod crypto;
mod model;

#[cfg(target_arch = "wasm32")]
mod enclave;

/// The OutLayer manifest, in the `outlayer.manifest` custom section, so the
/// sha256 of the wasm covers the keys, storage and network policy it declares.
#[cfg(target_arch = "wasm32")]
#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] = *include_bytes!("../manifest.json");

fn main() {
    #[cfg(target_arch = "wasm32")]
    enclave::main();
    #[cfg(not(target_arch = "wasm32"))]
    eprintln!("ntk-enclave runs on OutLayer: build it with `cargo build --target wasm32-wasip2 --release`");
}

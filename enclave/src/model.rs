//! The typing fingerprint: what is measured, how it is stored, how a session is
//! compared with it. Pure code with no host calls, so `cargo test` runs it.
//!
//! Three measurements per key tap, as the keyboard reports them:
//! - dwell:  how long the key is held (touch up - touch down), per key;
//! - flight: how long the finger travels from one key to the next
//!           (release of the previous key -> press of this one), per key pair;
//! - offset: where the finger lands relative to the key's centre, as a fraction
//!           of the key's width (x) and height (y), per key.
//! A fingerprint keeps, per feature, only a running count, mean and variance.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Enrollment sessions needed before a stamp can be issued.
pub const MIN_PROFILE_SESSIONS: u32 = 2;
/// Key taps the fingerprint needs in total before a stamp can be issued.
pub const MIN_PROFILE_TAPS: u64 = 120;
/// Key taps one enrollment session must carry.
pub const MIN_ENROLL_TAPS: usize = 30;
/// Key taps a stamped session must carry: a short reply says little about who typed it.
pub const MIN_STAMP_TAPS: usize = 40;
/// Similarity at or above which a session matches the fingerprint.
pub const MATCH_THRESHOLD: f64 = 0.80;
/// Share of the final text that must come from key taps, not paste or suggestions.
pub const MIN_TYPED_RATIO: f64 = 0.80;

/// A down-to-down gap longer than this is a pause (thinking), not finger travel.
const MAX_GAP_MS: f64 = 1500.0;
/// A press longer than this is a long-press (accent menu), not a tap.
const MAX_DWELL_MS: f64 = 1000.0;
/// Per-feature memory: after this many samples the statistics become an
/// exponential moving average, so the fingerprint keeps up with the typist.
const N_CAP: f64 = 300.0;
/// Key pairs kept per fingerprint (the rarest are dropped beyond this).
const MAX_DIGRAPHS: usize = 1200;
/// A fingerprint feature is compared only once it has this many samples.
const MIN_FEATURE_N: f64 = 3.0;
/// Events read from one session.
pub const MAX_EVENTS: usize = 20_000;

/// The pooled feature over all keys (or all key pairs).
pub const ALL: &str = "*";

/// One keyboard event: a key tap (`k`, `d`, `u`, `x`, `y`) or text inserted
/// without taps (`ins`: paste, suggestion, autocorrect).
#[derive(Deserialize, Debug, Clone, Default)]
pub struct Event {
    /// What the key produced: one character ("a", "A", " ", "\n"), or a control
    /// key in angle brackets: "<bksp>", "<shift>", "<sym>", ...
    #[serde(default)]
    pub k: Option<String>,
    /// Touch down and touch up, ms since the session started.
    #[serde(default)]
    pub d: Option<f64>,
    #[serde(default)]
    pub u: Option<f64>,
    /// Touch point minus key centre, as a fraction of the key's width and height.
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
    /// Text that entered the field without key taps.
    #[serde(default)]
    pub ins: Option<String>,
}

/// What the keyboard sends, sealed to the enclave: one typing session.
#[derive(Deserialize, Debug, Clone)]
pub struct Session {
    #[serde(default)]
    pub v: u32,
    /// Keyboard layout and orientation; reserved for per-layout fingerprints.
    #[serde(default)]
    pub layout: Option<String>,
    /// On enrollment sessions: "compose" (the typist's own words) or "copy" (a
    /// shown sentence). Counted per fingerprint so that composed and copied
    /// typing can be told apart later.
    #[serde(default)]
    pub mode: Option<String>,
    pub events: Vec<Event>,
}

/// What kind of typing an enrollment session holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Compose,
    Copy,
}

impl Session {
    /// The session's `mode`: None when it has none, an error for a value the
    /// protocol does not define.
    pub fn enrollment_mode(&self) -> Result<Option<Mode>, &'static str> {
        match self.mode.as_deref() {
            None => Ok(None),
            Some("compose") => Ok(Some(Mode::Compose)),
            Some("copy") => Ok(Some(Mode::Copy)),
            Some(_) => Err("session.mode must be \"compose\" or \"copy\""),
        }
    }
}

/// Enrollment sessions per mode. Counts only: no text and no timing.
#[derive(Serialize, Deserialize, Default, Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModeCounts {
    pub compose: u32,
    pub copy: u32,
}

impl ModeCounts {
    pub fn add(&mut self, mode: Mode) {
        match mode {
            Mode::Compose => self.compose += 1,
            Mode::Copy => self.copy += 1,
        }
    }
}

/// Running statistics of one feature: (count, mean, variance).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
pub struct Stat(pub f64, pub f64, pub f64);

impl Stat {
    pub fn n(&self) -> f64 {
        self.0
    }
    pub fn mean(&self) -> f64 {
        self.1
    }
    pub fn std(&self) -> f64 {
        self.2.max(0.0).sqrt()
    }
    /// Welford's update up to N_CAP samples, an exponential moving average after.
    pub fn push(&mut self, x: f64) {
        if !x.is_finite() {
            return;
        }
        let Stat(n, mean, var) = *self;
        let delta = x - mean;
        if n < N_CAP {
            let n1 = n + 1.0;
            let mean1 = mean + delta / n1;
            let m2 = var * (n - 1.0).max(0.0) + delta * (x - mean1);
            *self = Stat(n1, mean1, if n1 > 1.0 { m2 / (n1 - 1.0) } else { 0.0 });
        } else {
            let a = 1.0 / N_CAP;
            *self = Stat(n, mean + a * delta, (1.0 - a) * (var + a * delta * delta));
        }
    }
}

/// The samples one session yields, per feature.
#[derive(Default, Debug)]
pub struct Features {
    pub dwell: BTreeMap<String, Vec<f64>>,
    pub flight: BTreeMap<String, Vec<f64>>,
    pub off_x: BTreeMap<String, Vec<f64>>,
    pub off_y: BTreeMap<String, Vec<f64>>,
    pub taps: usize,
}

fn is_control(k: &str) -> bool {
    k.len() > 2 && k.starts_with('<') && k.ends_with('>')
}

/// The physical key a tap was on: case folded (shift does not move the key),
/// space and enter named.
pub fn key_label(k: &str) -> String {
    match k {
        " " => "␣".into(),
        "\n" => "⏎".into(),
        _ if is_control(k) => k.to_string(),
        _ => k.to_lowercase(),
    }
}

fn push(map: &mut BTreeMap<String, Vec<f64>>, key: &str, v: f64) {
    map.entry(key.to_string()).or_default().push(v);
}

/// Dwell, flight and offset samples from a session's key taps.
pub fn extract(events: &[Event]) -> Features {
    let mut f = Features::default();
    let mut prev: Option<(String, f64, f64)> = None; // (key, down, up)
    for e in events.iter().take(MAX_EVENTS) {
        if e.ins.is_some() {
            prev = None; // inserted text breaks the chain of taps
            continue;
        }
        let (Some(k), Some(d), Some(u)) = (e.k.as_deref(), e.d, e.u) else {
            prev = None;
            continue;
        };
        if !d.is_finite() || !u.is_finite() || u < d {
            prev = None;
            continue;
        }
        let key = key_label(k);
        f.taps += 1;
        let dwell = u - d;
        if dwell <= MAX_DWELL_MS {
            push(&mut f.dwell, &key, dwell);
            push(&mut f.dwell, ALL, dwell);
        }
        if let (Some(x), Some(y)) = (e.x, e.y) {
            if x.is_finite() && y.is_finite() && x.abs() <= 1.0 && y.abs() <= 1.0 {
                push(&mut f.off_x, &key, x);
                push(&mut f.off_x, ALL, x);
                push(&mut f.off_y, &key, y);
                push(&mut f.off_y, ALL, y);
            }
        }
        if let Some((pk, pd, pu)) = &prev {
            let gap = d - pd;
            if (0.0..=MAX_GAP_MS).contains(&gap) {
                // finger travel: release of the previous key to press of this one;
                // negative when two thumbs overlap
                let flight = d - pu;
                push(&mut f.flight, &format!("{pk}>{key}"), flight);
                push(&mut f.flight, ALL, flight);
            }
        }
        prev = Some((key, d, u));
    }
    f
}

/// Whitespace in text rule v2: exactly the Unicode White_Space code points,
/// written out (docs/protocol.md, "Text rule v2"), so that the enclave, the
/// keyboard and every verifier agree whatever their language counts as
/// whitespace.
pub fn is_text_space(c: char) -> bool {
    matches!(
        c,
        '\u{0009}'..='\u{000D}'
            | '\u{0020}'
            | '\u{0085}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200A}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202F}'
            | '\u{205F}'
            | '\u{3000}'
    )
}

/// Text rule v2, the text a stamp's hash covers: every run of whitespace becomes
/// one space (U+0020) and whitespace at both ends is removed. Nothing else
/// changes: no Unicode normalisation, letters keep their case.
pub fn canonical_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut gap = false;
    for c in s.chars() {
        if is_text_space(c) {
            gap = !out.is_empty();
        } else {
            if gap {
                out.push(' ');
                gap = false;
            }
            out.push(c);
        }
    }
    out
}

/// The text a session leaves in the field, replayed from its events, and how
/// much of it came from key taps.
#[derive(Debug, Clone, PartialEq)]
pub struct Replay {
    /// The replayed text made canonical (text rule v2): what a stamp's
    /// `text_sha256` is the hash of.
    pub text: String,
    /// Its length in Unicode scalar values: a stamp's `text_chars`.
    pub text_chars: usize,
    /// Characters from key taps, and all characters, of the replayed text with
    /// CR removed and the ends trimmed (not collapsed): the typed share.
    pub typed_chars: usize,
    pub total_chars: usize,
}

impl Replay {
    pub fn typed_ratio(&self) -> f64 {
        if self.total_chars == 0 {
            0.0
        } else {
            self.typed_chars as f64 / self.total_chars as f64
        }
    }
}

/// Replays taps, backspaces and insertions. The text comes out canonical, the
/// way a verifier makes the text before a tag canonical; the typed share is
/// measured as in v0.1.
pub fn replay(events: &[Event]) -> Replay {
    let mut buf: Vec<(char, bool)> = Vec::new(); // (character, came from a key tap)
    for e in events.iter().take(MAX_EVENTS) {
        if let Some(ins) = &e.ins {
            buf.extend(ins.chars().map(|c| (c, false)));
            continue;
        }
        match e.k.as_deref() {
            Some("<bksp>") => {
                buf.pop();
            }
            Some(k) if is_control(k) => {}
            Some(k) => buf.extend(k.chars().map(|c| (c, true))),
            None => {}
        }
    }
    let text = canonical_text(&buf.iter().map(|(c, _)| *c).collect::<String>());
    buf.retain(|(c, _)| *c != '\r');
    let start = buf.iter().position(|(c, _)| !is_text_space(*c)).unwrap_or(buf.len());
    let end = buf
        .iter()
        .rposition(|(c, _)| !is_text_space(*c))
        .map(|i| i + 1)
        .unwrap_or(start)
        .max(start);
    let kept = &buf[start..end];
    Replay {
        text_chars: text.chars().count(),
        text,
        typed_chars: kept.iter().filter(|(_, t)| *t).count(),
        total_chars: kept.len(),
    }
}

/// A typist's fingerprint. Lives only sealed, inside the enclave's storage.
/// Fields added later default when an older fingerprint is read.
#[derive(Serialize, Deserialize, Default, Debug, Clone)]
#[serde(default)]
pub struct Profile {
    pub v: u32,
    pub sessions: u32,
    pub taps: u64,
    pub stamps: u32,
    /// Timestamp (ms) of the last accepted request: replay protection.
    pub last_ts: u64,
    /// Times (ms) of failed stamp attempts, for rate limiting.
    pub fails: Vec<u64>,
    pub dwell: BTreeMap<String, Stat>,
    pub flight: BTreeMap<String, Stat>,
    pub off_x: BTreeMap<String, Stat>,
    pub off_y: BTreeMap<String, Stat>,
    /// Enrollment sessions per mode (v0.2).
    pub modes: ModeCounts,
}

fn merge(p: &mut BTreeMap<String, Stat>, s: &BTreeMap<String, Vec<f64>>) {
    for (k, xs) in s {
        let st = p.entry(k.clone()).or_default();
        for &x in xs {
            st.push(x);
        }
    }
}

fn prune(p: &mut BTreeMap<String, Stat>, max: usize) {
    if p.len() <= max {
        return;
    }
    let mut by_n: Vec<(f64, String)> = p
        .iter()
        .filter(|(k, _)| k.as_str() != ALL)
        .map(|(k, s)| (s.n(), k.clone()))
        .collect();
    by_n.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let drop = p.len() - max;
    for (_, k) in by_n.into_iter().take(drop) {
        p.remove(&k);
    }
}

impl Profile {
    pub fn ready(&self) -> bool {
        self.sessions >= MIN_PROFILE_SESSIONS && self.taps >= MIN_PROFILE_TAPS
    }

    /// Fold a session's samples into the fingerprint.
    pub fn absorb(&mut self, f: &Features) {
        self.v = 1;
        merge(&mut self.dwell, &f.dwell);
        merge(&mut self.flight, &f.flight);
        merge(&mut self.off_x, &f.off_x);
        merge(&mut self.off_y, &f.off_y);
        prune(&mut self.flight, MAX_DIGRAPHS);
        self.sessions += 1;
        self.taps += f.taps as u64;
    }
}

/// How close one group of features is to the fingerprint.
#[derive(Serialize, Debug, Clone, Copy, PartialEq)]
pub struct GroupScore {
    /// 1 = indistinguishable from the fingerprint, 0 = nothing alike.
    pub sim: f64,
    /// Weighted mean distance in fingerprint standard deviations.
    pub dist: f64,
    /// Features compared.
    pub features: usize,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Score {
    pub score: f64,
    pub dwell: GroupScore,
    pub flight: GroupScore,
    pub offset: GroupScore,
}

// Noise floors: below these a standard deviation is measurement noise.
const FLOOR_DWELL_MS: f64 = 8.0;
const FLOOR_FLIGHT_MS: f64 = 15.0;
const FLOOR_OFFSET: f64 = 0.04;
// How much each group counts. Where the finger lands is the most personal on a phone.
const W_DWELL: f64 = 1.0;
const W_FLIGHT: f64 = 1.0;
const W_OFFSET: f64 = 1.5;
/// Distance (in standard deviations) at which similarity has fallen to e^-1.
const DIST_SCALE: f64 = 1.5;

fn accumulate(
    acc: &mut (f64, f64, usize),
    session: &BTreeMap<String, Vec<f64>>,
    profile: &BTreeMap<String, Stat>,
    floor: f64,
) {
    for (k, xs) in session {
        let Some(st) = profile.get(k) else { continue };
        if st.n() < MIN_FEATURE_N || xs.is_empty() {
            continue;
        }
        let m = xs.len() as f64;
        let mean = xs.iter().sum::<f64>() / m;
        let z = ((mean - st.mean()).abs() / st.std().max(floor)).min(5.0);
        let mut w = m.min(10.0) * (st.n().min(20.0) / 20.0);
        if k == ALL {
            w *= 3.0;
        }
        acc.0 += w * z;
        acc.1 += w;
        acc.2 += 1;
    }
}

fn group(parts: &[(&BTreeMap<String, Vec<f64>>, &BTreeMap<String, Stat>, f64)]) -> GroupScore {
    let mut acc = (0.0, 0.0, 0usize);
    for (s, p, floor) in parts {
        accumulate(&mut acc, s, p, *floor);
    }
    if acc.1 == 0.0 {
        return GroupScore { sim: 0.0, dist: 0.0, features: 0 };
    }
    let dist = acc.0 / acc.1;
    GroupScore { sim: (-(dist / DIST_SCALE).powi(2)).exp(), dist, features: acc.2 }
}

/// Compare a session with a fingerprint.
pub fn score(p: &Profile, f: &Features) -> Score {
    let dwell = group(&[(&f.dwell, &p.dwell, FLOOR_DWELL_MS)]);
    let flight = group(&[(&f.flight, &p.flight, FLOOR_FLIGHT_MS)]);
    let offset = group(&[(&f.off_x, &p.off_x, FLOOR_OFFSET), (&f.off_y, &p.off_y, FLOOR_OFFSET)]);
    let (mut num, mut den) = (0.0, 0.0);
    for (g, w) in [(&dwell, W_DWELL), (&flight, W_FLIGHT), (&offset, W_OFFSET)] {
        if g.features > 0 {
            num += w * g.sim;
            den += w;
        }
    }
    Score { score: if den > 0.0 { num / den } else { 0.0 }, dwell, flight, offset }
}

/// Why a session gets no stamp (a NO_MATCH answer). The code is stable, for
/// the keyboard's messages; the reason text may change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    Empty,
    TooShort,
    Pasted,
    Mismatch,
}

impl Refusal {
    pub fn code(self) -> &'static str {
        match self {
            Refusal::Empty => "R_EMPTY",
            Refusal::TooShort => "R_TOO_SHORT",
            Refusal::Pasted => "R_PASTED",
            Refusal::Mismatch => "R_MISMATCH",
        }
    }

    pub fn reason(self) -> &'static str {
        match self {
            Refusal::Empty => "empty text",
            Refusal::TooShort => "too short: not enough key taps to tell who typed it",
            Refusal::Pasted => "too much of the text was pasted or inserted, not typed",
            Refusal::Mismatch => "typing does not match this account's fingerprint",
        }
    }
}

/// MATCH, or why not.
pub fn verdict(score: f64, typed_ratio: f64, taps: usize, chars: usize) -> Result<(), Refusal> {
    if chars == 0 {
        Err(Refusal::Empty)
    } else if taps < MIN_STAMP_TAPS {
        Err(Refusal::TooShort)
    } else if typed_ratio < MIN_TYPED_RATIO {
        Err(Refusal::Pasted)
    } else if score < MATCH_THRESHOLD {
        Err(Refusal::Mismatch)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tap(k: &str, d: f64, u: f64, x: f64, y: f64) -> Event {
        Event { k: Some(k.into()), d: Some(d), u: Some(u), x: Some(x), y: Some(y), ins: None }
    }

    /// Deterministic pseudo-random numbers (xorshift) for synthetic typists.
    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> f64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            (self.0 >> 11) as f64 / (1u64 << 53) as f64
        }
        fn gauss(&mut self) -> f64 {
            let (u1, u2) = (self.next().max(1e-12), self.next());
            (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
        }
    }

    /// A synthetic typist: base dwell, base flight, and where they hit keys.
    struct Typist {
        dwell: f64,
        flight: f64,
        ox: f64,
        oy: f64,
    }

    fn session(t: &Typist, text: &str, seed: u64) -> Vec<Event> {
        let mut r = Rng(seed);
        let mut now = 0.0;
        let mut ev = Vec::new();
        for ch in text.chars() {
            let k = ch.to_string();
            // per-key personality: a fixed offset derived from the character
            let kb = (ch as u32 % 7) as f64;
            let d = now + (t.flight + kb * 6.0 + 30.0 * r.gauss()).max(-40.0);
            let u = d + (t.dwell + kb * 3.0 + 12.0 * r.gauss()).max(20.0);
            ev.push(tap(&k, d, u, t.ox + 0.07 * r.gauss(), t.oy + 0.07 * r.gauss()));
            now = u;
        }
        ev
    }

    const TEXT: &str = "the quick brown fox jumps over the lazy dog while i type my notes on the phone";

    fn enrolled(t: &Typist) -> Profile {
        let mut p = Profile::default();
        for s in 0..3 {
            p.absorb(&extract(&session(t, TEXT, 1000 + s)));
        }
        p
    }

    #[test]
    fn welford_matches_batch_statistics() {
        let xs = [10.0, 12.0, 9.0, 15.0, 11.0];
        let mut s = Stat::default();
        xs.iter().for_each(|&x| s.push(x));
        let mean = xs.iter().sum::<f64>() / 5.0;
        let var = xs.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / 4.0;
        assert!((s.mean() - mean).abs() < 1e-9 && (s.2 - var).abs() < 1e-9);
    }

    #[test]
    fn replay_handles_backspace_insertions_and_trim() {
        let ev = vec![
            tap(" ", 0.0, 50.0, 0.0, 0.0),
            tap("H", 100.0, 150.0, 0.0, 0.0),
            tap("i", 200.0, 250.0, 0.0, 0.0),
            tap("x", 300.0, 350.0, 0.0, 0.0),
            tap("<bksp>", 400.0, 450.0, 0.0, 0.0),
            Event { ins: Some(" there".into()), ..Default::default() },
            tap("<shift>", 500.0, 550.0, 0.0, 0.0),
            tap("\n", 600.0, 650.0, 0.0, 0.0),
        ];
        let r = replay(&ev);
        assert_eq!(r.text, "Hi there");
        assert_eq!(r.text_chars, 8);
        assert_eq!((r.typed_chars, r.total_chars), (2, 8));
    }

    fn typed(text: &str) -> Vec<Event> {
        text.chars()
            .enumerate()
            .map(|(i, c)| tap(&c.to_string(), i as f64 * 150.0, i as f64 * 150.0 + 80.0, 0.0, 0.0))
            .collect()
    }

    /// docs/test-vectors/text-v2.json, shared with the keyboard and every verifier.
    const TEXT_VECTORS: &str = include_str!("../../docs/test-vectors/text-v2.json");

    #[test]
    fn canonical_text_matches_the_shared_vectors() {
        use sha2::{Digest, Sha256};
        let v: serde_json::Value = serde_json::from_str(TEXT_VECTORS).unwrap();
        let cases = v["canonical"].as_array().unwrap();
        assert!(cases.len() >= 10);
        for c in cases {
            let name = c["name"].as_str().unwrap();
            let got = canonical_text(c["input"].as_str().unwrap());
            assert_eq!(got, c["canonical"].as_str().unwrap(), "{name}");
            assert_eq!(got.chars().count() as u64, c["chars"].as_u64().unwrap(), "{name}");
            assert_eq!(hex::encode(Sha256::digest(got.as_bytes())), c["sha256"].as_str().unwrap(), "{name}");
        }
        // What a v2 stamp covers: the last text_chars of the canonical text before its tag.
        for c in v["covered"].as_array().unwrap().iter().filter(|c| c["v"] == 2) {
            let canon: Vec<char> = canonical_text(c["prefix"].as_str().unwrap()).chars().collect();
            let n = c["chars"].as_u64().unwrap() as usize;
            let covered = (canon.len() >= n).then(|| canon[canon.len() - n..].iter().collect::<String>());
            assert_eq!(covered.as_deref(), c["covered"].as_str(), "{}", c["name"]);
        }
    }

    #[test]
    fn replay_gives_the_canonical_text_and_keeps_the_typed_share() {
        use sha2::{Digest, Sha256};
        // Runs of whitespace collapse in the stamped text...
        let r = replay(&typed("  Hello  world\n \n"));
        assert_eq!((r.text.as_str(), r.text_chars), ("Hello world", 11));
        // ...while the typed share is still counted over the trimmed text, uncollapsed.
        assert_eq!((r.typed_chars, r.total_chars), (12, 12));
        // A lone CR is whitespace, as in every verifier.
        assert_eq!(replay(&typed("a\rb")).text, "a b");
        // The demo reply typed key by key hashes to the shared vector.
        let v: serde_json::Value = serde_json::from_str(TEXT_VECTORS).unwrap();
        let demo = v["canonical"].as_array().unwrap().iter().find(|c| c["name"] == "the demo reply").unwrap();
        let r = replay(&typed(demo["input"].as_str().unwrap()));
        assert_eq!(hex::encode(Sha256::digest(r.text.as_bytes())), demo["sha256"].as_str().unwrap());
        assert_eq!(r.text_chars as u64, demo["chars"].as_u64().unwrap());
        assert_eq!(r.typed_ratio(), 1.0);
    }

    #[test]
    fn whitespace_is_the_explicit_list() {
        let listed = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000];
        for cp in listed.into_iter().chain(0x2000..=0x200a) {
            assert!(is_text_space(char::from_u32(cp).unwrap()), "U+{cp:04X}");
        }
        for c in ['\u{200B}', '\u{FEFF}', '\u{001C}', '\u{180E}', '\u{2060}', 'a', '_'] {
            assert!(!is_text_space(c), "U+{:04X}", c as u32);
        }
        assert_eq!((0..=0x10FFFF).filter_map(char::from_u32).filter(|c| is_text_space(*c)).count(), 25);
    }

    #[test]
    fn enrollment_mode_is_counted_and_older_fingerprints_still_load() {
        let s: Session = serde_json::from_str(r#"{"v":1,"layout":"qwerty-en-portrait-v1","mode":"copy","events":[]}"#).unwrap();
        assert_eq!(s.enrollment_mode(), Ok(Some(Mode::Copy)));
        let none: Session = serde_json::from_str(r#"{"v":1,"events":[]}"#).unwrap();
        assert_eq!(none.enrollment_mode(), Ok(None));
        let bad: Session = serde_json::from_str(r#"{"mode":"dictate","events":[]}"#).unwrap();
        assert!(bad.enrollment_mode().is_err());

        let mut p = Profile::default();
        for m in [Mode::Compose, Mode::Copy, Mode::Compose] {
            p.modes.add(m);
        }
        assert_eq!(p.modes, ModeCounts { compose: 2, copy: 1 });
        // counts only: two numbers, nothing typed
        assert_eq!(serde_json::to_value(p.modes).unwrap(), serde_json::json!({ "compose": 2, "copy": 1 }));

        // A fingerprint stored by v0.1 has no mode counts and still loads.
        let old = r#"{"v":1,"sessions":3,"taps":318,"stamps":1,"last_ts":5,"fails":[],"dwell":{"*":[3.0,90.0,100.0]},"flight":{},"off_x":{},"off_y":{}}"#;
        let p: Profile = serde_json::from_str(old).unwrap();
        assert_eq!((p.sessions, p.taps, p.modes), (3, 318, ModeCounts::default()));
        assert_eq!(p.dwell[ALL], Stat(3.0, 90.0, 100.0));
    }

    #[test]
    fn same_typist_matches_and_another_does_not() {
        let alice = Typist { dwell: 85.0, flight: 140.0, ox: 0.12, oy: 0.10 };
        let bob = Typist { dwell: 125.0, flight: 210.0, ox: -0.10, oy: -0.12 };
        let p = enrolled(&alice);
        assert!(p.ready());
        let genuine = score(&p, &extract(&session(&alice, TEXT, 77)));
        let impostor = score(&p, &extract(&session(&bob, TEXT, 77)));
        assert!(genuine.score >= MATCH_THRESHOLD, "genuine {genuine:?}");
        assert!(impostor.score < MATCH_THRESHOLD, "impostor {impostor:?}");
    }

    #[test]
    fn verdict_requires_length_typing_and_match() {
        assert!(verdict(0.9, 1.0, 50, 50).is_ok());
        assert_eq!(verdict(0.9, 1.0, 50, 0), Err(Refusal::Empty));
        assert_eq!(verdict(0.9, 1.0, 10, 10), Err(Refusal::TooShort));
        assert_eq!(verdict(0.9, 0.5, 50, 50), Err(Refusal::Pasted));
        assert_eq!(verdict(0.5, 1.0, 50, 50), Err(Refusal::Mismatch));
        let codes = [Refusal::Empty, Refusal::TooShort, Refusal::Pasted, Refusal::Mismatch].map(Refusal::code);
        assert_eq!(codes, ["R_EMPTY", "R_TOO_SHORT", "R_PASTED", "R_MISMATCH"]);
    }
}

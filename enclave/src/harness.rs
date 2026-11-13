//! Tuning harness for the matcher (TODO.md 2.6). Native only: on wasm32 this
//! binary is an empty stub.
//!
//! ```text
//! cargo run --release --bin harness -- [FOLDER] [--enroll N]
//! ```
//!
//! FOLDER holds typing sessions, one per file, named `<typist>-<anything>.json`,
//! in the session format of docs/protocol.md. Default: `typing-data/` at the
//! repository root, which git ignores. Real sessions are biometric data: keep
//! them there and never commit them. `client/synth-export.mjs` writes sessions
//! of synthetic typists in the same form.
//!
//! Each typist is enrolled on their first N sessions in file-name order
//! (default 3), as the enclave's `enroll` folds sessions into a fingerprint.
//! Every later session is then scored with model.rs against every typist's
//! fingerprint: against its own typist's it is a genuine attempt, against
//! anyone else's an impostor attempt. The harness prints both score
//! distributions and the share at or above MATCH_THRESHOLD. Fingerprints are
//! not updated while scoring (the enclave also folds in each stamped session).

#[cfg(not(target_arch = "wasm32"))]
#[allow(dead_code)]
#[path = "model.rs"]
mod model;

#[cfg(target_arch = "wasm32")]
fn main() {}

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    if let Err(e) = native::run() {
        eprintln!("harness: {e}");
        std::process::exit(2);
    }
}

#[cfg(not(target_arch = "wasm32"))]
mod native {
    use crate::model::{self, Features, Profile, Score};
    use std::collections::BTreeMap;
    use std::path::{Path, PathBuf};

    const USAGE: &str = "usage: cargo run --release --bin harness -- [FOLDER] [--enroll N]\n  \
        FOLDER     session files named <typist>-<anything>.json (default: typing-data/ at the repository root)\n  \
        --enroll N enroll each typist on their first N sessions (default 3)";

    /// One session file, measured.
    struct Sample {
        file: String,
        features: Features,
        typed_ratio: f64,
        chars: usize,
    }

    /// One session scored against one fingerprint.
    struct Attempt {
        score: Score,
        /// Whether the enclave would sign a stamp: a ready fingerprint, the
        /// score, at least MIN_STAMP_TAPS taps and the typed share.
        stamp: bool,
    }

    pub fn run() -> Result<(), String> {
        let (dir, n_enroll) = parse_args()?;
        let typists = read_sessions(&dir)?;
        let full = dir.canonicalize().unwrap_or_else(|_| dir.clone()).display().to_string();
        let shown = full.trim_start_matches(r"\\?\");
        if typists.is_empty() {
            return Err(format!("no session files named <typist>-<anything>.json in {shown}"));
        }
        println!("NTK tuning harness: {shown}");
        println!("Each typist is enrolled on their first {n_enroll} sessions; every later session is scored against every fingerprint.\n");

        let mut profiles: BTreeMap<&str, Profile> = BTreeMap::new();
        for (typist, samples) in &typists {
            let mut p = Profile::default();
            let mut refused = Vec::new();
            for s in samples.iter().take(n_enroll) {
                if s.features.taps < model::MIN_ENROLL_TAPS {
                    refused.push(s.file.as_str());
                } else {
                    p.absorb(&s.features);
                }
            }
            println!(
                "{typist:<12} {:>3} sessions; fingerprint from {} sessions, {} taps{}{}",
                samples.len(),
                p.sessions,
                p.taps,
                if p.ready() { "" } else { "; NOT READY, the enclave would refuse every stamp" },
                if refused.is_empty() {
                    String::new()
                } else {
                    format!("; refused for enrollment (under {} taps): {}", model::MIN_ENROLL_TAPS, refused.join(", "))
                }
            );
            profiles.insert(typist.as_str(), p);
        }

        let mut genuine = Vec::new();
        let mut impostor = Vec::new();
        let mut pairs: BTreeMap<(&str, &str), Vec<f64>> = BTreeMap::new();
        for (typist, samples) in &typists {
            for s in samples.iter().skip(n_enroll) {
                for (owner, p) in &profiles {
                    let score = model::score(p, &s.features);
                    let stamp = p.ready() && model::verdict(score.score, s.typed_ratio, s.features.taps, s.chars).is_ok();
                    pairs.entry((owner, typist.as_str())).or_default().push(score.score);
                    if owner == typist {
                        genuine.push(Attempt { score, stamp });
                    } else {
                        impostor.push(Attempt { score, stamp });
                    }
                }
            }
        }

        let thr = model::MATCH_THRESHOLD;
        println!("\nScores (MATCH_THRESHOLD {thr}); \"stamp\" also needs {} taps and {:.0}% typed:", model::MIN_STAMP_TAPS, model::MIN_TYPED_RATIO * 100.0);
        println!("{:<20} {:>8} {:>6} {:>6} {:>6} {:>6} {:>6}  {:>13}  {:>13}", "", "attempts", "min", "q1", "median", "q3", "max", format!(">= {thr}"), "stamp");
        println!("{}", distribution("genuine (own)", &genuine));
        println!("{}", distribution("impostor (others')", &impostor));

        println!("\nMedian similarity per group (groups with features only):");
        println!("{:<20} {:>6} {:>6} {:>6}", "", "dwell", "flight", "offset");
        for (label, attempts) in [("genuine", &genuine), ("impostor", &impostor)] {
            let med = |pick: fn(&Score) -> (f64, usize)| {
                let xs = sorted(attempts.iter().map(|a| pick(&a.score)).filter(|(_, n)| *n > 0).map(|(sim, _)| sim));
                if xs.is_empty() { "-".to_string() } else { format!("{:.3}", quantile(&xs, 0.5)) }
            };
            println!(
                "{label:<20} {:>6} {:>6} {:>6}",
                med(|s| (s.dwell.sim, s.dwell.features)),
                med(|s| (s.flight.sim, s.flight.features)),
                med(|s| (s.offset.sim, s.offset.features))
            );
        }

        println!("\nPer fingerprint and typist:");
        println!("{:<12} {:<12} {:>8} {:>6} {:>6} {:>6}  {:>13}", "fingerprint", "typist", "attempts", "min", "median", "max", format!(">= {thr}"));
        for ((owner, typist), scores) in &pairs {
            let xs = sorted(scores.iter().copied());
            let at = xs.iter().filter(|x| **x >= thr).count();
            println!(
                "{owner:<12} {typist:<12} {:>8} {:>6.3} {:>6.3} {:>6.3}  {:>13}",
                xs.len(),
                xs[0],
                quantile(&xs, 0.5),
                xs[xs.len() - 1],
                share(at, xs.len())
            );
        }
        println!("\nThe constants to tune (MATCH_THRESHOLD, DIST_SCALE, the noise floors, the group weights) are in src/model.rs, which the enclave uses as is.");
        Ok(())
    }

    fn parse_args() -> Result<(PathBuf, usize), String> {
        let count = |v: Option<String>| {
            v.and_then(|v| v.parse::<usize>().ok())
                .filter(|n| *n > 0)
                .ok_or_else(|| format!("--enroll needs a number of sessions, 1 or more\n{USAGE}"))
        };
        let mut dir: Option<PathBuf> = None;
        let mut n = 3;
        let mut args = std::env::args().skip(1);
        while let Some(a) = args.next() {
            match a.as_str() {
                "-h" | "--help" => {
                    println!("{USAGE}");
                    std::process::exit(0);
                }
                "--enroll" | "-n" => n = count(args.next())?,
                _ if a.starts_with("--enroll=") => n = count(Some(a["--enroll=".len()..].to_string()))?,
                _ if a.starts_with('-') => return Err(format!("unknown option {a}\n{USAGE}")),
                _ if dir.is_some() => return Err(format!("one folder only\n{USAGE}")),
                _ => dir = Some(PathBuf::from(&a)),
            }
        }
        let dir = dir.unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("typing-data"));
        Ok((dir, n))
    }

    /// Session files by typist, each typist's in file-name order.
    fn read_sessions(dir: &Path) -> Result<BTreeMap<String, Vec<Sample>>, String> {
        let entries = std::fs::read_dir(dir).map_err(|e| format!("cannot read {}: {e}\n{USAGE}", dir.display()))?;
        let mut files: Vec<PathBuf> = entries
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.is_file() && p.extension().is_some_and(|x| x == "json"))
            .collect();
        files.sort();
        let mut by_typist: BTreeMap<String, Vec<Sample>> = BTreeMap::new();
        for path in files {
            let file = path.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
            let Some(typist) = file.split_once('-').map(|(t, _)| t.to_string()).filter(|t| !t.is_empty()) else {
                eprintln!("skipped {file}: not named <typist>-<anything>.json");
                continue;
            };
            let parsed = std::fs::read_to_string(&path)
                .map_err(|e| e.to_string())
                .and_then(|t| serde_json::from_str::<model::Session>(&t).map_err(|e| e.to_string()));
            let session = match parsed {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("skipped {file}: {e}");
                    continue;
                }
            };
            let r = model::replay(&session.events);
            by_typist.entry(typist).or_default().push(Sample {
                file,
                features: model::extract(&session.events),
                typed_ratio: r.typed_ratio(),
                chars: r.text_chars,
            });
        }
        Ok(by_typist)
    }

    fn sorted(xs: impl Iterator<Item = f64>) -> Vec<f64> {
        let mut v: Vec<f64> = xs.collect();
        v.sort_by(|a, b| a.total_cmp(b));
        v
    }

    /// Linear interpolation between the closest ranks; `sorted` is not empty.
    fn quantile(sorted: &[f64], q: f64) -> f64 {
        let pos = q * (sorted.len() - 1) as f64;
        let (lo, hi) = (pos.floor() as usize, pos.ceil() as usize);
        sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo as f64)
    }

    fn share(k: usize, n: usize) -> String {
        format!("{k}/{n} {:.0}%", 100.0 * k as f64 / n.max(1) as f64)
    }

    fn distribution(label: &str, attempts: &[Attempt]) -> String {
        if attempts.is_empty() {
            return format!("{label:<20} no attempts");
        }
        let xs = sorted(attempts.iter().map(|a| a.score.score));
        let at = xs.iter().filter(|x| **x >= model::MATCH_THRESHOLD).count();
        let stamps = attempts.iter().filter(|a| a.stamp).count();
        format!(
            "{label:<20} {:>8} {:>6.3} {:>6.3} {:>6.3} {:>6.3} {:>6.3}  {:>13}  {:>13}",
            xs.len(),
            xs[0],
            quantile(&xs, 0.25),
            quantile(&xs, 0.5),
            quantile(&xs, 0.75),
            xs[xs.len() - 1],
            share(at, xs.len()),
            share(stamps, xs.len())
        )
    }
}

#!/usr/bin/env bash
# Reproducible build of the enclave: the same wasm, byte for byte, on any
# machine with Docker. The compiler image is pinned by digest, the dependencies
# by Cargo.lock, and every path the compiler sees is fixed inside the container,
# so anyone can rebuild the binary and compare its hash with the version that is
# active on chain (README, "Rebuild the binary that is live").
#
#   bash enclave/build-reproducible.sh
#
# Writes enclave/dist/ntk-enclave.wasm and prints its sha256.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash on Windows: keep /src and /out as they are

IMAGE="rust:1.91.1-slim-bookworm@sha256:8514999d4786ef12efe89239e86b3d0a021b94b9d35108c8efe6c79ca7dc1a65"

cd "$(dirname "$0")"
mkdir -p dist
here="$(pwd -W 2>/dev/null || pwd)"   # a Windows path under Git Bash, a POSIX one elsewhere

docker run --rm \
  -v "$here:/src:ro" \
  -v "$here/dist:/out" \
  -w /src \
  -e CARGO_HOME=/cargo \
  -e CARGO_TARGET_DIR=/build \
  "$IMAGE" \
  sh -c 'rustup target add wasm32-wasip2 >/dev/null 2>&1 \
    && cargo build --release --locked --target wasm32-wasip2 --bin ntk-enclave --quiet \
    && cp /build/wasm32-wasip2/release/ntk-enclave.wasm /out/ntk-enclave.wasm \
    && cd /out && sha256sum ntk-enclave.wasm'

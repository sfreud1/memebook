#!/usr/bin/env bash
# Full local test run: fresh ledger, build, deploy, exercise.
#
# Anchor 1.2's `anchor test` shells out to surfpool, and cargo-build-sbf's
# default sBPF v3 output is rejected by the upgradeable loader, so this drives
# solana-test-validator directly and builds for v0.
set -euo pipefail

export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

LEDGER="${TMPDIR:-/tmp}/memebook-ledger-$(basename "${1:-memebook}" .ts)"
RPC="http://127.0.0.1:8899"

cleanup() { [[ -n "${VALIDATOR_PID:-}" ]] && kill "$VALIDATOR_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> stopping any running validator"
pkill -f solana-test-validator 2>/dev/null || true
sleep 2

# SKIP_BUILD=1 reuses target/ as-is (e.g. while a fuzz run holds the .so).
if [[ -z "${SKIP_BUILD:-}" ]]; then
  echo "==> generating IDL + types"
  anchor build >/dev/null 2>&1

  echo "==> building sBPF v0 binary"
  cargo build-sbf --manifest-path programs/memebook/Cargo.toml --arch v0 >/dev/null 2>&1
else
  echo "==> SKIP_BUILD set, reusing target/deploy/memebook.so"
fi

echo "==> starting validator on a fresh ledger"
rm -rf "$LEDGER"
solana-test-validator --reset --quiet --ledger "$LEDGER" &
VALIDATOR_PID=$!

for _ in $(seq 1 60); do
  solana --url "$RPC" cluster-version >/dev/null 2>&1 && break
  sleep 1
done
solana --url "$RPC" cluster-version >/dev/null

echo "==> deploying"
solana --url "$RPC" airdrop 100 >/dev/null 2>&1 || true
solana program deploy target/deploy/memebook.so \
  --program-id target/deploy/memebook-keypair.json \
  --url "$RPC" >/dev/null

echo "==> running suite"
export ANCHOR_PROVIDER_URL="$RPC"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
# Each suite initialises the Config singleton, so they need separate ledgers.
# Pass a file to run just that one; default is the behavioural suite.
npx ts-mocha -p ./tsconfig.json -t 1000000 "${1:-tests/memebook.ts}"

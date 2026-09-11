#!/usr/bin/env bash
# Brings the local stack up: validator, program, demo book, indexer.
# The frontend is left to `cd app && yarn dev` so its output stays readable.
set -euo pipefail

export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

RPC="http://127.0.0.1:8899"
LEDGER="${TMPDIR:-/tmp}/memebook-dev-ledger"
LOGS="$HERE/.dev-logs"
mkdir -p "$LOGS"

echo "==> stopping previous validator / indexer, if any"
pkill -f solana-test-validator 2>/dev/null || true
pkill -f "tsx src/index.ts" 2>/dev/null || true
sleep 2

echo "==> building"
anchor build >/dev/null 2>&1
cargo build-sbf --manifest-path programs/memebook/Cargo.toml --arch v0 >/dev/null 2>&1

echo "==> validator"
rm -rf "$LEDGER"
nohup solana-test-validator --reset --quiet --ledger "$LEDGER" > "$LOGS/validator.log" 2>&1 &
for _ in $(seq 1 60); do
  solana --url "$RPC" cluster-version >/dev/null 2>&1 && break
  sleep 1
done
solana --url "$RPC" cluster-version >/dev/null

echo "==> deploying program"
solana --url "$RPC" airdrop 100 >/dev/null 2>&1 || true
solana program deploy target/deploy/memebook.so \
  --program-id target/deploy/memebook-keypair.json --url "$RPC" >/dev/null

echo "==> seeding a demo book"
ANCHOR_PROVIDER_URL="$RPC" ANCHOR_WALLET="$HOME/.config/solana/id.json" \
  npx tsx scripts/seed.ts 2>&1 | sed 's/^/    /'

echo "==> indexer"
rm -rf indexer/.data
( cd indexer && RPC_URL="$RPC" PORT=8080 nohup npx tsx src/index.ts > "$LOGS/indexer.log" 2>&1 & )
for _ in $(seq 1 40); do
  curl -sf http://127.0.0.1:8080/health >/dev/null 2>&1 && break
  sleep 1
done

echo ""
echo "    validator  $RPC"
echo "    api        http://127.0.0.1:8080  $(curl -s http://127.0.0.1:8080/health)"
echo "    logs       $LOGS/"

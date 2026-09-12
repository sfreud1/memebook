# memebook

Fixed-term, oracle-free, liquidation-free peer-to-peer lending against
long-tail Solana tokens.

A lender posts an offer — *this collateral mint, this much principal, this
ratio, this rate, this duration*. A borrower draws against it, in full or in
part, and their collateral goes into a per-loan escrow PDA. Nothing marks the
position to market for the life of the loan. At maturity the borrower either
repays principal plus a fixed interest amount and takes their collateral back,
or they walk away and the lender claims the collateral token itself.

**There is no price feed anywhere in the program.** That is the central design
decision. The assets this targets have thin, manipulable liquidity, and oracle
manipulation is what has historically drained lending protocols that tried to
mark them to market. Risk is priced once, by a human, when the offer is written.

## Layout

```
programs/memebook/   Anchor program — the only authoritative state
indexer/             Event stream -> Postgres projection + read API
app/                 Next.js frontend
scripts/seed.ts      Populates a local validator with a demo book
run-tests.sh         Fresh ledger, build, deploy, full suite
```

## Why an indexer sits in the middle

The frontend never calls an RPC node to read. `getProgramAccounts` over a
growing offer book is precisely the query that collapses under traffic, so the
program emits an event on every state transition, the indexer projects those
into indexed tables, and the UI reads a normal HTTP API. The RPC connection in
the browser exists only to sign and send transactions.

Projections are idempotent and the raw event log is retained, so a projection
bug is fixed by replaying `events` rather than re-hitting the chain.

`PGlite` is the default database so the thing runs with no install. Set
`DATABASE_URL` and the identical SQL runs against a real Postgres.

## Running it locally

Three processes. Terminal 1 — chain, program and demo data:

```bash
./run-tests.sh          # optional: proves the program works first
```

```bash
solana-test-validator --reset --quiet --ledger /tmp/memebook-ledger
```

```bash
solana program deploy target/deploy/memebook.so \
  --program-id target/deploy/memebook-keypair.json --url http://127.0.0.1:8899
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
ANCHOR_WALLET=~/.config/solana/id.json npx tsx scripts/seed.ts
```

Terminal 2 — indexer + API on `:8080`:

```bash
cd indexer && RPC_URL=http://127.0.0.1:8899 yarn start
```

Terminal 3 — frontend on `:3000`:

```bash
cd app && yarn dev
```

## Economics

Interest is simple, fixed at accept time, and never accrues:

```
interest = ceil(principal * apr_bps * duration_seconds / (10_000 * 31_536_000))
```

Partial draws take pro-rata collateral, rounded **up**, so an offer cannot be
shaved by slicing it into dust loans. Fees round **down**, always in the user's
favour.

Three protocol fees, all configurable, all hard-capped in the program so a
compromised admin key cannot confiscate a position:

| Fee | Default | Cap | Paid by |
|---|---|---|---|
| Origination | 10% of interest | 30% | borrower, deducted from disbursed principal |
| Interest | 5% of interest | 30% | lender, skimmed at repayment |
| Default | 0.1% of collateral | 1% | lender, on claiming a defaulted loan |

That is ~15% of interest to the protocol. Jupiter's Offerbook takes 35%.

## Security decisions worth knowing

**Collateral mints are screened.** Token-2022's `PermanentDelegate` lets a mint
authority transfer escrowed collateral straight out from under the lender;
`TransferHook` hands arbitrary code a CPI on every move; `TransferFeeConfig`
means the amount that arrives is not the amount sent. These and several others
are rejected at `create_offer`. Every transfer additionally measures a real
balance delta rather than trusting the instruction argument.

**A lender cannot force a default.** If the lender's principal token account
could go missing before maturity, repayment would have no destination and the
collateral would fall to them for free. `repay` creates it if needed.

**Pausing cannot strand collateral.** The pause flag blocks new offers and new
loans. `repay` and `claim_default` stay live in every state.

**Admin handover is two-step.** A typo in `propose_admin` cannot brick the
protocol; the key only takes effect once the new holder signs for it.

**Rent follows whoever paid it.** Defaulting costs the borrower their
collateral, not the rent they fronted on the loan and vault accounts.

## Toolchain notes

Anchor 1.2 shells `anchor test` out to `surfpool`, and `cargo-build-sbf`
emits sBPF v3, which the upgradeable loader rejects. `run-tests.sh` therefore
drives `solana-test-validator` directly and builds with `--arch v0`. Deploying
the v3 binary instead requires `solana program-v4 deploy`.

`MIN_DURATION_SECONDS` is 60 — a sanity floor only. Real terms are set by
lenders per offer.

## Tests

```bash
./run-tests.sh                         # behaviour — 15 tests
./run-tests.sh tests/invariants.ts     # invariants — 4 tests
./run-tests.sh tests/fee-collision.ts  # one wallet in two roles — 4 tests
```

Each suite initialises the `Config` singleton, so they run on separate ledgers.
`SKIP_BUILD=1` reuses `target/` as it is — useful while a fuzz run holds the
`.so`, or when only the tests changed.

`initialize_config` only accepts the program's upgrade authority, so the suites
pass the loader's `ProgramData` account (`programDataPda` in `tests/helpers.ts`)
and the fuzz harness points that account's authority at its payer before
calling it.

`tests/memebook.ts` checks that each instruction does what it says.
`tests/invariants.ts` checks the properties that must hold in *every* reachable
state, because violating one of those makes the protocol insolvent rather than
merely wrong:

| | Invariant |
|---|---|
| **I1** | an open offer's vault holds exactly its undrawn principal |
| **I2** | an active loan's vault holds exactly its recorded collateral |
| **I3** | `principal_total == principal_available + everything ever drawn` |
| **I4** | tokens are conserved — the program never mints or burns |

All four are asserted after *every* state transition in a randomised operation
sequence, not just at the end. The generator is seeded, so any failure is
reproducible:

```bash
FUZZ_OPS=500 FUZZ_SEED=42 ./run-tests.sh tests/invariants.ts
```

The suite also pins down three specific attacks: splitting one draw into many to
post less collateral (it costs more, never less — pro-rata collateral rounds
up), settling somebody else's position, and claiming an already-claimed loan.

## Fuzzing

```bash
cargo build-sbf --manifest-path programs/memebook/Cargo.toml --arch v0
cd trident-tests && trident fuzz run fuzz_0
```

The first line matters: Trident loads the compiled `.so` into its own SVM, and
that SVM rejects the sBPF v3 binary `anchor build` produces — the program
simply reports itself as not deployed and every instruction fails. Build for v0
before fuzzing.

Where the hand-written suites check situations somebody thought to write down,
this builds sequences nobody chose: every instruction in random order, amounts
and rates weighted toward the awkward parts of the range but still reaching the
extremes, and the clock jumping forward at arbitrary points so maturity lands
wherever it lands. The same solvency invariants are asserted after each
iteration.

That distinction is not academic. The behavioural suite passed for days while
repayment was impossible whenever one wallet held two roles, because every test
in it gave those roles separate keypairs.

Longer campaigns:

```bash
FUZZ_ITERATIONS=50000 FUZZ_FLOWS=100 trident fuzz run fuzz_0
```

A failure prints the master seed; `trident fuzz debug fuzz_0 <SEED>` replays
that exact run.

## Keys on devnet

Both keys that can change the protocol sit behind a 2-of-2 Squads multisig.
It is a Squads **v3** multisig, because devnet.squads.so is the only Squads
app that runs on devnet — and it is being decommissioned on 1 October 2026.
Mainnet will be set up again with v4 at app.squads.so.

| | Address |
|---|---|
| Squad (multisig account) | `Ecd8Zk9ura7BNCK6rtApNtHs8B6svCathJxiipRF3VoT` |
| Vault — program upgrade authority **and** `Config.admin` | `A7yJ5GxBubFqXFNPtrSboXvL1L9PBaPkJGskEFtTUMFP` |
| Members | `HKcahG2r…dY7M` (Phantom), `FAEkA2Ky…eE1f` (deploy key) |

What that changes: `solana program deploy` from the deploy key no longer
works — an upgrade is a Squads program-upgrade transaction (Developers →
Programs). `set_fees`, `set_paused`, `set_fee_recipient` and `propose_admin`
need the vault's signature, so they are Squads transactions too (TX Builder).
The handover itself ran through `scripts/transfer-admin.ts`: `propose`
(the old admin proposes the vault and opens the `accept_admin` multisig
transaction), the other member approves in the UI, `execute`.

Both member keys currently live in the same Phantom, so on devnet this is a
rehearsal of the mechanism, not a security gain. On mainnet the second key
must be a hardware wallet or another person.

## Before mainnet: freeze the account layout

Adding a field to `Loan` or `Offer` changes the account size, and the upgraded
program can no longer deserialise accounts written by the old one. On a test
cluster that is an inconvenience. In production it would strand every open
position at once — collateral and principal both locked, with no instruction
able to touch them, because settling requires reading the account the program
can no longer parse.

This happened here while fixing the fee-snapshot issue below, on devnet, which
is the only good place for it to happen. Every account now carries a leading
`version: u8` (`ACCOUNT_VERSION` in `state.rs`) so a future program can tell
old accounts from new and migrate them deliberately instead of failing on
them. `migrate_config` is the first such migration: gated to the upgrade
authority like `initialize_config`, it rewrites the Config singleton from the
pre-version layout in place (`scripts/migrate-config.ts` ran it on devnet
after the version-byte deploy). Offers and loans have no migration path —
treat their layouts as frozen.

After a layout-changing deploy, start the indexer with `START_SLOT=<deploy
slot>` on a fresh database so positions the program can no longer read stay
out of the book.

## Status

The program is complete: 15 behavioural, 4 invariant and 4 aliasing tests pass,
including the maturity and default paths, and a 2,000-iteration Trident
campaign runs with no panics and no invariant violations.

It has had one source-level security review (Claude, September 2026 — twelve
findings, all closed in code — [docs/audit-2026-09-11.html](docs/audit-2026-09-11.html)). That is not a
professional audit. Passing tests and a closed findings list show the
failures somebody thought to look for, not the ones nobody did.

Known gaps before mainnet: the multisig must be recreated on mainnet with
Squads v4 and a second key that does not live on the same device,
`MIN_DURATION_SECONDS` should be raised from its 60-second devnet floor, and
the indexer's per-signature backfill should sit behind a Geyser or webhook
stream at volume.

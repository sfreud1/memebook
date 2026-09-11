//! Coverage-guided fuzzing for memebook.
//!
//! The hand-written suites check the situations someone thought to write down.
//! This one builds sequences nobody chose: random orderings of every
//! instruction, with amounts and rates drawn from the awkward parts of the
//! range, and time jumping forward at arbitrary points so maturity lands
//! wherever it lands.
//!
//! That distinction is not theoretical here. The behavioural suite passed for
//! days while `repay` was impossible whenever one wallet held two roles,
//! because every test it contained gave those roles separate keypairs.
//!
//! After each iteration the same solvency properties the TypeScript invariant
//! suite asserts are checked again — vault balances matching what the program
//! recorded, and an offer's principal fully accounted for.

use fuzz_accounts::*;
use trident_fuzz::fuzzing::*;
mod fuzz_accounts;
mod types;
use types::memebook::*;

const PRINCIPAL_DECIMALS: u8 = 6;
const COLLATERAL_DECIMALS: u8 = 6;
const ACTORS: usize = 3;

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: AccountAddresses,

    config: Pubkey,
    fee_recipient: Pubkey,
    fee_principal_ata: Pubkey,
    fee_collateral_ata: Pubkey,
    principal_mint: Pubkey,
    collateral_mint: Pubkey,

    /// Wallets that can play either side; any of them may end up lending to
    /// themselves, which is exactly the shape that broke the program before.
    actors: Vec<Pubkey>,
    principal_atas: Vec<Pubkey>,
    collateral_atas: Vec<Pubkey>,

    offers: Vec<OfferRef>,
    loans: Vec<LoanRef>,
    next_id: u64,
}

#[derive(Clone, Copy)]
struct OfferRef {
    key: Pubkey,
    vault: Pubkey,
    lender: Pubkey,
    id: u64,
}

#[derive(Clone, Copy)]
struct LoanRef {
    key: Pubkey,
    vault: Pubkey,
    borrower: Pubkey,
    lender: Pubkey,
    id: u64,
}

const TOKEN_PROGRAM: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: AccountAddresses::default(),
            config: Pubkey::default(),
            fee_recipient: Pubkey::default(),
            fee_principal_ata: Pubkey::default(),
            fee_collateral_ata: Pubkey::default(),
            principal_mint: Pubkey::default(),
            collateral_mint: Pubkey::default(),
            actors: Vec::new(),
            principal_atas: Vec::new(),
            collateral_atas: Vec::new(),
            offers: Vec::new(),
            loans: Vec::new(),
            next_id: 1,
        }
    }

    #[init]
    fn start(&mut self) {
        self.offers.clear();
        self.loans.clear();
        self.next_id = 1;

        let payer = self.trident.payer().pubkey();
        self.trident.airdrop(&payer, 1_000_000_000_000);

        // ---- mints ----
        let principal_kp = self.trident.random_keypair();
        let collateral_kp = self.trident.random_keypair();
        self.principal_mint = principal_kp.pubkey();
        self.collateral_mint = collateral_kp.pubkey();

        let mut ixs = self.trident.initialize_mint(
            &payer, &self.principal_mint, PRINCIPAL_DECIMALS, &payer, None);
        ixs.extend(self.trident.initialize_mint(
            &payer, &self.collateral_mint, COLLATERAL_DECIMALS, &payer, None));
        self.trident.process_transaction(&ixs, None);

        // ---- protocol treasury ----
        self.fee_recipient = self.trident.random_keypair().pubkey();
        self.trident.airdrop(&self.fee_recipient, 100_000_000_000);
        self.fee_principal_ata = self.setup_ata(&payer, self.principal_mint, self.fee_recipient, 0);
        self.fee_collateral_ata = self.setup_ata(&payer, self.collateral_mint, self.fee_recipient, 0);

        // ---- actors ----
        self.actors.clear();
        self.principal_atas.clear();
        self.collateral_atas.clear();
        for _ in 0..ACTORS {
            let who = self.trident.random_keypair().pubkey();
            self.trident.airdrop(&who, 100_000_000_000);
            let p = self.setup_ata(&payer, self.principal_mint, who, 100_000_000_000_000);
            let c = self.setup_ata(&payer, self.collateral_mint, who, 100_000_000_000_000);
            self.actors.push(who);
            self.principal_atas.push(p);
            self.collateral_atas.push(c);
        }

        // ---- config ----
        // initialize_config only accepts the program's upgrade authority as the
        // signer (front-run guard). Trident registers the program with no
        // authority, so point the ProgramData account's `upgrade_authority_address`
        // at the payer before calling it. bincode layout of
        // UpgradeableLoaderState::ProgramData: u32 variant | u64 slot | Option<Pubkey>.
        let program_data = self.trident.get_program_data_address_v3(&program_id());
        let mut pd = self.trident.get_account(&program_data);
        {
            let data = pd.data_as_mut_slice();
            data[12] = 1;
            data[13..45].copy_from_slice(payer.as_ref());
        }
        self.trident.set_account_custom(&program_data, &pd);

        self.config = self.trident.find_program_address(&[b"config"], &program_id()).0;
        let ix = InitializeConfigInstruction::data(InitializeConfigInstructionData::new(
            payer,
            self.fee_recipient,
            1000, // origination: 10% of interest
            500,  //   interest:  5% of interest
            10,   //    default:  0.1% of collateral
        ))
        .accounts(InitializeConfigInstructionAccounts::new(payer, program_data, self.config))
        .instruction();
        self.trident.process_transaction(&[ix], Some("initialize_config"));
    }

    // ------------------------------------------------------------------ flows

    #[flow]
    fn flow_create_offer(&mut self) {
        let payer = self.trident.payer().pubkey();
        let idx: usize = self.trident.random_from_range(0..ACTORS);
        let lender = self.actors[idx];
        let id = self.take_id();

        let offer = self.trident.find_program_address(
            &[b"offer", lender.as_ref(), &id.to_le_bytes()], &program_id()).0;
        let vault = self.trident.find_program_address(
            &[b"offer_vault", offer.as_ref()], &program_id()).0;

        let (principal, collateral, min_draw, apr, duration, expiry) = self.offer_params();

        let ix = CreateOfferInstruction::data(CreateOfferInstructionData::new(
            id, principal, collateral, min_draw, apr, duration, expiry,
        ))
        .accounts(CreateOfferInstructionAccounts::new(
            lender, self.config, offer, self.principal_mint, self.collateral_mint,
            vault, self.principal_atas[idx], TOKEN_PROGRAM,
        ))
        .instruction();

        if self.trident.process_transaction(&[ix], Some("create_offer")).is_success() {
            self.offers.push(OfferRef { key: offer, vault, lender, id });
        }
    }

    #[flow]
    fn flow_accept_offer(&mut self) {
        if self.offers.is_empty() {
            return;
        }
        let payer = self.trident.payer().pubkey();
        let oi: usize = self.trident.random_from_range(0..self.offers.len());
        let o = self.offers[oi];
        let bi: usize = self.trident.random_from_range(0..ACTORS);
        let borrower = self.actors[bi];
        let id = self.take_id();

        let loan = self.trident.find_program_address(
            &[b"loan", borrower.as_ref(), &id.to_le_bytes()], &program_id()).0;
        let vault = self.trident.find_program_address(
            &[b"loan_vault", loan.as_ref()], &program_id()).0;
        // Mostly a slice of what the offer can actually fund, so the draw
        // reaches the maths instead of bouncing off the liquidity check.
        let draw = match self.trident.get_account_with_type::<Offer>(&o.key, None) {
            Some(state) if state.principal_available > 0 => {
                match self.trident.random_from_range(0u8..=9u8) {
                    0..=5 => {
                        let n: u64 = self.trident
                            .random_from_range(1u64..=state.principal_available);
                        n
                    }
                    6..=7 => state.principal_available,
                    8 => state.principal_available.saturating_add(1),
                    _ => self.trident.random_from_range(1u64..=2_000_000_000u64),
                }
            }
            _ => self.trident.random_from_range(1u64..=2_000_000_000u64),
        };

        let ix = AcceptOfferInstruction::data(AcceptOfferInstructionData::new(id, draw))
            .accounts(AcceptOfferInstructionAccounts::new(
                borrower, self.config, o.key, loan, self.principal_mint, self.collateral_mint,
                o.vault, vault, self.collateral_atas[bi], self.principal_atas[bi],
                self.fee_recipient, self.fee_principal_ata,
                TOKEN_PROGRAM, TOKEN_PROGRAM,
            ))
            .instruction();

        if self.trident.process_transaction(&[ix], Some("accept_offer")).is_success() {
            self.loans.push(LoanRef { key: loan, vault, borrower, lender: o.lender, id });
        }
    }

    #[flow]
    fn flow_repay(&mut self) {
        if self.loans.is_empty() {
            return;
        }
        let li: usize = self.trident.random_from_range(0..self.loans.len());
        let l = self.loans[li];
        let bi = self.index_of(l.borrower);

        let ix = RepayInstruction::data(RepayInstructionData::new())
            .accounts(RepayInstructionAccounts::new(
                l.borrower, l.lender, self.fee_recipient, self.config, l.key,
                self.principal_mint, self.collateral_mint, l.vault,
                self.principal_atas[bi], self.collateral_atas[bi],
                self.ata(self.principal_mint, l.lender), self.fee_principal_ata,
                TOKEN_PROGRAM, TOKEN_PROGRAM,
            ))
            .instruction();

        if self.trident.process_transaction(&[ix], Some("repay")).is_success() {
            self.loans.remove(li);
        }
    }

    #[flow]
    fn flow_claim_default(&mut self) {
        if self.loans.is_empty() {
            return;
        }
        let li: usize = self.trident.random_from_range(0..self.loans.len());
        let l = self.loans[li];

        let ix = ClaimDefaultInstruction::data(ClaimDefaultInstructionData::new())
            .accounts(ClaimDefaultInstructionAccounts::new(
                l.lender, l.borrower, self.fee_recipient, self.config, l.key,
                self.collateral_mint, l.vault,
                self.ata(self.collateral_mint, l.lender), self.fee_collateral_ata,
                TOKEN_PROGRAM,
            ))
            .instruction();

        if self.trident.process_transaction(&[ix], Some("claim_default")).is_success() {
            self.loans.remove(li);
        }
    }

    #[flow]
    fn flow_cancel_offer(&mut self) {
        if self.offers.is_empty() {
            return;
        }
        let oi: usize = self.trident.random_from_range(0..self.offers.len());
        let o = self.offers[oi];
        let li = self.index_of(o.lender);

        let ix = CancelOfferInstruction::data(CancelOfferInstructionData::new())
            .accounts(CancelOfferInstructionAccounts::new(
                o.lender, o.key, self.principal_mint, o.vault,
                self.principal_atas[li], TOKEN_PROGRAM,
            ))
            .instruction();

        if self.trident.process_transaction(&[ix], Some("cancel_offer")).is_success() {
            self.offers.remove(oi);
        }
    }

    /// Jumping the clock is what makes the maturity boundary reachable at all.
    /// Waiting it out is impossible in a fuzzer, and it is where repayment
    /// closes and claiming opens.
    #[flow]
    fn flow_pass_time(&mut self) {
        let seconds: i64 = self.trident.random_log_uniform();
        self.trident.forward_in_time(seconds.max(1));
    }

    // ------------------------------------------------------------- invariants

    #[end]
    fn check(&mut self) {
        // I1 — an open offer's vault holds exactly its undrawn principal.
        for o in self.offers.clone() {
            let Some(state) = self.trident.get_account_with_type::<Offer>(&o.key, None) else {
                continue; // cancelled and closed
            };
            let Ok(vault) = self.trident.get_token_account(o.vault) else {
                continue;
            };
            invariant!(
                vault.account.amount == state.principal_available,
                "I1 offer {}: vault {} != available {}",
                o.key, vault.account.amount, state.principal_available
            );
            invariant!(
                state.principal_available <= state.principal_total,
                "I3 offer {}: available {} exceeds total {}",
                o.key, state.principal_available, state.principal_total
            );
        }

        // I2 — an active loan's vault holds exactly the collateral it recorded.
        for l in self.loans.clone() {
            let Some(state) = self.trident.get_account_with_type::<Loan>(&l.key, None) else {
                continue; // settled and closed
            };
            let Ok(vault) = self.trident.get_token_account(l.vault) else {
                continue;
            };
            invariant!(
                vault.account.amount == state.collateral_amount,
                "I2 loan {}: vault {} != recorded {}",
                l.key, vault.account.amount, state.collateral_amount
            );
            invariant!(
                state.maturity_ts > state.start_ts,
                "loan {}: maturity {} not after start {}",
                l.key, state.maturity_ts, state.start_ts
            );
        }
    }

    /// Builds offer parameters that are *valid by construction* most of the
    /// time, and deliberately invalid the rest.
    ///
    /// Sampling each field independently and hoping the combination is legal
    /// does not survive a long campaign. Coverage-guided mutation treats an
    /// early `require!` rejection as new coverage just like anything else, so
    /// it drifts toward inputs that never reach the logic worth testing: a
    /// twenty-thousand-iteration run landed *fewer* successful offers than a
    /// two-thousand one. Deciding validity first and then constructing to
    /// match keeps the interesting path reachable however the bytes mutate.
    fn offer_params(&mut self) -> (u64, u64, u64, u32, u32, i64) {
        let now = self.trident.get_current_timestamp();
        // Kept deliberately low. Coverage-guided mutation already drifts toward
        // rejection paths on its own over a long campaign — a 150-iteration run
        // lands 66% of its offers, the same generator over 2000 iterations lands
        // 6% — so the budget spent inviting it there should be small.
        let invalid = self.trident.random_from_range(0u8..=19u8) == 0;

        let principal: u64 = match self.trident.random_from_range(0u8..=9u8) {
            0..=6 => self.trident.random_from_range(1_000u64..=2_000_000_000u64),
            7..=8 => self.trident.random_from_range(1u64..=1_000u64),
            _ => self.trident.random_from_range(1u64..=500_000_000_000u64),
        };
        let collateral: u64 = match self.trident.random_from_range(0u8..=9u8) {
            0..=6 => self.trident.random_from_range(1_000u64..=50_000_000_000u64),
            7..=8 => self.trident.random_from_range(1u64..=1_000u64),
            _ => self.trident.random_from_range(1u64..=500_000_000_000u64),
        };
        let min_draw = self.trident.random_from_range(1u64..=principal);
        let apr = self.trident.random_from_range(0u32..=100_000u32);
        let duration = self.trident.random_from_range(60u32..=31_536_000u32);
        let expiry = now + self.trident.random_from_range(1i64..=1_000_000i64);

        if !invalid {
            return (principal, collateral, min_draw, apr, duration, expiry);
        }

        // One deliberate violation at a time, so each rejection path is
        // exercised on purpose rather than by accident.
        match self.trident.random_from_range(0u8..=6u8) {
            0 => (0, collateral, min_draw, apr, duration, expiry),
            1 => (principal, 0, min_draw, apr, duration, expiry),
            2 => (principal, collateral, principal.saturating_add(1), apr, duration, expiry),
            3 => (principal, collateral, min_draw, u32::MAX, duration, expiry),
            4 => (principal, collateral, min_draw, apr, 59, expiry),
            5 => (principal, collateral, min_draw, apr, u32::MAX, expiry),
            _ => (principal, collateral, min_draw, apr, duration, now - 1),
        }
    }

    // ---------------------------------------------------------------- helpers

    fn take_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    fn index_of(&self, who: Pubkey) -> usize {
        self.actors.iter().position(|a| *a == who).unwrap_or(0)
    }

    fn ata(&mut self, mint: Pubkey, owner: Pubkey) -> Pubkey {
        self.trident.get_associated_token_address(&mint, &owner, &TOKEN_PROGRAM)
    }

    fn setup_ata(&mut self, payer: &Pubkey, mint: Pubkey, owner: Pubkey, amount: u64) -> Pubkey {
        let ata = self.trident.get_associated_token_address(&mint, &owner, &TOKEN_PROGRAM);
        let mut ixs = vec![self.trident.initialize_associated_token_account(payer, &mint, &owner)];
        if amount > 0 {
            ixs.push(self.trident.mint_to(&ata, &mint, payer, amount));
        }
        self.trident.process_transaction(&ixs, None);
        ata
    }
}

fn main() {
    // Iterations x flows-per-iteration. Raise both in CI; this default keeps a
    // local run to a few minutes.
    FuzzTest::fuzz(
        std::env::var("FUZZ_ITERATIONS").ok().and_then(|v| v.parse().ok()).unwrap_or(2000),
        std::env::var("FUZZ_FLOWS").ok().and_then(|v| v.parse().ok()).unwrap_or(60),
    );
}

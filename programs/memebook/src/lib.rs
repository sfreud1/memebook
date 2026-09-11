//! # memebook
//!
//! Fixed-term, oracle-free, liquidation-free peer-to-peer lending for long-tail
//! SPL tokens.
//!
//! A lender posts an offer: *this collateral mint, this much principal, this
//! ratio, this rate, this duration*. A borrower draws against it, in full or in
//! part, and their collateral goes into a per-loan escrow PDA. Nothing marks the
//! position to market for the life of the loan. At maturity the borrower either
//! repays principal plus a fixed interest amount and takes their collateral
//! back, or they walk away and the lender claims the collateral token itself.
//!
//! There is no price feed anywhere in this program. That is deliberate: the
//! assets this is built for have thin, manipulable liquidity, and oracle
//! manipulation is what has historically drained lending protocols that tried to
//! mark them to market. Risk is priced once, by a human, at the moment the offer
//! is written.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("GGVLRegjz8K7op4KzJELS8GpEqHHCv7XagZBkEpCvsjh");

#[program]
pub mod memebook {
    use super::*;

    // ---------------- admin ----------------

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        admin: Pubkey,
        fee_recipient: Pubkey,
        origination_fee_bps: u16,
        interest_fee_bps: u16,
        default_fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize_config::handler(
            ctx,
            admin,
            fee_recipient,
            origination_fee_bps,
            interest_fee_bps,
            default_fee_bps,
        )
    }

    /// Rewrite the config singleton from an older layout to the current one.
    /// Upgrade authority only; refuses an account that is already current.
    pub fn migrate_config(ctx: Context<MigrateConfig>) -> Result<()> {
        instructions::migrate_config::handler(ctx)
    }

    pub fn set_fees(
        ctx: Context<UpdateConfig>,
        origination_fee_bps: u16,
        interest_fee_bps: u16,
        default_fee_bps: u16,
    ) -> Result<()> {
        instructions::update_config::set_fees(
            ctx,
            origination_fee_bps,
            interest_fee_bps,
            default_fee_bps,
        )
    }

    pub fn set_fee_recipient(ctx: Context<UpdateConfig>, fee_recipient: Pubkey) -> Result<()> {
        instructions::update_config::set_fee_recipient(ctx, fee_recipient)
    }

    pub fn set_paused(ctx: Context<UpdateConfig>, paused: bool) -> Result<()> {
        instructions::update_config::set_paused(ctx, paused)
    }

    pub fn propose_admin(ctx: Context<UpdateConfig>, new_admin: Pubkey) -> Result<()> {
        instructions::update_config::propose_admin(ctx, new_admin)
    }

    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        instructions::update_config::accept_admin(ctx)
    }

    // ---------------- lender ----------------

    /// Post an offer and escrow the principal behind it.
    ///
    /// `collateral_total` is the collateral demanded for a full draw of
    /// `principal_total`; together they are the LTV. Partial draws take a
    /// pro-rata slice, rounded up.
    #[allow(clippy::too_many_arguments)]
    pub fn create_offer(
        ctx: Context<CreateOffer>,
        offer_id: u64,
        principal_total: u64,
        collateral_total: u64,
        min_draw: u64,
        apr_bps: u32,
        duration_seconds: u32,
        expiry_ts: i64,
    ) -> Result<()> {
        instructions::create_offer::handler(
            ctx,
            offer_id,
            principal_total,
            collateral_total,
            min_draw,
            apr_bps,
            duration_seconds,
            expiry_ts,
        )
    }

    /// Withdraw whatever principal is still undrawn and close the offer. Loans
    /// already opened against it are untouched.
    pub fn cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
        instructions::cancel_offer::handler(ctx)
    }

    /// Claim the collateral of a loan that passed its maturity unpaid.
    pub fn claim_default(ctx: Context<ClaimDefault>) -> Result<()> {
        instructions::claim_default::handler(ctx)
    }

    // ---------------- borrower ----------------

    /// Draw `draw_amount` of principal against an open offer, locking the
    /// pro-rata collateral for the offer's full duration.
    pub fn accept_offer(ctx: Context<AcceptOffer>, loan_id: u64, draw_amount: u64) -> Result<()> {
        instructions::accept_offer::handler(ctx, loan_id, draw_amount)
    }

    /// Repay principal plus the fixed interest and take the collateral back.
    /// Only valid up to and including the maturity timestamp.
    pub fn repay(ctx: Context<Repay>) -> Result<()> {
        instructions::repay::handler(ctx)
    }
}

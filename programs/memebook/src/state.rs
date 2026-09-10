use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Two-step admin handover. Zero when no transfer is pending.
    pub pending_admin: Pubkey,
    pub fee_recipient: Pubkey,
    /// Share of interest charged to the borrower up front, deducted from the
    /// principal actually disbursed.
    pub origination_fee_bps: u16,
    /// Share of interest skimmed from the lender's return at repayment.
    pub interest_fee_bps: u16,
    /// Share of collateral skimmed when a lender claims a defaulted loan.
    pub default_fee_bps: u16,
    /// Blocks new offers and new loans. Repay and claim stay open by design:
    /// pausing must never trap somebody's collateral.
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Offer {
    pub lender: Pubkey,
    pub principal_mint: Pubkey,
    pub collateral_mint: Pubkey,
    pub offer_id: u64,
    /// Principal originally committed by the lender.
    pub principal_total: u64,
    /// Principal still undrawn and sitting in the offer vault.
    pub principal_available: u64,
    /// Collateral demanded for a full draw of `principal_total`.
    /// Together these two numbers are the LTV; partial draws are pro-rata.
    pub collateral_total: u64,
    /// Smallest principal a borrower may draw, to stop dust loans from
    /// spamming the book with rent-bearing accounts.
    pub min_draw: u64,
    pub apr_bps: u32,
    pub duration_seconds: u32,
    /// After this the offer can no longer be accepted (loans already opened
    /// from it are unaffected).
    pub expiry_ts: i64,
    /// Monotonic counter, purely for indexing and analytics.
    pub loans_opened: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum LoanStatus {
    Active,
    Repaid,
    Defaulted,
}

#[account]
#[derive(InitSpace)]
pub struct Loan {
    pub borrower: Pubkey,
    pub lender: Pubkey,
    pub offer: Pubkey,
    pub principal_mint: Pubkey,
    pub collateral_mint: Pubkey,
    pub loan_id: u64,
    /// Principal drawn, before the origination fee. This is what must be repaid.
    pub principal_amount: u64,
    /// Collateral actually received into escrow — measured by balance delta,
    /// never assumed from the instruction argument.
    pub collateral_amount: u64,
    /// Interest owed at maturity. Fixed at accept time and never accrues:
    /// there is no rate curve, no utilisation, no oracle.
    pub interest_amount: u64,
    pub start_ts: i64,
    pub maturity_ts: i64,
    pub status: LoanStatus,
    pub bump: u8,
}

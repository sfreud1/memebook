use anchor_lang::prelude::*;

/// Every state transition emits an event. The indexer is built on these rather
/// than on account polling, so the frontend never has to touch getProgramAccounts.
#[event]
pub struct OfferCreated {
    pub offer: Pubkey,
    pub lender: Pubkey,
    pub principal_mint: Pubkey,
    pub collateral_mint: Pubkey,
    pub principal_total: u64,
    pub collateral_total: u64,
    pub min_draw: u64,
    pub apr_bps: u32,
    pub duration_seconds: u32,
    pub expiry_ts: i64,
    pub ts: i64,
}

#[event]
pub struct OfferCancelled {
    pub offer: Pubkey,
    pub lender: Pubkey,
    pub principal_returned: u64,
    pub ts: i64,
}

#[event]
pub struct LoanOpened {
    pub loan: Pubkey,
    pub offer: Pubkey,
    pub borrower: Pubkey,
    pub lender: Pubkey,
    pub principal_mint: Pubkey,
    pub collateral_mint: Pubkey,
    pub principal_amount: u64,
    pub origination_fee: u64,
    pub principal_disbursed: u64,
    pub collateral_amount: u64,
    pub interest_amount: u64,
    pub start_ts: i64,
    pub maturity_ts: i64,
}

#[event]
pub struct LoanRepaid {
    pub loan: Pubkey,
    pub borrower: Pubkey,
    pub lender: Pubkey,
    pub principal_amount: u64,
    pub interest_amount: u64,
    pub interest_fee: u64,
    pub lender_received: u64,
    pub collateral_returned: u64,
    pub ts: i64,
}

#[event]
pub struct LoanDefaulted {
    pub loan: Pubkey,
    pub borrower: Pubkey,
    pub lender: Pubkey,
    pub collateral_claimed: u64,
    pub default_fee: u64,
    pub ts: i64,
}

/// Fee changes only affect loans opened afterwards — rates are snapshotted onto
/// each loan — but an observer still needs to see them happen.
#[event]
pub struct FeesUpdated {
    pub origination_fee_bps: u16,
    pub interest_fee_bps: u16,
    pub default_fee_bps: u16,
    pub ts: i64,
}

#[event]
pub struct FeeRecipientUpdated {
    pub fee_recipient: Pubkey,
    pub ts: i64,
}

#[event]
pub struct PausedUpdated {
    pub paused: bool,
    pub ts: i64,
}

#[event]
pub struct AdminTransferred {
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
    pub ts: i64,
}

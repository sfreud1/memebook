use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const OFFER_SEED: &[u8] = b"offer";
#[constant]
pub const OFFER_VAULT_SEED: &[u8] = b"offer_vault";
#[constant]
pub const LOAN_SEED: &[u8] = b"loan";
#[constant]
pub const LOAN_VAULT_SEED: &[u8] = b"loan_vault";

/// 365 days. Interest is simple, not compounded, so this is only a scaling constant.
pub const SECONDS_PER_YEAR: u128 = 31_536_000;
pub const BPS_DENOMINATOR: u128 = 10_000;

pub const MIN_DURATION_SECONDS: u32 = 60; // 1 minute — a sanity floor only;
// real terms are set by lenders per-offer.
pub const MAX_DURATION_SECONDS: u32 = 60 * 60 * 24 * 365; // 365 days

/// 1000% APR. Long-tail lenders genuinely quote triple digits; four is a fat finger.
pub const MAX_APR_BPS: u32 = 100_000;

/// Hard ceiling on every protocol fee, enforced at the instruction level so a
/// compromised admin key still cannot confiscate a position. Jupiter's Offerbook
/// takes 35% of interest; we cap ourselves at 30% and default far below it.
pub const MAX_INTEREST_FEE_BPS: u16 = 3_000;
/// Default-claim fee is taken from *collateral*, so its ceiling is much tighter.
pub const MAX_DEFAULT_FEE_BPS: u16 = 100; // 1%

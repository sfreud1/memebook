use crate::constants::*;
use crate::errors::MemebookError;
use crate::state::Config;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ MemebookError::NotAdmin
    )]
    pub config: Box<Account<'info, Config>>,
}

pub fn set_fees(
    ctx: Context<UpdateConfig>,
    origination_fee_bps: u16,
    interest_fee_bps: u16,
    default_fee_bps: u16,
) -> Result<()> {
    require!(
        origination_fee_bps <= MAX_INTEREST_FEE_BPS && interest_fee_bps <= MAX_INTEREST_FEE_BPS,
        MemebookError::FeeTooHigh
    );
    require!(
        default_fee_bps <= MAX_DEFAULT_FEE_BPS,
        MemebookError::FeeTooHigh
    );

    let config = &mut ctx.accounts.config;
    config.origination_fee_bps = origination_fee_bps;
    config.interest_fee_bps = interest_fee_bps;
    config.default_fee_bps = default_fee_bps;
    Ok(())
}

pub fn set_fee_recipient(ctx: Context<UpdateConfig>, fee_recipient: Pubkey) -> Result<()> {
    ctx.accounts.config.fee_recipient = fee_recipient;
    Ok(())
}

/// Pausing blocks new offers and new loans only. `repay` and `claim_default`
/// stay live in every state: an admin must never be able to strand collateral.
pub fn set_paused(ctx: Context<UpdateConfig>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    Ok(())
}

pub fn propose_admin(ctx: Context<UpdateConfig>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.pending_admin = new_admin;
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    pub pending_admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.pending_admin == pending_admin.key() @ MemebookError::NotPendingAdmin
    )]
    pub config: Box<Account<'info, Config>>,
}

/// Two-step handover: a typo in `propose_admin` cannot brick the protocol,
/// because the key only takes effect once the new holder signs for it.
pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.pending_admin.key();
    config.pending_admin = Pubkey::default();
    Ok(())
}

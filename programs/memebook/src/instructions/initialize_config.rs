use crate::constants::*;
use crate::errors::MemebookError;
use crate::state::Config;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Box<Account<'info, Config>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeConfig>,
    admin: Pubkey,
    fee_recipient: Pubkey,
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
    config.admin = admin;
    config.pending_admin = Pubkey::default();
    config.fee_recipient = fee_recipient;
    config.origination_fee_bps = origination_fee_bps;
    config.interest_fee_bps = interest_fee_bps;
    config.default_fee_bps = default_fee_bps;
    config.paused = false;
    config.bump = ctx.bumps.config;

    Ok(())
}

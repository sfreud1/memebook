use crate::constants::*;
use crate::errors::MemebookError;
use crate::state::{Config, ACCOUNT_VERSION};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    /// Must be the program's upgrade authority.
    ///
    /// Without this, `initialize_config` is a race: whoever lands the first
    /// call after deployment names the admin and the fee recipient, and on a
    /// public cluster that call can be front-run. Tying it to the upgrade
    /// authority means only the party that deployed the program can claim it.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        constraint = program.programdata_address()? == Some(program_data.key())
    )]
    pub program: Program<'info, crate::program::Memebook>,

    #[account(
        constraint = program_data.upgrade_authority_address == Some(payer.key())
            @ MemebookError::NotUpgradeAuthority
    )]
    pub program_data: Account<'info, ProgramData>,

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
    config.version = ACCOUNT_VERSION;
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

use crate::constants::*;
use crate::errors::MemebookError;
use crate::events::OfferCreated;
use crate::state::{Config, Offer};
use crate::utils::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct CreateOffer<'info> {
    #[account(mut)]
    pub lender: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        init,
        payer = lender,
        space = 8 + Offer::INIT_SPACE,
        seeds = [OFFER_SEED, lender.key().as_ref(), &offer_id.to_le_bytes()],
        bump
    )]
    pub offer: Box<Account<'info, Offer>>,

    pub principal_mint: Box<InterfaceAccount<'info, Mint>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = lender,
        seeds = [OFFER_VAULT_SEED, offer.key().as_ref()],
        bump,
        token::mint = principal_mint,
        token::authority = offer,
        token::token_program = principal_token_program,
    )]
    pub offer_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = principal_mint,
        token::authority = lender,
        token::token_program = principal_token_program,
    )]
    pub lender_principal_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub principal_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<CreateOffer>,
    offer_id: u64,
    principal_total: u64,
    collateral_total: u64,
    min_draw: u64,
    apr_bps: u32,
    duration_seconds: u32,
    expiry_ts: i64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, MemebookError::ProtocolPaused);

    require!(principal_total > 0, MemebookError::ZeroAmount);
    require!(collateral_total > 0, MemebookError::ZeroAmount);
    require!(min_draw > 0, MemebookError::ZeroAmount);
    require!(
        min_draw <= principal_total,
        MemebookError::InvalidMinDraw
    );
    require!(apr_bps <= MAX_APR_BPS, MemebookError::InvalidApr);
    require!(
        (MIN_DURATION_SECONDS..=MAX_DURATION_SECONDS).contains(&duration_seconds),
        MemebookError::InvalidDuration
    );
    require!(
        ctx.accounts.principal_mint.key() != ctx.accounts.collateral_mint.key(),
        MemebookError::IdenticalMints
    );

    let now = Clock::get()?.unix_timestamp;
    require!(expiry_ts > now, MemebookError::InvalidExpiry);

    // Both sides sit in an escrow this program controls: collateral for the
    // life of every loan, and the lender's principal from the moment the offer
    // is posted. A `PermanentDelegate` on either lets the mint authority reach
    // in and take it; a transfer fee turned on later means the amount that
    // arrives is not the amount sent. Screen both.
    assert_escrowed_mint_is_safe(&ctx.accounts.collateral_mint.to_account_info())?;
    assert_escrowed_mint_is_safe(&ctx.accounts.principal_mint.to_account_info())?;

    // Measure what actually landed rather than trusting the argument. Even with
    // fee-bearing mints rejected above, this is the invariant we want to hold.
    let before = live_token_amount(&ctx.accounts.offer_vault)?;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.principal_token_program.key(),
            TransferChecked {
                from: ctx.accounts.lender_principal_account.to_account_info(),
                mint: ctx.accounts.principal_mint.to_account_info(),
                to: ctx.accounts.offer_vault.to_account_info(),
                authority: ctx.accounts.lender.to_account_info(),
            },
        ),
        principal_total,
        ctx.accounts.principal_mint.decimals,
    )?;
    let received = live_token_amount(&ctx.accounts.offer_vault)?
        .checked_sub(before)
        .ok_or(MemebookError::MathOverflow)?;
    require!(
        received == principal_total,
        MemebookError::TransferAmountMismatch
    );

    let offer = &mut ctx.accounts.offer;
    offer.lender = ctx.accounts.lender.key();
    offer.principal_mint = ctx.accounts.principal_mint.key();
    offer.collateral_mint = ctx.accounts.collateral_mint.key();
    offer.offer_id = offer_id;
    offer.principal_total = principal_total;
    offer.principal_available = principal_total;
    offer.collateral_total = collateral_total;
    offer.min_draw = min_draw;
    offer.apr_bps = apr_bps;
    offer.duration_seconds = duration_seconds;
    offer.expiry_ts = expiry_ts;
    offer.loans_opened = 0;
    offer.bump = ctx.bumps.offer;

    emit!(OfferCreated {
        offer: offer.key(),
        lender: offer.lender,
        principal_mint: offer.principal_mint,
        collateral_mint: offer.collateral_mint,
        principal_total,
        collateral_total,
        min_draw,
        apr_bps,
        duration_seconds,
        expiry_ts,
        ts: now,
    });

    Ok(())
}

use crate::constants::*;
use crate::events::OfferCancelled;
use crate::state::Offer;
use crate::utils::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

#[derive(Accounts)]
pub struct CancelOffer<'info> {
    #[account(mut)]
    pub lender: Signer<'info>,

    #[account(
        mut,
        seeds = [OFFER_SEED, lender.key().as_ref(), &offer.offer_id.to_le_bytes()],
        bump = offer.bump,
        has_one = lender,
        has_one = principal_mint,
        close = lender
    )]
    pub offer: Box<Account<'info, Offer>>,

    pub principal_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
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
}

/// Cancelling only ever touches *undrawn* principal. Loans already opened from
/// this offer are independent accounts and are completely unaffected — a lender
/// cannot pull collateral out from under a live borrower.
pub fn handler(ctx: Context<CancelOffer>) -> Result<()> {
    let remaining = live_token_amount(&ctx.accounts.offer_vault)?;

    let lender_key = ctx.accounts.lender.key();
    let offer_id_bytes = ctx.accounts.offer.offer_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        OFFER_SEED,
        lender_key.as_ref(),
        &offer_id_bytes,
        &[ctx.accounts.offer.bump],
    ]];

    if remaining > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.principal_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.offer_vault.to_account_info(),
                    mint: ctx.accounts.principal_mint.to_account_info(),
                    to: ctx.accounts.lender_principal_account.to_account_info(),
                    authority: ctx.accounts.offer.to_account_info(),
                },
                signer_seeds,
            ),
            remaining,
            ctx.accounts.principal_mint.decimals,
        )?;
    }

    // Reclaim the vault's rent for the lender who paid it.
    close_account(CpiContext::new_with_signer(
        ctx.accounts.principal_token_program.key(),
        CloseAccount {
            account: ctx.accounts.offer_vault.to_account_info(),
            destination: ctx.accounts.lender.to_account_info(),
            authority: ctx.accounts.offer.to_account_info(),
        },
        signer_seeds,
    ))?;

    emit!(OfferCancelled {
        offer: ctx.accounts.offer.key(),
        lender: lender_key,
        principal_returned: remaining,
        ts: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

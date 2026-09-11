use crate::constants::*;
use crate::errors::MemebookError;
use crate::events::LoanOpened;
use crate::state::{Config, Loan, LoanStatus, Offer};
use crate::utils::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
#[instruction(loan_id: u64)]
pub struct AcceptOffer<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [OFFER_SEED, offer.lender.as_ref(), &offer.offer_id.to_le_bytes()],
        bump = offer.bump,
        has_one = principal_mint,
        has_one = collateral_mint,
    )]
    pub offer: Box<Account<'info, Offer>>,

    #[account(
        init,
        payer = borrower,
        space = 8 + Loan::INIT_SPACE,
        seeds = [LOAN_SEED, borrower.key().as_ref(), &loan_id.to_le_bytes()],
        bump
    )]
    pub loan: Box<Account<'info, Loan>>,

    pub principal_mint: Box<InterfaceAccount<'info, Mint>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,

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
        init,
        payer = borrower,
        seeds = [LOAN_VAULT_SEED, loan.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = loan,
        token::token_program = collateral_token_program,
    )]
    pub loan_collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = borrower,
        token::token_program = collateral_token_program,
    )]
    pub borrower_collateral_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = principal_mint,
        token::token_program = principal_token_program,
    )]
    pub borrower_principal_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: pinned to the config's fee recipient; only ever receives tokens.
    #[account(address = config.fee_recipient)]
    pub fee_recipient: UncheckedAccount<'info>,

    /// `dup`: this legitimately aliases another account in the same instruction
    /// when the lender is also the protocol's fee recipient — the operator
    /// seeding their own book is the obvious case. Anchor's duplicate-mutable
    /// guard exists to stop two deserialised copies fighting over one write on
    /// exit; token accounts are owned by the token program and never written
    /// back by Anchor, so two sequential CPI transfers to one destination are
    /// exactly as correct as two to different ones.
    #[account(
        init_if_needed,
        payer = borrower,
        associated_token::mint = principal_mint,
        associated_token::authority = fee_recipient,
        associated_token::token_program = principal_token_program,
        dup,
    )]
    pub fee_principal_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub principal_token_program: Interface<'info, TokenInterface>,
    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AcceptOffer>, loan_id: u64, draw_amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, MemebookError::ProtocolPaused);

    let now = Clock::get()?.unix_timestamp;
    require!(now < ctx.accounts.offer.expiry_ts, MemebookError::OfferExpired);
    require!(draw_amount > 0, MemebookError::ZeroAmount);

    let available = ctx.accounts.offer.principal_available;
    require!(
        draw_amount <= available,
        MemebookError::InsufficientOfferLiquidity
    );
    // The minimum is waived when a borrower drains the offer's remainder,
    // otherwise dust below min_draw would be permanently unusable.
    require!(
        draw_amount >= ctx.accounts.offer.min_draw || draw_amount == available,
        MemebookError::DrawBelowMinimum
    );

    let collateral_required = collateral_for(
        draw_amount,
        ctx.accounts.offer.principal_total,
        ctx.accounts.offer.collateral_total,
    )?;
    require!(collateral_required > 0, MemebookError::ZeroAmount);

    let interest_amount = interest_for(
        draw_amount,
        ctx.accounts.offer.apr_bps,
        ctx.accounts.offer.duration_seconds,
    )?;
    let origination_fee = fee_of(interest_amount, config.origination_fee_bps)?;
    let principal_disbursed = draw_amount
        .checked_sub(origination_fee)
        .ok_or(MemebookError::MathOverflow)?;

    // ---- collateral in (measured, never assumed) ----
    let coll_before = live_token_amount(&ctx.accounts.loan_collateral_vault)?;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.collateral_token_program.key(),
            TransferChecked {
                from: ctx.accounts.borrower_collateral_account.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.loan_collateral_vault.to_account_info(),
                authority: ctx.accounts.borrower.to_account_info(),
            },
        ),
        collateral_required,
        ctx.accounts.collateral_mint.decimals,
    )?;
    let collateral_received = live_token_amount(&ctx.accounts.loan_collateral_vault)?
        .checked_sub(coll_before)
        .ok_or(MemebookError::MathOverflow)?;
    require!(
        collateral_received == collateral_required,
        MemebookError::TransferAmountMismatch
    );

    // ---- principal out ----
    let lender_key = ctx.accounts.offer.lender;
    let offer_id_bytes = ctx.accounts.offer.offer_id.to_le_bytes();
    let offer_bump = ctx.accounts.offer.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        OFFER_SEED,
        lender_key.as_ref(),
        &offer_id_bytes,
        &[offer_bump],
    ]];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.principal_token_program.key(),
            TransferChecked {
                from: ctx.accounts.offer_vault.to_account_info(),
                mint: ctx.accounts.principal_mint.to_account_info(),
                to: ctx.accounts.borrower_principal_account.to_account_info(),
                authority: ctx.accounts.offer.to_account_info(),
            },
            signer_seeds,
        ),
        principal_disbursed,
        ctx.accounts.principal_mint.decimals,
    )?;

    if origination_fee > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.principal_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.offer_vault.to_account_info(),
                    mint: ctx.accounts.principal_mint.to_account_info(),
                    to: ctx.accounts.fee_principal_account.to_account_info(),
                    authority: ctx.accounts.offer.to_account_info(),
                },
                signer_seeds,
            ),
            origination_fee,
            ctx.accounts.principal_mint.decimals,
        )?;
    }

    // ---- book it ----
    let offer = &mut ctx.accounts.offer;
    offer.principal_available = available
        .checked_sub(draw_amount)
        .ok_or(MemebookError::MathOverflow)?;
    offer.loans_opened = offer
        .loans_opened
        .checked_add(1)
        .ok_or(MemebookError::MathOverflow)?;

    let maturity_ts = now
        .checked_add(offer.duration_seconds as i64)
        .ok_or(MemebookError::MathOverflow)?;

    let loan = &mut ctx.accounts.loan;
    loan.borrower = ctx.accounts.borrower.key();
    loan.lender = offer.lender;
    loan.offer = offer.key();
    loan.principal_mint = offer.principal_mint;
    loan.collateral_mint = offer.collateral_mint;
    loan.loan_id = loan_id;
    loan.principal_amount = draw_amount;
    loan.collateral_amount = collateral_received;
    loan.interest_amount = interest_amount;
    loan.start_ts = now;
    loan.maturity_ts = maturity_ts;
    loan.status = LoanStatus::Active;
    loan.bump = ctx.bumps.loan;

    emit!(LoanOpened {
        loan: loan.key(),
        offer: loan.offer,
        borrower: loan.borrower,
        lender: loan.lender,
        principal_mint: loan.principal_mint,
        collateral_mint: loan.collateral_mint,
        principal_amount: draw_amount,
        origination_fee,
        principal_disbursed,
        collateral_amount: collateral_received,
        interest_amount,
        start_ts: now,
        maturity_ts,
    });

    Ok(())
}

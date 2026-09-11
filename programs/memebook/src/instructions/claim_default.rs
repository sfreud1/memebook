use crate::constants::*;
use crate::errors::MemebookError;
use crate::events::LoanDefaulted;
use crate::state::{Config, Loan, LoanStatus};
use crate::utils::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

#[derive(Accounts)]
pub struct ClaimDefault<'info> {
    #[account(mut, address = loan.lender)]
    pub lender: Signer<'info>,

    /// CHECK: pinned to the loan's borrower. Receives the rent they pre-paid on
    /// the loan and vault accounts — defaulting costs the collateral, not the rent.
    #[account(mut, address = loan.borrower)]
    pub borrower: UncheckedAccount<'info>,

    /// CHECK: pinned to the config's fee recipient; only ever receives tokens.
    #[account(mut, address = config.fee_recipient)]
    pub fee_recipient: UncheckedAccount<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// `dup`: may legitimately be the same account as another in this
    /// instruction when one wallet holds more than one role. Anchor's guard
    /// exists to stop two deserialised copies fighting over a single write on
    /// exit; token accounts are owned by the token program and never written
    /// back by Anchor, so repeated CPI transfers touching one destination
    /// settle exactly as correctly as separate ones.
    #[account(
        mut,
        seeds = [LOAN_SEED, borrower.key().as_ref(), &loan.loan_id.to_le_bytes()],
        bump = loan.bump,
        has_one = lender,
        has_one = collateral_mint,
        close = borrower
    )]
    pub loan: Box<Account<'info, Loan>>,

    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [LOAN_VAULT_SEED, loan.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = loan,
        token::token_program = collateral_token_program,
    )]
    pub loan_collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = lender,
        associated_token::mint = collateral_mint,
        associated_token::authority = lender,
        associated_token::token_program = collateral_token_program,
        dup,
    )]
    pub lender_collateral_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// `dup`: this legitimately aliases another account in the same instruction
    /// when the lender is also the protocol's fee recipient — the operator
    /// seeding their own book is the obvious case. Anchor's duplicate-mutable
    /// guard exists to stop two deserialised copies fighting over one write on
    /// exit; token accounts are owned by the token program and never written
    /// back by Anchor, so two sequential CPI transfers to one destination are
    /// exactly as correct as two to different ones.
    #[account(
        init_if_needed,
        payer = lender,
        associated_token::mint = collateral_mint,
        associated_token::authority = fee_recipient,
        associated_token::token_program = collateral_token_program,
        dup,
    )]
    pub fee_collateral_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// After maturity the lender takes the collateral token itself — this is not a
/// sale and there is no oracle in the path. Whether that collateral is worth
/// more or less than the debt is the risk the lender priced when they wrote the
/// offer, and it is the entire reason the protocol needs no liquidation engine.
pub fn handler(ctx: Context<ClaimDefault>) -> Result<()> {
    let loan = &ctx.accounts.loan;
    require!(
        loan.status == LoanStatus::Active,
        MemebookError::LoanNotActive
    );

    let now = Clock::get()?.unix_timestamp;
    require!(now > loan.maturity_ts, MemebookError::LoanNotMatured);

    let vault_balance = live_token_amount(&ctx.accounts.loan_collateral_vault)?;
    let default_fee = fee_of(vault_balance, loan.default_fee_bps)?;
    let to_lender = vault_balance
        .checked_sub(default_fee)
        .ok_or(MemebookError::MathOverflow)?;

    let borrower_key = ctx.accounts.borrower.key();
    let loan_id_bytes = loan.loan_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        LOAN_SEED,
        borrower_key.as_ref(),
        &loan_id_bytes,
        &[loan.bump],
    ]];

    if to_lender > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.collateral_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.loan_collateral_vault.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.lender_collateral_account.to_account_info(),
                    authority: ctx.accounts.loan.to_account_info(),
                },
                signer_seeds,
            ),
            to_lender,
            ctx.accounts.collateral_mint.decimals,
        )?;
    }

    if default_fee > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.collateral_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.loan_collateral_vault.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.fee_collateral_account.to_account_info(),
                    authority: ctx.accounts.loan.to_account_info(),
                },
                signer_seeds,
            ),
            default_fee,
            ctx.accounts.collateral_mint.decimals,
        )?;
    }

    close_account(CpiContext::new_with_signer(
        ctx.accounts.collateral_token_program.key(),
        CloseAccount {
            account: ctx.accounts.loan_collateral_vault.to_account_info(),
            destination: ctx.accounts.borrower.to_account_info(),
            authority: ctx.accounts.loan.to_account_info(),
        },
        signer_seeds,
    ))?;

    emit!(LoanDefaulted {
        loan: ctx.accounts.loan.key(),
        borrower: borrower_key,
        lender: ctx.accounts.lender.key(),
        collateral_claimed: to_lender,
        default_fee,
        ts: now,
    });

    Ok(())
}

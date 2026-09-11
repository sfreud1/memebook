use crate::constants::*;
use crate::errors::MemebookError;
use crate::events::LoanRepaid;
use crate::state::{Config, Loan, LoanStatus};
use crate::utils::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,

    /// CHECK: pinned to the loan's recorded lender; only ever receives tokens.
    #[account(mut, address = loan.lender)]
    pub lender: UncheckedAccount<'info>,

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
        has_one = borrower,
        has_one = principal_mint,
        has_one = collateral_mint,
        close = borrower
    )]
    pub loan: Box<Account<'info, Loan>>,

    pub principal_mint: Box<InterfaceAccount<'info, Mint>>,
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
        mut,
        token::mint = principal_mint,
        token::authority = borrower,
        token::token_program = principal_token_program,
        dup,
    )]
    pub borrower_principal_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = borrower,
        token::token_program = collateral_token_program,
    )]
    pub borrower_collateral_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// `init_if_needed` on purpose. If the lender were able to close their token
    /// account before maturity, a missing destination would make repayment
    /// impossible and hand them the collateral for free. The borrower can always
    /// re-create it and pay off the loan.
    ///
    /// `dup`: equals `borrower_principal_account` when somebody borrows against
    /// their own offer, and `fee_principal_account` when the lender is also the
    /// fee recipient. Neither should make a loan unrepayable.
    #[account(
        init_if_needed,
        payer = borrower,
        associated_token::mint = principal_mint,
        associated_token::authority = lender,
        associated_token::token_program = principal_token_program,
        dup,
    )]
    pub lender_principal_account: Box<InterfaceAccount<'info, TokenAccount>>,

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

pub fn handler(ctx: Context<Repay>) -> Result<()> {
    let loan = &ctx.accounts.loan;
    require!(
        loan.status == LoanStatus::Active,
        MemebookError::LoanNotActive
    );

    let now = Clock::get()?.unix_timestamp;
    // Hard deadline. Past maturity the lender may claim, and this instruction
    // closes so the two can never race for the same collateral.
    require!(now <= loan.maturity_ts, MemebookError::LoanMatured);

    let principal_amount = loan.principal_amount;
    let interest_amount = loan.interest_amount;
    let interest_fee = fee_of(interest_amount, ctx.accounts.config.interest_fee_bps)?;
    let lender_received = principal_amount
        .checked_add(interest_amount)
        .ok_or(MemebookError::MathOverflow)?
        .checked_sub(interest_fee)
        .ok_or(MemebookError::MathOverflow)?;

    // ---- borrower pays ----
    transfer_checked(
        CpiContext::new(
            ctx.accounts.principal_token_program.key(),
            TransferChecked {
                from: ctx.accounts.borrower_principal_account.to_account_info(),
                mint: ctx.accounts.principal_mint.to_account_info(),
                to: ctx.accounts.lender_principal_account.to_account_info(),
                authority: ctx.accounts.borrower.to_account_info(),
            },
        ),
        lender_received,
        ctx.accounts.principal_mint.decimals,
    )?;

    if interest_fee > 0 {
        transfer_checked(
            CpiContext::new(
                ctx.accounts.principal_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.borrower_principal_account.to_account_info(),
                    mint: ctx.accounts.principal_mint.to_account_info(),
                    to: ctx.accounts.fee_principal_account.to_account_info(),
                    authority: ctx.accounts.borrower.to_account_info(),
                },
            ),
            interest_fee,
            ctx.accounts.principal_mint.decimals,
        )?;
    }

    // ---- collateral home ----
    let borrower_key = ctx.accounts.borrower.key();
    let loan_id_bytes = loan.loan_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        LOAN_SEED,
        borrower_key.as_ref(),
        &loan_id_bytes,
        &[loan.bump],
    ]];

    let collateral_returned = live_token_amount(&ctx.accounts.loan_collateral_vault)?;
    if collateral_returned > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.collateral_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.loan_collateral_vault.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.borrower_collateral_account.to_account_info(),
                    authority: ctx.accounts.loan.to_account_info(),
                },
                signer_seeds,
            ),
            collateral_returned,
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

    emit!(LoanRepaid {
        loan: ctx.accounts.loan.key(),
        borrower: borrower_key,
        lender: ctx.accounts.lender.key(),
        principal_amount,
        interest_amount,
        interest_fee,
        lender_received,
        collateral_returned,
        ts: now,
    });

    Ok(())
}

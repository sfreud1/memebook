use crate::constants::*;
use crate::errors::MemebookError;
use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
    state::Mint as SplMint,
};
use anchor_spl::token_interface::TokenAccount;

/// Simple (non-compounding) interest, rounded **up** so the borrower never
/// owes less than the quoted rate.
pub fn interest_for(principal: u64, apr_bps: u32, duration_seconds: u32) -> Result<u64> {
    let numerator = (principal as u128)
        .checked_mul(apr_bps as u128)
        .ok_or(MemebookError::MathOverflow)?
        .checked_mul(duration_seconds as u128)
        .ok_or(MemebookError::MathOverflow)?;
    let denominator = BPS_DENOMINATOR
        .checked_mul(SECONDS_PER_YEAR)
        .ok_or(MemebookError::MathOverflow)?;
    div_ceil_u128(numerator, denominator)
}

/// Pro-rata collateral for a partial draw, rounded **up** so a borrower cannot
/// shave collateral by slicing one offer into many dust loans.
pub fn collateral_for(
    principal_drawn: u64,
    principal_total: u64,
    collateral_total: u64,
) -> Result<u64> {
    require!(principal_total > 0, MemebookError::ZeroAmount);
    let numerator = (principal_drawn as u128)
        .checked_mul(collateral_total as u128)
        .ok_or(MemebookError::MathOverflow)?;
    div_ceil_u128(numerator, principal_total as u128)
}

/// Basis points of an amount, rounded **down** — every fee rounds in the
/// user's favour, never the protocol's.
pub fn fee_of(amount: u64, bps: u16) -> Result<u64> {
    let v = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or(MemebookError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(MemebookError::MathOverflow)?;
    u64::try_from(v).map_err(|_| MemebookError::MathOverflow.into())
}

fn div_ceil_u128(numerator: u128, denominator: u128) -> Result<u64> {
    require!(denominator > 0, MemebookError::MathOverflow);
    let q = numerator
        .checked_add(denominator - 1)
        .ok_or(MemebookError::MathOverflow)?
        .checked_div(denominator)
        .ok_or(MemebookError::MathOverflow)?;
    u64::try_from(q).map_err(|_| MemebookError::MathOverflow.into())
}

/// Reads a token account's current amount straight from the account data.
///
/// Used to measure real balance deltas around every transfer. Anchor's
/// deserialised struct is a snapshot from the start of the instruction, so it
/// is stale the moment a CPI moves tokens.
pub fn live_token_amount(account: &InterfaceAccount<TokenAccount>) -> Result<u64> {
    let ai = account.to_account_info();
    let data = ai.try_borrow_data()?;
    let state = StateWithExtensions::<anchor_spl::token_2022::spl_token_2022::state::Account>::unpack(
        &data,
    )
    .map_err(|_| error!(MemebookError::InvalidMint))?;
    Ok(state.base.amount)
}

/// Rejects mints whose token program can move, freeze, or silently resize
/// tokens sitting in one of this program's escrow PDAs.
///
/// `PermanentDelegate` is the fatal one: it lets the mint authority transfer
/// escrowed collateral straight out from under the lender. `TransferHook` hands
/// arbitrary code a CPI on every move. `TransferFeeConfig` means the amount that
/// arrives is not the amount that was sent. None of these are survivable for a
/// protocol whose entire job is holding somebody else's token for 30 days.
pub fn assert_escrowed_mint_is_safe(mint_ai: &AccountInfo) -> Result<()> {
    // Classic SPL Token mints have no extension data by construction.
    if mint_ai.owner == &anchor_spl::token::ID {
        return Ok(());
    }

    let data = mint_ai.try_borrow_data()?;
    let state =
        StateWithExtensions::<SplMint>::unpack(&data).map_err(|_| error!(MemebookError::InvalidMint))?;
    let extensions = state
        .get_extension_types()
        .map_err(|_| error!(MemebookError::InvalidMint))?;

    for ext in extensions {
        match ext {
            ExtensionType::PermanentDelegate
            | ExtensionType::TransferHook
            | ExtensionType::TransferFeeConfig
            | ExtensionType::NonTransferable
            | ExtensionType::MintCloseAuthority
            | ExtensionType::DefaultAccountState
            | ExtensionType::ConfidentialTransferMint
            | ExtensionType::ConfidentialTransferFeeConfig => {
                return err!(MemebookError::UnsafeCollateralMint)
            }
            _ => {}
        }
    }

    Ok(())
}

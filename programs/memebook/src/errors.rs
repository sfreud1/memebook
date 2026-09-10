use anchor_lang::prelude::*;

#[error_code]
pub enum MemebookError {
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Only the admin may perform this action")]
    NotAdmin,
    #[msg("Only the pending admin may accept the transfer")]
    NotPendingAdmin,
    #[msg("Fee exceeds the hard-coded maximum")]
    FeeTooHigh,

    #[msg("Loan duration outside the permitted range")]
    InvalidDuration,
    #[msg("APR outside the permitted range")]
    InvalidApr,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Offer expiry must be in the future")]
    InvalidExpiry,
    #[msg("min_draw cannot exceed the total principal")]
    InvalidMinDraw,
    #[msg("Principal and collateral mints must differ")]
    IdenticalMints,

    #[msg("Offer has expired")]
    OfferExpired,
    #[msg("Offer does not have enough undrawn principal")]
    InsufficientOfferLiquidity,
    #[msg("Draw is smaller than the offer's minimum")]
    DrawBelowMinimum,
    #[msg("Offer still has open loans or undrawn principal")]
    OfferNotEmpty,

    #[msg("Loan is not active")]
    LoanNotActive,
    #[msg("Loan has already matured")]
    LoanMatured,
    #[msg("Loan has not matured yet")]
    LoanNotMatured,

    #[msg("Collateral mint carries a Token-2022 extension that makes escrow unsafe")]
    UnsafeCollateralMint,
    #[msg("Mint account could not be parsed")]
    InvalidMint,
    #[msg("Token transfer moved a different amount than expected")]
    TransferAmountMismatch,

    #[msg("Arithmetic overflow")]
    MathOverflow,
}

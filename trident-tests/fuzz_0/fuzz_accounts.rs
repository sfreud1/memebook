use trident_fuzz::fuzzing::*;

/// Storage for all account addresses used in fuzz testing.
///
/// This struct serves as a centralized repository for account addresses,
/// enabling their reuse across different instruction flows and test scenarios.
///
/// Docs: https://ackee.xyz/trident/docs/latest/trident-api-macro/trident-types/fuzz-accounts/
#[derive(Default)]
pub struct AccountAddresses {
    pub pending_admin: AddressStorage,

    pub config: AddressStorage,

    pub borrower: AddressStorage,

    pub offer: AddressStorage,

    pub loan: AddressStorage,

    pub principal_mint: AddressStorage,

    pub collateral_mint: AddressStorage,

    pub offer_vault: AddressStorage,

    pub loan_collateral_vault: AddressStorage,

    pub borrower_collateral_account: AddressStorage,

    pub borrower_principal_account: AddressStorage,

    pub fee_recipient: AddressStorage,

    pub fee_principal_account: AddressStorage,

    pub principal_token_program: AddressStorage,

    pub collateral_token_program: AddressStorage,

    pub associated_token_program: AddressStorage,

    pub system_program: AddressStorage,

    pub lender: AddressStorage,

    pub lender_principal_account: AddressStorage,

    pub lender_collateral_account: AddressStorage,

    pub fee_collateral_account: AddressStorage,

    pub payer: AddressStorage,

    pub program: AddressStorage,

    pub program_data: AddressStorage,

    pub admin: AddressStorage,
}

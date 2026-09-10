// The glob re-exports are load-bearing: `#[program]` resolves the
// `__client_accounts_*` / `__cpi_client_accounts_*` modules that the `Accounts`
// derive generates through them, so narrowing these to explicit type re-exports
// breaks IDL generation. Every module also defines its own `handler`, which the
// globs make ambiguous — harmless, since `lib.rs` always calls them fully
// qualified.
#![allow(ambiguous_glob_reexports)]

pub mod accept_offer;
pub mod cancel_offer;
pub mod claim_default;
pub mod create_offer;
pub mod initialize_config;
pub mod repay;
pub mod update_config;

pub use accept_offer::*;
pub use cancel_offer::*;
pub use claim_default::*;
pub use create_offer::*;
pub use initialize_config::*;
pub use repay::*;
pub use update_config::*;

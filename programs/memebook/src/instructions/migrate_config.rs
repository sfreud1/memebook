use crate::constants::*;
use crate::errors::MemebookError;
use crate::events::ConfigMigrated;
use crate::state::{Config, ACCOUNT_VERSION};
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_lang::Discriminator;

/// `Config` before the version byte existed: discriminator, admin,
/// pending_admin, fee_recipient, three u16 fees, paused, bump.
const V0_LEN: usize = 8 + 32 * 3 + 2 * 3 + 1 + 1;
const V1_LEN: usize = 8 + Config::INIT_SPACE;

#[derive(Accounts)]
pub struct MigrateConfig<'info> {
    /// Must be the program's upgrade authority — the same gate as
    /// `initialize_config`. Rewriting the bytes the program reads is a
    /// deployment step, and the party that can change the code is the only
    /// one who may change the data to match it.
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

    /// CHECK: the config singleton in whatever layout it currently has. The
    /// typed deserialiser cannot read the old layout — that is the reason this
    /// instruction exists — so seeds, owner and discriminator are checked here
    /// and the bytes are rewritten by hand.
    #[account(mut, seeds = [CONFIG_SEED], bump, owner = crate::ID)]
    pub config: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Shift a v0 image into the v1 layout in place: every field moves up one
/// byte to make room for `version`, which is written as the current value.
/// `data` must already be `V1_LEN` long.
pub fn migrate_v0_to_v1(data: &mut [u8]) {
    data.copy_within(8..V0_LEN, 9);
    data[8] = ACCOUNT_VERSION;
}

pub fn handler(ctx: Context<MigrateConfig>) -> Result<()> {
    let config = ctx.accounts.config.to_account_info();

    let from_version = {
        let data = config.try_borrow_data()?;
        require!(
            data.len() >= 8 && data[..8] == *Config::DISCRIMINATOR,
            MemebookError::UnknownLayout
        );
        match data.len() {
            V0_LEN => 0u8,
            V1_LEN if data[8] == ACCOUNT_VERSION => {
                return err!(MemebookError::AlreadyMigrated);
            }
            _ => return err!(MemebookError::UnknownLayout),
        }
    };

    // The account grows, so it may need more rent; the migrator fronts it.
    let needed = Rent::get()?.minimum_balance(V1_LEN);
    let have = config.lamports();
    if needed > have {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: config.clone(),
                },
            ),
            needed - have,
        )?;
    }
    config.resize(V1_LEN)?;

    {
        let mut data = config.try_borrow_mut_data()?;
        migrate_v0_to_v1(&mut data);
    }

    // Prove the result reads back as a current Config before returning.
    let parsed = {
        let data = config.try_borrow_data()?;
        Config::try_deserialize(&mut &data[..])?
    };
    require!(parsed.version == ACCOUNT_VERSION, MemebookError::UnknownLayout);

    emit!(ConfigMigrated {
        from_version,
        to_version: ACCOUNT_VERSION,
        admin: parsed.admin,
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v0_image_becomes_a_readable_v1_config() {
        let admin = Pubkey::new_unique();
        let pending = Pubkey::new_unique();
        let recipient = Pubkey::new_unique();

        let mut v0 = Vec::with_capacity(V1_LEN);
        v0.extend_from_slice(&Config::DISCRIMINATOR);
        v0.extend_from_slice(admin.as_ref());
        v0.extend_from_slice(pending.as_ref());
        v0.extend_from_slice(recipient.as_ref());
        v0.extend_from_slice(&1000u16.to_le_bytes());
        v0.extend_from_slice(&500u16.to_le_bytes());
        v0.extend_from_slice(&10u16.to_le_bytes());
        v0.push(1); // paused
        v0.push(254); // bump
        assert_eq!(v0.len(), V0_LEN);
        v0.push(0); // the byte `resize` appends
        assert_eq!(v0.len(), V1_LEN);

        migrate_v0_to_v1(&mut v0);

        let cfg = Config::try_deserialize(&mut &v0[..]).unwrap();
        assert_eq!(cfg.version, ACCOUNT_VERSION);
        assert_eq!(cfg.admin, admin);
        assert_eq!(cfg.pending_admin, pending);
        assert_eq!(cfg.fee_recipient, recipient);
        assert_eq!(
            (cfg.origination_fee_bps, cfg.interest_fee_bps, cfg.default_fee_bps),
            (1000, 500, 10)
        );
        assert!(cfg.paused);
        assert_eq!(cfg.bump, 254);
    }
}

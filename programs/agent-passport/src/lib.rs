//! Agent Passport — on-chain permission passport for AI agent identities.
//!
//! The program is the ONLY thing that ever writes a passport. Verification is
//! entirely off-chain (offline Ed25519 signature check + one account read), so
//! there is no on-chain compute at verification time — this program runs only on
//! initialize / update / close.

use anchor_lang::prelude::*;

pub mod constants;
pub mod contexts;
pub mod errors;
pub mod events;
pub mod state;

use crate::constants::PASSPORT_VERSION;
use crate::contexts::*;
use crate::events::{PassportClosed, PassportInitialized, PassportUpdated};
use crate::state::{validate_label, validate_permissions};

declare_id!("HffPjZ3SXPAPzJRuKfNnihNHbFtv6LAaeH29nCs54BEX");

#[program]
pub mod agent_passport {
    use super::*;

    /// Create a passport PDA for `agent`, owned/edited by the signing `authority`.
    /// The agent key is identity-only and does NOT sign this instruction.
    pub fn initialize_passport(
        ctx: Context<InitializePassport>,
        agent: Pubkey,
        label: String,
        permissions: Vec<String>,
    ) -> Result<()> {
        validate_label(&label)?;
        validate_permissions(&permissions)?;

        let now = Clock::get()?.unix_timestamp;
        let passport = &mut ctx.accounts.passport;
        passport.version = PASSPORT_VERSION;
        passport.bump = ctx.bumps.passport;
        passport.authority = ctx.accounts.authority.key();
        passport.agent = agent;
        passport.label = label.clone();
        passport.permissions = permissions.clone();
        passport.created_at = now;
        passport.updated_at = now;

        emit!(PassportInitialized {
            passport: passport.key(),
            authority: passport.authority,
            agent,
            label,
            permissions,
            created_at: now,
        });
        Ok(())
    }

    /// Replace the passport's permission set (full-set write, not deltas — so it
    /// is idempotent and free of lost-update hazards) and optionally the label.
    /// Only the stored `authority` may call this.
    pub fn update_permissions(
        ctx: Context<UpdatePermissions>,
        label: Option<String>,
        permissions: Vec<String>,
    ) -> Result<()> {
        if let Some(ref l) = label {
            validate_label(l)?;
        }
        validate_permissions(&permissions)?;

        let now = Clock::get()?.unix_timestamp;
        let passport = &mut ctx.accounts.passport;
        if let Some(l) = label {
            passport.label = l;
        }
        passport.permissions = permissions.clone();
        passport.updated_at = now;

        emit!(PassportUpdated {
            passport: passport.key(),
            authority: passport.authority,
            agent: passport.agent,
            label: passport.label.clone(),
            permissions,
            updated_at: now,
        });
        Ok(())
    }

    /// Close the passport, refunding rent to the authority. This is revocation:
    /// after close, reading the PDA returns no account.
    pub fn close_passport(ctx: Context<ClosePassport>) -> Result<()> {
        let passport = &ctx.accounts.passport;
        emit!(PassportClosed {
            passport: passport.key(),
            authority: passport.authority,
            agent: passport.agent,
        });
        Ok(())
    }
}

//! Instruction account contexts.
//!
//! Authority is strictly separated from identity: the `authority` (owner) signs
//! every write; the `agent` key is only a PDA seed and never signs here.
//! `has_one = authority` ensures a leaked agent key can never rewrite its own
//! passport.
//!
//! Authority is ALSO separated from who pays. On create, a distinct `payer`
//! funds the rent. The payer may be the authority itself (local/dev owner) or a
//! separate sponsor key (embedded + sponsored owner), letting a user hold the
//! authority without holding any SOL. The payer never becomes the authority.

use anchor_lang::prelude::*;

use crate::constants::PASSPORT_SEED;
use crate::errors::PassportError;
use crate::state::Passport;

#[derive(Accounts)]
#[instruction(agent: Pubkey)]
pub struct InitializePassport<'info> {
    /// Owner authority: stored as the passport authority and the only signer
    /// allowed to update/close later. Pays NO rent, so it may hold zero SOL.
    pub authority: Signer<'info>,

    /// Rent + fee payer. Equals `authority` for a local/dev owner, or a separate
    /// sponsor key for an embedded owner. Funds the account; never the authority.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Passport PDA, seeded by the agent identity pubkey.
    #[account(
        init,
        payer = payer,
        space = 8 + Passport::INIT_SPACE,
        seeds = [PASSPORT_SEED, agent.as_ref()],
        bump,
    )]
    pub passport: Account<'info, Passport>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePermissions<'info> {
    /// Must equal the passport's stored authority.
    pub authority: Signer<'info>,

    /// Re-derived from the stored agent seed + stored canonical bump.
    #[account(
        mut,
        has_one = authority @ PassportError::Unauthorized,
        seeds = [PASSPORT_SEED, passport.agent.as_ref()],
        bump = passport.bump,
    )]
    pub passport: Account<'info, Passport>,
}

#[derive(Accounts)]
pub struct ClosePassport<'info> {
    /// Receives the refunded rent; must equal the passport's stored authority.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Closing the account IS revocation: afterwards the PDA read returns nothing.
    #[account(
        mut,
        has_one = authority @ PassportError::Unauthorized,
        close = authority,
        seeds = [PASSPORT_SEED, passport.agent.as_ref()],
        bump = passport.bump,
    )]
    pub passport: Account<'info, Passport>,
}

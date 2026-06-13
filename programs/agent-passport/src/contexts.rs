//! Instruction account contexts.
//!
//! Authority is strictly separated from identity: the `authority` (owner wallet)
//! signs and pays for every write; the `agent` key is only a PDA seed and never
//! signs here. `has_one = authority` ensures a leaked agent key can never rewrite
//! its own passport.

use anchor_lang::prelude::*;

use crate::constants::PASSPORT_SEED;
use crate::errors::PassportError;
use crate::state::Passport;

#[derive(Accounts)]
#[instruction(agent: Pubkey)]
pub struct InitializePassport<'info> {
    /// Owner wallet: authority + rent payer. Signs the write.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Passport PDA, seeded by the agent identity pubkey.
    #[account(
        init,
        payer = authority,
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

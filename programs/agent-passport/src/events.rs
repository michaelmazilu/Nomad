//! Events emitted on every write. Cheap, and they let indexers / future
//! subscription-based verifiers track passport lifecycle without polling.

use anchor_lang::prelude::*;

#[event]
pub struct PassportInitialized {
    pub passport: Pubkey,
    pub authority: Pubkey,
    pub agent: Pubkey,
    pub label: String,
    pub permissions: Vec<String>,
    pub created_at: i64,
}

#[event]
pub struct PassportUpdated {
    pub passport: Pubkey,
    pub authority: Pubkey,
    pub agent: Pubkey,
    pub label: String,
    pub permissions: Vec<String>,
    pub updated_at: i64,
}

#[event]
pub struct PassportClosed {
    pub passport: Pubkey,
    pub authority: Pubkey,
    pub agent: Pubkey,
}

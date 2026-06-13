//! Passport account layout + bounds validation.
//!
//! Field declaration order IS the canonical Borsh layout. The SDK decoder
//! (`packages/sdk/src/account.ts`) mirrors it byte-for-byte; the devnet
//! integration test is the definitive cross-check that the two agree.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PassportError;

#[account]
#[derive(InitSpace)]
pub struct Passport {
    /// Schema version (starts at 1; bump on layout change).
    pub version: u8,
    /// Canonical PDA bump, stored so update/close re-validate against it.
    pub bump: u8,
    /// Owner wallet permitted to edit/close (and that paid the rent).
    pub authority: Pubkey,
    /// Agent identity pubkey — the PDA seed. Identity-only; never signs writes.
    pub agent: Pubkey,
    /// Human-readable label.
    #[max_len(64)]
    pub label: String,
    /// Capability scopes. Count <= MAX_PERMISSIONS, each <= MAX_SCOPE_LEN bytes.
    #[max_len(32, 64)]
    pub permissions: Vec<String>,
    /// Creation time, Unix SECONDS.
    pub created_at: i64,
    /// Last update time, Unix SECONDS.
    pub updated_at: i64,
}

// The `#[max_len(..)]` attributes above must be literals, so guard them against
// the named constants at compile time — changing a constant without updating the
// literal is a hard compile error rather than a silent layout/bounds mismatch.
const _: () = {
    assert!(MAX_LABEL_LEN == 64);
    assert!(MAX_PERMISSIONS == 32);
    assert!(MAX_SCOPE_LEN == 64);
};

/// Reject an over-long label.
pub fn validate_label(label: &str) -> Result<()> {
    require!(label.len() <= MAX_LABEL_LEN, PassportError::LabelTooLong);
    Ok(())
}

/// Reject too many scopes, empty scopes, or over-long scopes. The program is the
/// hard boundary for *bounds*; the *namespace allowlist* is off-chain SDK policy.
pub fn validate_permissions(permissions: &[String]) -> Result<()> {
    require!(
        permissions.len() <= MAX_PERMISSIONS,
        PassportError::TooManyPermissions
    );
    for scope in permissions {
        require!(!scope.is_empty(), PassportError::EmptyScope);
        require!(scope.len() <= MAX_SCOPE_LEN, PassportError::ScopeTooLong);
    }
    Ok(())
}

//! Explicit, named program errors. Over-bound input and authority mismatches are
//! rejected with these rather than with generic Anchor constraint errors.

use anchor_lang::prelude::*;

#[error_code]
pub enum PassportError {
    #[msg("Label exceeds maximum length")]
    LabelTooLong,
    #[msg("Too many permission scopes")]
    TooManyPermissions,
    #[msg("Permission scope exceeds maximum length")]
    ScopeTooLong,
    #[msg("Permission scope must not be empty")]
    EmptyScope,
    #[msg("Signer is not the passport authority")]
    Unauthorized,
}

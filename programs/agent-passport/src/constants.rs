//! Protocol constants. These bounds are the *hard* on-chain boundary and MUST be
//! mirrored exactly by the SDK (`packages/sdk/src/constants.ts`). The account is
//! sized at `init` from these values, so they cannot grow without a migration.

/// Schema version stored in every passport. Bump on any layout change.
pub const PASSPORT_VERSION: u8 = 1;

/// Maximum byte length of the human label.
pub const MAX_LABEL_LEN: usize = 64;

/// Maximum byte length of a single permission scope.
pub const MAX_SCOPE_LEN: usize = 64;

/// Maximum number of permission scopes per passport.
pub const MAX_PERMISSIONS: usize = 32;

/// PDA seed prefix: `["passport", agent_pubkey]`.
pub const PASSPORT_SEED: &[u8] = b"passport";

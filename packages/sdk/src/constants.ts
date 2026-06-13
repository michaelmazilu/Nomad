/**
 * Protocol constants — the single TypeScript mirror of the on-chain bounds and
 * the wire-format identifiers. These MUST match the program
 * (`programs/agent-passport/src/constants.rs`) exactly.
 */

/** Account schema version stored on-chain (Unix-seconds timestamps live here). */
export const PASSPORT_VERSION = 1;

/** Maximum byte length of the human label. */
export const MAX_LABEL_LEN = 64;

/** Maximum byte length of a single permission scope. */
export const MAX_SCOPE_LEN = 64;

/** Maximum number of permission scopes per passport. */
export const MAX_PERMISSIONS = 32;

/** PDA seed prefix: derive from `["passport", agentPubkey]`. */
export const PASSPORT_SEED = "passport";

/**
 * Domain-separation tag for the canonical action message. Binds a signature to
 * this protocol + version, so bytes valid elsewhere (e.g. a Solana transaction
 * message) can never be replayed as an action request.
 */
export const ACTION_DOMAIN_TAG = "agent-passport:v1:request";

/** Action-message schema version (the `u8` in the signed bytes). */
export const MESSAGE_SCHEMA_VERSION = 1;

/** Ed25519 sizes (fixed by the curve — never version-dependent). */
export const PUBLIC_KEY_LENGTH = 32;
export const SECRET_KEY_LENGTH = 64;
export const SIGNATURE_LENGTH = 64;

/** Anchor account discriminator length (skipped by the decoder). */
export const ACCOUNT_DISCRIMINATOR_LENGTH = 8;

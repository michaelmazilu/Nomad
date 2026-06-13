/** Shared protocol types. */

/**
 * The action an agent asks to perform. The verifier re-encodes this via the SDK
 * to reconstruct the exact bytes the agent signed, so every field here is part
 * of the signature.
 */
export interface ActionRequest {
  /** Capability being requested; matched against the passport scopes (e.g. "calendar.read"). */
  action: string;
  /** Resource the action targets; omit or "" if not applicable. */
  resource?: string;
  /** Arbitrary string key/value params bound into the signature. */
  params?: Record<string, string>;
  /**
   * Milliseconds since the Unix epoch. NOTE: distinct unit from the on-chain
   * `createdAt`/`updatedAt`, which are SECONDS.
   */
  timestamp: number;
}

/** What travels from agent to verifier. Pubkey + signature are Base58. */
export interface SignedAction {
  agentPublicKey: string;
  signature: string;
  request: ActionRequest;
}

/** Decoded passport account (pubkeys as Base58; timestamps in Unix SECONDS). */
export interface Passport {
  version: number;
  bump: number;
  authority: string;
  agent: string;
  label: string;
  permissions: string[];
  createdAt: number;
  updatedAt: number;
}

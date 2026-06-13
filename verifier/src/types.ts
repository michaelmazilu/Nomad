import type { ActionRequest, Passport } from "@agent-passport/sdk";

/**
 * One distinct result per outcome — never a silent allow. `ok` is the only
 * success; everything else is a deny with a specific reason.
 */
export type VerifyStatus =
  | "ok"
  | "stale_or_future"
  | "replay"
  | "bad_signature"
  | "no_passport"
  | "not_permitted"
  | "verifier_unavailable";

export interface VerifyInput {
  /** Base58 agent public key (32 bytes). */
  agentPublicKey: string;
  /** Base58 Ed25519 signature (64 bytes). */
  signature: string;
  /** The action request the agent signed. */
  request: ActionRequest;
}

export interface VerifyResult {
  status: VerifyStatus;
  /** Convenience: true iff `status === "ok"`. */
  ok: boolean;
  /** Human-readable detail (not for control flow). */
  reason?: string;
  /** Present when the on-chain read succeeded (status `ok` or `not_permitted`). */
  passport?: Passport;
}

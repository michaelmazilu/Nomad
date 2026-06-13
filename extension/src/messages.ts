import type { Cluster, SignedAction } from "@agent-passport/sdk";
import type { VerifyStatus } from "@agent-passport/verifier";

/**
 * Owner-wallet mode. `phantom` is the real path (keys stay in Phantom); `local`
 * is an explicitly dev-only in-extension keypair for localnet / CI.
 */
export type OwnerMode = "phantom" | "local";
export type WalletProviderKind = "embedded" | "injected";

/** Requests the popup (or an external page) sends to the background worker. */
export type Msg =
  | { type: "AGENT_ENSURE" }
  | { type: "AGENT_GET" }
  | { type: "PHANTOM_CONNECT"; cluster: Cluster }
  | { type: "OWNER_LOCAL_ENSURE" }
  | { type: "OWNER_GET"; cluster: Cluster; mode: OwnerMode }
  | { type: "OWNER_AIRDROP"; cluster: Cluster; mode: OwnerMode }
  | { type: "PASSPORT_READ"; cluster: Cluster }
  | {
      type: "PASSPORT_CREATE";
      cluster: Cluster;
      mode: OwnerMode;
      label: string;
      scopes: string[];
    }
  | {
      type: "PASSPORT_UPDATE";
      cluster: Cluster;
      mode: OwnerMode;
      label: string | null;
      scopes: string[];
    }
  | { type: "PASSPORT_REVOKE"; cluster: Cluster; mode: OwnerMode }
  | { type: "ATTEMPT_ACTION"; cluster: Cluster; action: string };

export interface AgentInfo {
  agentPublicKey: string | null;
}
export interface OwnerInfo {
  /** Which owner is active, or null if none connected/created. */
  kind: OwnerMode | null;
  ownerPublicKey: string | null;
  balanceSol: number;
  /** Which Phantom path produced the owner wallet, when known. */
  providerKind?: WalletProviderKind | null;
  /** Cluster Phantom reports it is on (when known); used to flag mismatches. */
  walletCluster?: Cluster | null;
}
export interface PassportInfo {
  passport: { scopes: string[]; label: string } | null;
}
export interface TxResult {
  txSig: string;
  cluster: Cluster;
}
export interface AirdropResult {
  balanceSol: number;
  txSig: string;
}
/** The testable result: did the action verify, and what scopes did the agent have? */
export interface AttemptResult {
  status: VerifyStatus;
  reason?: string;
  scopes: string[] | null;
  signed: SignedAction;
}

export type Response =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

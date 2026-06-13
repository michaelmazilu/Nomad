import type { Cluster, SignedAction } from "@agent-passport/sdk";
import type { VerifyStatus } from "@agent-passport/verifier";

/** Requests the popup (or an external page) sends to the background worker. */
export type Msg =
  | { type: "AGENT_ENSURE" }
  | { type: "AGENT_GET" }
  | { type: "OWNER_ENSURE" }
  | { type: "OWNER_GET"; cluster: Cluster }
  | { type: "OWNER_AIRDROP"; cluster: Cluster }
  | { type: "PASSPORT_READ"; cluster: Cluster }
  | { type: "PASSPORT_CREATE"; cluster: Cluster; label: string; scopes: string[] }
  | { type: "PASSPORT_UPDATE"; cluster: Cluster; label: string | null; scopes: string[] }
  | { type: "PASSPORT_REVOKE"; cluster: Cluster }
  | { type: "ATTEMPT_ACTION"; cluster: Cluster; action: string };

export interface AgentInfo {
  agentPublicKey: string | null;
}
export interface OwnerInfo {
  ownerPublicKey: string | null;
  balanceSol: number;
}
export interface PassportInfo {
  passport: { scopes: string[]; label: string } | null;
}
export interface TxResult {
  txSig: string;
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

export type Response = { ok: true; data: unknown } | { ok: false; error: string };

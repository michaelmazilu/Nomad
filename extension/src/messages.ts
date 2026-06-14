import type { Cluster, SignedAction } from "@agent-passport/sdk";
import type { VerifyStatus } from "@agent-passport/verifier";
import type { InferenceRiskLevel } from "./inference";

/**
 * Owner-wallet mode.
 * - `embedded`: in-app keypair is the authority, a backend sponsor pays fees/rent
 *   (no wallet app, no SOL for the user). The recommended production path.
 * - `phantom`: keys stay in Phantom; the user installs a wallet and pays.
 * - `local`: explicitly dev-only in-extension keypair that self-pays (localnet/CI).
 */
export type OwnerMode = "embedded" | "phantom" | "local";
export type WalletProviderKind = "embedded" | "injected";

/** Requests the side panel (or an external page) sends to the background worker. */
export type Msg =
  | { type: "AGENT_ENSURE" }
  | { type: "AGENT_GET" }
  | { type: "PHANTOM_CONNECT"; cluster: Cluster }
  | { type: "OWNER_EMBEDDED_ENSURE"; cluster: Cluster }
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
  | { type: "ATTEMPT_ACTION"; cluster: Cluster; action: string }
  | { type: "INFER_PERMISSIONS_FROM_ACTIVE_TAB" }
  | { type: "DETECT_AGENT_INTENT_FROM_ACTIVE_TAB" }
  | { type: "AGENT_GET_PUBLIC_KEY" }
  | { type: "AGENT_SIGN_MESSAGE"; message: string }
  | { type: "AGENT_SIGN_ACTION"; action: string };

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
export interface InferenceResult {
  agentName: string | null;
  label: string;
  scopes: string[];
  testAction?: string;
  riskLevel: InferenceRiskLevel;
  warnings: string[];
  source: {
    url: string;
    title?: string;
  };
}

/** Result of classifying the latest ChatGPT user message for agent-creation intent. */
export interface AgentIntentResult {
  /** True when the latest user message differs from the last one we classified. */
  changed: boolean;
  /** Haiku's verdict: did the user ask to create an agent? */
  wantsAgent: boolean;
  /** The classified message text, or null when there is nothing to classify. */
  text: string | null;
  /** Outcome of the passport step for this poll. */
  passportStatus:
    | "not_requested"
    | "detection_failed"
    | "existing"
    | "created"
    | "failed";
  /** Failure detail when passportStatus is "failed". */
  error?: string;
}

export interface AgentStatusUpdate {
  type: "AGENT_STATUS_UPDATE";
  title: string;
}

/** Result of signing an arbitrary message with the agent key. */
export interface SignResult {
  agentPublicKey: string;
  signature: string;
}

export type Response =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

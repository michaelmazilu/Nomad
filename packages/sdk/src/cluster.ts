import { PublicKey } from "@solana/web3.js";

/**
 * Cluster is first-class config on both client and verifier. A cluster mismatch
 * is a silent trap: an agent registered on devnet against a mainnet verifier
 * derives the *same* PDA but finds no account (silent `no_passport`). Always set
 * this explicitly and surface mismatches.
 */
export type Cluster = "localnet" | "devnet" | "mainnet-beta";

export interface ClusterConfig {
  cluster: Cluster;
  /** RPC endpoint. On mainnet-beta you MUST use a dedicated (non-public) URL. */
  rpcUrl: string;
  /** Deployed program ID (Base58). */
  programId: string;
}

/**
 * Canonical program ID, derived from the program keypair and synced across the
 * repo by `anchor keys sync` (also in `Anchor.toml` and the program's
 * `declare_id!`). The same ID applies wherever the program is deployed with that
 * keypair; a separate mainnet keypair would change the mainnet entry below.
 */
export const AGENT_PASSPORT_PROGRAM_ID =
  "HffPjZ3SXPAPzJRuKfNnihNHbFtv6LAaeH29nCs54BEX";

export const DEFAULT_RPC_URLS: Record<Cluster, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

export const DEFAULT_PROGRAM_IDS: Record<Cluster, string> = {
  localnet: AGENT_PASSPORT_PROGRAM_ID,
  devnet: AGENT_PASSPORT_PROGRAM_ID,
  "mainnet-beta": AGENT_PASSPORT_PROGRAM_ID,
};

/** Resolve a cluster config, allowing per-field overrides (env-driven in prod). */
export function getClusterConfig(
  cluster: Cluster,
  overrides: Partial<Omit<ClusterConfig, "cluster">> = {},
): ClusterConfig {
  return {
    cluster,
    rpcUrl: overrides.rpcUrl ?? DEFAULT_RPC_URLS[cluster],
    programId: overrides.programId ?? DEFAULT_PROGRAM_IDS[cluster],
  };
}

export function programIdPubkey(config: ClusterConfig): PublicKey {
  return new PublicKey(config.programId);
}

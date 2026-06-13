import { Connection, PublicKey } from "@solana/web3.js";
import { getClusterConfig, type Cluster } from "@agent-passport/sdk";
import { RpcPassportReader, type PassportReader } from "./passportReader";
import { InMemoryReplayCache, type ReplayCache } from "./replayCache";
import { verify, type VerifierConfig } from "./verify";
import type { VerifyInput, VerifyResult } from "./types";

export * from "./types";
export * from "./replayCache";
export * from "./passportReader";
export { verify } from "./verify";
export type { VerifierConfig } from "./verify";

/** Default freshness/replay window (±60s, per the §13 decision). */
export const DEFAULT_SKEW_MS = 60_000;

export interface CreateVerifierOptions {
  cluster: Cluster;
  /** Override the RPC URL (required for mainnet-beta: a dedicated endpoint). */
  rpcUrl?: string;
  /** Override the program ID (Base58). */
  programId?: string;
  /** Freshness/replay window in ms. Defaults to DEFAULT_SKEW_MS. */
  skewMs?: number;
  /** Inject a custom reader (e.g. cached) or cache (e.g. Redis-backed). */
  reader?: PassportReader;
  replayCache?: ReplayCache;
  /** Injectable clock (ms), mainly for tests. */
  now?: () => number;
}

export interface Verifier {
  verify(input: VerifyInput): Promise<VerifyResult>;
  readonly config: VerifierConfig;
}

/**
 * Build a verifier. Cluster is first-class config: a cluster mismatch between
 * where the passport was written and where the verifier reads is a silent
 * `no_passport` trap, so always set it explicitly.
 */
export function createVerifier(opts: CreateVerifierOptions): Verifier {
  const cfg = getClusterConfig(opts.cluster, {
    ...(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}),
    ...(opts.programId ? { programId: opts.programId } : {}),
  });
  const programId = new PublicKey(cfg.programId);
  const now = opts.now ?? (() => Date.now());
  const reader =
    opts.reader ??
    new RpcPassportReader(new Connection(cfg.rpcUrl, "confirmed"), programId);
  const replayCache = opts.replayCache ?? new InMemoryReplayCache(now);
  const config: VerifierConfig = {
    programId,
    skewMs: opts.skewMs ?? DEFAULT_SKEW_MS,
    reader,
    replayCache,
    now,
  };
  return {
    verify: (input: VerifyInput) => verify(input, config),
    config,
  };
}

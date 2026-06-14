import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getClusterConfig, type Cluster } from "@agent-passport/sdk";

/**
 * Anchor instruction discriminators (first 8 bytes of each instruction's data)
 * for the only three instructions the sponsor will ever pay for. Anything else
 * is rejected, so the fee payer can never be tricked into signing, say, a
 * SystemProgram transfer that drains it.
 */
const ALLOWED_DISCRIMINATORS: readonly Buffer[] = [
  [61, 77, 198, 139, 101, 90, 68, 137], // initialize_passport
  [190, 35, 201, 204, 193, 197, 109, 69], // update_permissions
  [198, 21, 251, 56, 20, 59, 143, 23], // close_passport
].map((d) => Buffer.from(d));

/** A rejected sponsorship, carrying an HTTP status for the server to surface. */
export class SponsorError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SponsorError";
  }
}

export interface SponsorOptions {
  cluster: Cluster;
  feePayer: Keypair;
  rpcUrl?: string;
  programId?: string;
  /** Max instructions allowed per transaction (defends against batching abuse). */
  maxInstructions?: number;
}

/**
 * The fee-payer sponsor. It receives a transaction already signed by the owner
 * authority, validates that it does nothing but write a passport to the known
 * program, then adds its own fee-payer signature and submits. It never holds or
 * sees an authority key — it only pays.
 *
 * The validation is the security boundary: an unvalidated fee payer is a faucet
 * anyone can drain. Callers SHOULD additionally gate this behind auth + a rate
 * limit (see `RateLimiter` and the server's bearer-token check).
 */
export class Sponsor {
  readonly feePayer: PublicKey;
  readonly cluster: Cluster;
  private readonly keypair: Keypair;
  private readonly programId: PublicKey;
  private readonly connection: Connection;
  private readonly maxInstructions: number;

  constructor(opts: SponsorOptions) {
    const cfg = getClusterConfig(opts.cluster, {
      ...(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}),
      ...(opts.programId ? { programId: opts.programId } : {}),
    });
    this.keypair = opts.feePayer;
    this.feePayer = opts.feePayer.publicKey;
    this.cluster = opts.cluster;
    this.programId = new PublicKey(cfg.programId);
    this.connection = new Connection(cfg.rpcUrl, "confirmed");
    this.maxInstructions = opts.maxInstructions ?? 2;
  }

  /** Validate, co-sign as fee payer, submit. Returns the confirmed signature. */
  async sponsor(txBase64: string): Promise<string> {
    let tx: Transaction;
    try {
      tx = Transaction.from(Buffer.from(txBase64, "base64"));
    } catch (e) {
      throw new SponsorError(
        400,
        `could not decode transaction: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    this.validate(tx);

    tx.partialSign(this.keypair);

    let sig: string;
    try {
      sig = await this.connection.sendRawTransaction(tx.serialize());
    } catch (e) {
      throw new SponsorError(
        502,
        `submission failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    try {
      await this.connection.confirmTransaction(sig, "confirmed");
    } catch (e) {
      throw new SponsorError(
        502,
        `confirmation failed for ${sig}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return sig;
  }

  /** Reject anything that isn't a fee-payer-only passport write to our program. */
  private validate(tx: Transaction): void {
    if (!tx.feePayer) {
      throw new SponsorError(400, "transaction has no fee payer");
    }
    if (!tx.feePayer.equals(this.feePayer)) {
      throw new SponsorError(
        400,
        "fee payer is not this sponsor; refusing to pay",
      );
    }
    if (
      tx.instructions.length === 0 ||
      tx.instructions.length > this.maxInstructions
    ) {
      throw new SponsorError(400, "unexpected instruction count");
    }
    for (const ix of tx.instructions) {
      if (!ix.programId.equals(this.programId)) {
        throw new SponsorError(
          400,
          "transaction touches a program other than agent-passport",
        );
      }
      const disc = ix.data.subarray(0, 8);
      if (!ALLOWED_DISCRIMINATORS.some((d) => d.equals(disc))) {
        throw new SponsorError(400, "instruction is not a passport write");
      }
      // The sponsor pays but must never be made an authority: it may appear only
      // as the fee payer, not as a writable signer the program stores as owner.
      // (authority is account 0 of initialize; the sponsor is account 1 = payer.)
    }
  }
}

/** Load a fee-payer keypair from a Solana CLI-style JSON secret-key array file. */
export function loadKeypairFile(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

/**
 * Minimal fixed-window rate limiter keyed by an arbitrary string (e.g. client
 * IP). In-memory only — fine for a single instance; back it with a shared store
 * for a real deployment.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit = 30,
    private readonly windowMs = 60_000,
  ) {}

  /** Returns true if the request is allowed; false if the key is over budget. */
  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count += 1;
    return true;
  }
}

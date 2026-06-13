import { Connection, PublicKey } from "@solana/web3.js";
import {
  decodePassport,
  derivePassportPda,
  type Passport,
} from "@agent-passport/sdk";

/**
 * Reads a passport from the chain. Behind an interface so a read-through cache
 * (or a websocket/Geyser subscription) can be dropped in later without touching
 * the pipeline. Contract:
 *  - returns the decoded passport when one exists;
 *  - returns `null` when no account exists at the PDA (never registered, or
 *    revoked via close) — the pipeline maps this to `no_passport`;
 *  - THROWS on transport/RPC failure — the pipeline catches and fails closed.
 */
export interface PassportReader {
  get(agentPublicKey: PublicKey): Promise<Passport | null>;
}

export class RpcPassportReader implements PassportReader {
  constructor(
    private readonly connection: Connection,
    private readonly programId: PublicKey,
  ) {}

  async get(agentPublicKey: PublicKey): Promise<Passport | null> {
    const [pda] = derivePassportPda(agentPublicKey, this.programId);
    // getAccountInfo returns null for a missing account, and throws on RPC/network
    // failure — exactly the two behaviors the pipeline relies on.
    const info = await this.connection.getAccountInfo(pda, "confirmed");
    if (info === null) return null;
    // Defense in depth: a real passport PDA is owned by our program.
    if (!info.owner.equals(this.programId)) return null;
    return decodePassport(Uint8Array.from(info.data));
  }
}

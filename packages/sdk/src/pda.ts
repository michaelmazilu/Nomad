import { PublicKey } from "@solana/web3.js";
import { PASSPORT_SEED } from "./constants";

const seedBytes = new TextEncoder().encode(PASSPORT_SEED);

/**
 * Derive the passport PDA from just the agent pubkey. Any verifier can re-derive
 * the exact address from an incoming request — no directory/index lookup needed.
 * Mirrors the program seeds `["passport", agent_pubkey]`.
 */
export function derivePassportPda(
  agent: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seedBytes, agent.toBuffer()],
    programId,
  );
}

import { describe, it, expect } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import { derivePassportPda } from "../src/pda";
import { AGENT_PASSPORT_PROGRAM_ID } from "../src/cluster";

const programId = new PublicKey(AGENT_PASSPORT_PROGRAM_ID);

describe("derivePassportPda", () => {
  it("is deterministic for a given agent + program", () => {
    const agent = Keypair.generate().publicKey;
    const [a, bumpA] = derivePassportPda(agent, programId);
    const [b, bumpB] = derivePassportPda(agent, programId);
    expect(a.equals(b)).toBe(true);
    expect(bumpA).toBe(bumpB);
    expect(bumpA).toBeGreaterThanOrEqual(0);
    expect(bumpA).toBeLessThanOrEqual(255);
  });

  it("differs across agents", () => {
    const [a] = derivePassportPda(Keypair.generate().publicKey, programId);
    const [b] = derivePassportPda(Keypair.generate().publicKey, programId);
    expect(a.equals(b)).toBe(false);
  });

  it("produces an off-curve address (a real PDA)", () => {
    const [pda] = derivePassportPda(Keypair.generate().publicKey, programId);
    expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);
  });
});

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { AgentPassport } from "../../target/types/agent_passport";
import { decodePassport, derivePassportPda } from "@agent-passport/sdk";
import { assert } from "chai";

/**
 * The definitive cross-check: the program writes a real account, and the SDK's
 * hand-rolled Borsh decoder reads it back. An in-repo round-trip only proves the
 * codec is self-consistent; this proves the SDK decoder agrees with the program's
 * actual on-chain layout. Cluster-agnostic — runs on localnet under `anchor test`
 * and on devnet with `anchor test --provider.cluster devnet`.
 */
describe("SDK decoder <-> program cross-check (real on-chain account)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.agentPassport as Program<AgentPassport>;

  before(async () => {
    const bal = await provider.connection.getBalance(provider.wallet.publicKey);
    if (bal < 1_000_000_000) {
      const sig = await provider.connection.requestAirdrop(
        provider.wallet.publicKey,
        5_000_000_000,
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
  });

  it("SDK decode of a real account matches what the program wrote", async () => {
    const agent = Keypair.generate().publicKey;
    const label = "Cross-check Agent";
    const permissions = ["calendar.read", "calendar.*", "api:example.com"];
    const [pda, bump] = derivePassportPda(agent, program.programId);

    await program.methods
      .initializePassport(agent, label, permissions)
      .accountsPartial({ authority: provider.wallet.publicKey, passport: pda })
      .rpc();

    // Read the RAW account bytes and decode with the SDK (not Anchor's codec).
    const info = await provider.connection.getAccountInfo(pda);
    assert.isNotNull(info, "account should exist");
    assert.ok(info!.owner.equals(program.programId), "owned by the program");

    const decoded = decodePassport(Uint8Array.from(info!.data));
    assert.equal(decoded.version, 1);
    assert.equal(decoded.bump, bump);
    assert.equal(decoded.authority, provider.wallet.publicKey.toBase58());
    assert.equal(decoded.agent, agent.toBase58());
    assert.equal(decoded.label, label);
    assert.deepEqual(decoded.permissions, permissions);
    assert.isAbove(decoded.createdAt, 0);
    assert.equal(decoded.createdAt, decoded.updatedAt);

    // Cross-check the SDK decode against Anchor's own decode of the same account.
    const viaAnchor = await program.account.passport.fetch(pda);
    assert.equal(decoded.authority, viaAnchor.authority.toBase58());
    assert.equal(decoded.agent, viaAnchor.agent.toBase58());
    assert.deepEqual(decoded.permissions, viaAnchor.permissions);
    assert.equal(decoded.createdAt, (viaAnchor.createdAt as BN).toNumber());
  });
});

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { AgentPassport } from "../../target/types/agent_passport";
import { assert } from "chai";

describe("agent_passport", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.agentPassport as Program<AgentPassport>;
  const authority = provider.wallet;

  before(async () => {
    // Self-fund on a fresh local validator so the suite is standalone.
    const bal = await provider.connection.getBalance(authority.publicKey);
    if (bal < 1_000_000_000) {
      const sig = await provider.connection.requestAirdrop(
        authority.publicKey,
        5_000_000_000,
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
  });

  const passportPda = (agent: PublicKey): PublicKey =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("passport"), agent.toBuffer()],
      program.programId,
    )[0];

  async function expectError(p: Promise<unknown>, code: string) {
    try {
      await p;
      assert.fail(`expected error "${code}" but the call succeeded`);
    } catch (e: any) {
      const blob = `${e?.error?.errorCode?.code ?? ""} ${e?.toString?.() ?? ""} ${JSON.stringify(e?.error ?? {})}`;
      assert.include(blob, code, `expected error "${code}", got: ${blob}`);
    }
  }

  it("initializes a passport (authority signs, agent does not)", async () => {
    const agent = Keypair.generate().publicKey;
    const pda = passportPda(agent);
    await program.methods
      .initializePassport(agent, "My Agent", ["calendar.read", "calendar.*"])
      .accountsPartial({ authority: authority.publicKey, passport: pda })
      .rpc();

    const acct = await program.account.passport.fetch(pda);
    assert.equal(acct.version, 1);
    assert.equal(acct.bump, passportBump(agent, program.programId));
    assert.ok(acct.authority.equals(authority.publicKey));
    assert.ok(acct.agent.equals(agent));
    assert.equal(acct.label, "My Agent");
    assert.deepEqual(acct.permissions, ["calendar.read", "calendar.*"]);
    assert.ok((acct.createdAt as BN).eq(acct.updatedAt as BN));
  });

  it("updates permissions as a full-set replace and bumps updated_at", async () => {
    const agent = Keypair.generate().publicKey;
    const pda = passportPda(agent);
    await program.methods
      .initializePassport(agent, "Agent", ["calendar.read"])
      .accountsPartial({ authority: authority.publicKey, passport: pda })
      .rpc();
    const before = await program.account.passport.fetch(pda);

    // wait > 1s so the on-chain unix-seconds clock advances
    await new Promise((r) => setTimeout(r, 1200));

    await program.methods
      .updatePermissions("Renamed", ["mail.send", "files.read"])
      .accountsPartial({ authority: authority.publicKey, passport: pda })
      .rpc();

    const after = await program.account.passport.fetch(pda);
    assert.equal(after.label, "Renamed");
    assert.deepEqual(after.permissions, ["mail.send", "files.read"]);
    assert.ok((after.updatedAt as BN).gte(before.updatedAt as BN));
    assert.ok((after.createdAt as BN).eq(before.createdAt as BN));
  });

  it("keeps the label when update passes null", async () => {
    const agent = Keypair.generate().publicKey;
    const pda = passportPda(agent);
    await program.methods
      .initializePassport(agent, "Keep Me", ["calendar.read"])
      .accountsPartial({ authority: authority.publicKey, passport: pda })
      .rpc();
    await program.methods
      .updatePermissions(null, ["calendar.write"])
      .accountsPartial({ authority: authority.publicKey, passport: pda })
      .rpc();
    const acct = await program.account.passport.fetch(pda);
    assert.equal(acct.label, "Keep Me");
    assert.deepEqual(acct.permissions, ["calendar.write"]);
  });

  it("rejects update/close from a non-authority signer", async () => {
    const agent = Keypair.generate().publicKey;
    const pda = passportPda(agent);
    await program.methods
      .initializePassport(agent, "Agent", ["calendar.read"])
      .accountsPartial({ authority: authority.publicKey, passport: pda })
      .rpc();

    const attacker = Keypair.generate();
    await expectError(
      program.methods
        .updatePermissions(null, ["mail.send"])
        .accountsPartial({ authority: attacker.publicKey, passport: pda })
        .signers([attacker])
        .rpc(),
      "Unauthorized",
    );
    await expectError(
      program.methods
        .closePassport()
        .accountsPartial({ authority: attacker.publicKey, passport: pda })
        .signers([attacker])
        .rpc(),
      "Unauthorized",
    );
  });

  it("closes a passport (revocation: the account is gone)", async () => {
    const agent = Keypair.generate().publicKey;
    const pda = passportPda(agent);
    await program.methods
      .initializePassport(agent, "Agent", ["calendar.read"])
      .accountsPartial({ authority: authority.publicKey, passport: pda })
      .rpc();
    await program.methods
      .closePassport()
      .accountsPartial({ authority: authority.publicKey, passport: pda })
      .rpc();

    const info = await provider.connection.getAccountInfo(pda);
    assert.isNull(info, "passport account should not exist after close");
  });

  describe("bounds enforcement", () => {
    it("rejects an over-long label", async () => {
      const agent = Keypair.generate().publicKey;
      await expectError(
        program.methods
          .initializePassport(agent, "x".repeat(65), ["calendar.read"])
          .accountsPartial({ authority: authority.publicKey, passport: passportPda(agent) })
          .rpc(),
        "LabelTooLong",
      );
    });

    it("rejects too many permission scopes", async () => {
      const agent = Keypair.generate().publicKey;
      const many = Array.from({ length: 33 }, (_, i) => `calendar.s${i}`);
      await expectError(
        program.methods
          .initializePassport(agent, "Agent", many)
          .accountsPartial({ authority: authority.publicKey, passport: passportPda(agent) })
          .rpc(),
        "TooManyPermissions",
      );
    });

    it("rejects an over-long scope", async () => {
      const agent = Keypair.generate().publicKey;
      await expectError(
        program.methods
          .initializePassport(agent, "Agent", [`calendar.${"x".repeat(64)}`])
          .accountsPartial({ authority: authority.publicKey, passport: passportPda(agent) })
          .rpc(),
        "ScopeTooLong",
      );
    });

    it("rejects an empty scope", async () => {
      const agent = Keypair.generate().publicKey;
      await expectError(
        program.methods
          .initializePassport(agent, "Agent", [""])
          .accountsPartial({ authority: authority.publicKey, passport: passportPda(agent) })
          .rpc(),
        "EmptyScope",
      );
    });
  });
});

function passportBump(agent: PublicKey, programId: PublicKey): number {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("passport"), agent.toBuffer()],
    programId,
  )[1];
}

import { describe, it, expect, vi } from "vitest";
import { Keypair, Transaction } from "@solana/web3.js";
import type { Cluster } from "@agent-passport/sdk";
import { PassportClient } from "../src/passportClient";
import { LocalOwnerSigner, PhantomOwnerSigner } from "../src/ownerSigner";
import {
  TabPhantomBridge,
  assertNetworkMatch,
  type PhantomBridge,
} from "../src/phantom";
import {
  MissingWalletError,
  NetworkMismatchError,
  RpcError,
  WalletRejectedError,
} from "../src/errors";

// NOTE: these unit tests build/sign passport writes with `updateIx`/`revokeIx`,
// which exercise the same construction machinery (program id, PDA seeds, account
// metas, signer flags) as `initializeIx`. We avoid `initializeIx` here only
// because its `agent: Pubkey` instruction argument is borsh-encoded through
// buffer-layout, which under the Node test runner hits a cross-realm `Buffer`
// identity quirk unrelated to product code. `initialize` is covered end-to-end by
// the Anchor program tests (`anchor test`) where there is a single Buffer.

/** A valid 32-byte base58 string, usable as a stand-in recent blockhash. */
const fakeBlockhash = (): string => Keypair.generate().publicKey.toBase58();

describe("transaction construction", () => {
  const client = new PassportClient("localnet");

  it("update targets the program, passport PDA, and owner authority", async () => {
    const owner = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const ix = await client.updateIx(owner, agent, "renamed", [
      "calendar.read",
      "calendar.*",
    ]);

    expect(ix.programId.equals(client.programId)).toBe(true);

    const auth = ix.keys.find((k) => k.pubkey.equals(owner));
    expect(auth?.isSigner).toBe(true);
    expect(auth?.isWritable).toBe(false); // update does not move lamports

    const pda = client.passportPda(agent);
    const passport = ix.keys.find((k) => k.pubkey.equals(pda));
    expect(passport?.isWritable).toBe(true);
    expect(passport?.isSigner).toBe(false);
  });

  it("revoke targets the passport PDA and owner authority (rent refund)", async () => {
    const owner = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const pda = client.passportPda(agent);
    const ix = await client.revokeIx(owner, agent);

    expect(ix.keys.some((k) => k.pubkey.equals(pda) && k.isWritable)).toBe(
      true,
    );
    expect(
      ix.keys.some((k) => k.pubkey.equals(owner) && k.isSigner && k.isWritable),
    ).toBe(true);
  });

  it("rejects invalid permissions before building any instruction", () => {
    const owner = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    // Both initialize and update validate up front, before encoding/signing.
    expect(() =>
      client.initializeIx(owner, agent, "x", ["NotAScope!!"]),
    ).toThrow(/invalid permissions/);
    expect(() => client.updateIx(owner, agent, null, ["also bad!!"])).toThrow(
      /invalid permissions/,
    );
  });

  it("assemble sets fee payer + recent blockhash", () => {
    const owner = Keypair.generate().publicKey;
    const bh = fakeBlockhash();
    const tx = PassportClient.assemble([], owner, bh);
    expect(tx.feePayer?.equals(owner)).toBe(true);
    expect(tx.recentBlockhash).toBe(bh);
  });
});

describe("wallet separation (authority vs identity)", () => {
  const client = new PassportClient("localnet");

  it("the agent key is never an account or signer on a passport write", async () => {
    const ownerKp = Keypair.generate();
    const agentKp = Keypair.generate();
    const ix = await client.updateIx(
      ownerKp.publicKey,
      agentKp.publicKey,
      null,
      ["calendar.read"],
    );

    // Agent appears only as a PDA seed — never as an account key.
    expect(ix.keys.some((k) => k.pubkey.equals(agentKp.publicKey))).toBe(false);

    // The sole signer is the owner authority.
    const signers = ix.keys.filter((k) => k.isSigner);
    expect(signers).toHaveLength(1);
    expect(signers[0]!.pubkey.equals(ownerKp.publicKey)).toBe(true);
  });

  it("the owner signs the transaction; the agent key never appears in signatures", async () => {
    const ownerKp = Keypair.generate();
    const agentKp = Keypair.generate();
    const ix = await client.updateIx(
      ownerKp.publicKey,
      agentKp.publicKey,
      null,
      ["calendar.read"],
    );
    const tx = PassportClient.assemble(
      [ix],
      ownerKp.publicKey,
      fakeBlockhash(),
    );

    await new LocalOwnerSigner(ownerKp).signTransaction(tx);

    const ownerSig = tx.signatures.find((s) =>
      s.publicKey.equals(ownerKp.publicKey),
    );
    expect(ownerSig?.signature).not.toBeNull();
    expect(
      tx.signatures.some((s) => s.publicKey.equals(agentKp.publicKey)),
    ).toBe(false);
  });
});

describe("rejected signatures", () => {
  it("PhantomOwnerSigner surfaces a wallet rejection (nothing submitted)", async () => {
    const bridge: PhantomBridge = {
      connect: vi.fn(),
      signTransaction: vi.fn().mockRejectedValue(new WalletRejectedError()),
    };
    const signer = new PhantomOwnerSigner(
      bridge,
      Keypair.generate().publicKey,
      "devnet",
      null,
    );
    const tx = PassportClient.assemble(
      [],
      Keypair.generate().publicKey,
      fakeBlockhash(),
    );
    await expect(signer.signTransaction(tx)).rejects.toBeInstanceOf(
      WalletRejectedError,
    );
  });

  it("the bridge rejects when the connector reports a declined request", async () => {
    const bridge = new TabPhantomBridge(
      "http://localhost:5173/",
      "extid",
      async () => {},
      () => "R1",
    );
    const pending = bridge.signTransaction("AA==", "devnet");
    bridge.handleConnectorMessage({ type: "CONNECTOR_PULL", req: "R1" });
    bridge.handleConnectorMessage({
      type: "CONNECTOR_PUSH",
      req: "R1",
      ok: false,
      code: "wallet_rejected",
      error: "User rejected the request.",
    });
    await expect(pending).rejects.toBeInstanceOf(WalletRejectedError);
  });
});

describe("missing wallet", () => {
  it("the bridge raises MissingWalletError when Phantom is absent", async () => {
    const bridge = new TabPhantomBridge(
      "http://localhost:5173/",
      "extid",
      async () => {},
      () => "R1",
    );
    const pending = bridge.connect("devnet");
    const pull = bridge.handleConnectorMessage({
      type: "CONNECTOR_PULL",
      req: "R1",
    });
    expect(pull.handled).toBe(true);
    bridge.handleConnectorMessage({
      type: "CONNECTOR_PUSH",
      req: "R1",
      ok: false,
      code: "missing_wallet",
      error: "Phantom is not installed.",
    });
    await expect(pending).rejects.toBeInstanceOf(MissingWalletError);
  });
});

describe("network mismatch", () => {
  it("assertNetworkMatch throws only on a real disagreement", () => {
    expect(() => assertNetworkMatch("devnet", "mainnet-beta")).toThrow(
      NetworkMismatchError,
    );
    expect(() => assertNetworkMatch("devnet", null)).not.toThrow();
    expect(() => assertNetworkMatch("devnet", "devnet")).not.toThrow();
  });

  it("PhantomOwnerSigner refuses to sign when the wallet is on another cluster", async () => {
    const signTransaction = vi.fn();
    const bridge: PhantomBridge = { connect: vi.fn(), signTransaction };
    const wrongCluster: Cluster = "mainnet-beta";
    const signer = new PhantomOwnerSigner(
      bridge,
      Keypair.generate().publicKey,
      "devnet",
      wrongCluster,
    );
    await expect(
      signer.signTransaction(new Transaction()),
    ).rejects.toBeInstanceOf(NetworkMismatchError);
    expect(signTransaction).not.toHaveBeenCalled(); // never prompted the wallet
  });
});

describe("RPC errors", () => {
  it("latestBlockhash failures are normalized to RpcError", async () => {
    const client = new PassportClient("localnet");
    (
      client.connection as unknown as {
        getLatestBlockhash: () => Promise<never>;
      }
    ).getLatestBlockhash = () => Promise.reject(new Error("rpc down"));
    await expect(client.latestBlockhash()).rejects.toBeInstanceOf(RpcError);
  });

  it("submit failures are normalized to RpcError", async () => {
    const client = new PassportClient("localnet");
    const ownerKp = Keypair.generate();
    const agent = Keypair.generate().publicKey;
    const ix = await client.updateIx(ownerKp.publicKey, agent, null, [
      "calendar.read",
    ]);
    const tx = PassportClient.assemble(
      [ix],
      ownerKp.publicKey,
      fakeBlockhash(),
    );
    await new LocalOwnerSigner(ownerKp).signTransaction(tx);

    (
      client.connection as unknown as {
        sendRawTransaction: () => Promise<never>;
      }
    ).sendRawTransaction = () =>
      Promise.reject(new Error("blockhash not found"));
    await expect(client.submit(tx)).rejects.toBeInstanceOf(RpcError);
  });
});

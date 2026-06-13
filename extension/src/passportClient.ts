import { AnchorProvider, Program, type Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  derivePassportPda,
  getClusterConfig,
  validatePermissions,
  type Cluster,
} from "@agent-passport/sdk";
import { AGENT_PASSPORT_IDL, type AgentPassport } from "./idl";
import { OwnerError, RpcError } from "./errors";
import type { OwnerSigner } from "./ownerSigner";

// The Anchor Program needs a provider with *some* wallet, but we never sign
// through it — transactions are built unsigned and signed by an OwnerSigner
// (local keypair or Phantom). This placeholder wallet refuses to sign, which is
// correct: signing must go through the explicit owner path.
const READONLY_PUBKEY = new PublicKey("11111111111111111111111111111111");
function readonlyWallet(): Wallet {
  const refuse = (): Promise<never> =>
    Promise.reject(
      new Error("read-only provider cannot sign; use an OwnerSigner"),
    );
  return {
    publicKey: READONLY_PUBKEY,
    signTransaction: refuse,
    signAllTransactions: refuse,
  } as unknown as Wallet;
}

/**
 * Builds and submits passport-write transactions. It is deliberately
 * signer-agnostic: it constructs UNSIGNED transactions (authority + fee payer is
 * the owner wallet), an `OwnerSigner` adds the signature, and `submit` broadcasts
 * to the selected cluster. The agent key is never involved here — separation of
 * authority (owner) from identity (agent) is structural.
 *
 * The on-chain account layout is untouched; only the client-side signing path
 * changed (local keypair `.rpc()` → build → external sign → submit).
 */
export class PassportClient {
  private readonly program: Program<AgentPassport>;
  readonly programId: PublicKey;
  readonly connection: Connection;
  readonly cluster: Cluster;

  constructor(
    cluster: Cluster,
    opts: { rpcUrl?: string; programId?: string } = {},
  ) {
    const cfg = getClusterConfig(cluster, {
      ...(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}),
      ...(opts.programId ? { programId: opts.programId } : {}),
    });
    this.cluster = cluster;
    this.connection = new Connection(cfg.rpcUrl, "confirmed");
    const provider = new AnchorProvider(this.connection, readonlyWallet(), {
      commitment: "confirmed",
    });
    this.program = new Program<AgentPassport>(AGENT_PASSPORT_IDL, provider);
    this.programId = new PublicKey(cfg.programId);
  }

  passportPda(agent: PublicKey): PublicKey {
    return derivePassportPda(agent, this.programId)[0];
  }

  // ---- instruction builders (pure; no network, no signing) ----

  initializeIx(
    authority: PublicKey,
    agent: PublicKey,
    label: string,
    permissions: string[],
  ): Promise<TransactionInstruction> {
    requireValid(permissions);
    return this.program.methods
      .initializePassport(agent, label, permissions)
      .accountsPartial({ authority, passport: this.passportPda(agent) })
      .instruction();
  }

  updateIx(
    authority: PublicKey,
    agent: PublicKey,
    label: string | null,
    permissions: string[],
  ): Promise<TransactionInstruction> {
    requireValid(permissions);
    return this.program.methods
      .updatePermissions(label, permissions)
      .accountsPartial({ authority, passport: this.passportPda(agent) })
      .instruction();
  }

  revokeIx(
    authority: PublicKey,
    agent: PublicKey,
  ): Promise<TransactionInstruction> {
    return this.program.methods
      .closePassport()
      .accountsPartial({ authority, passport: this.passportPda(agent) })
      .instruction();
  }

  /** Assemble instructions into an unsigned transaction. Pure — inject blockhash. */
  static assemble(
    instructions: TransactionInstruction[],
    feePayer: PublicKey,
    recentBlockhash: string,
  ): Transaction {
    const tx = new Transaction();
    if (instructions.length > 0) tx.add(...instructions);
    tx.feePayer = feePayer;
    tx.recentBlockhash = recentBlockhash;
    return tx;
  }

  // ---- network steps (blockhash + submit), errors normalized to RpcError ----

  async latestBlockhash(): Promise<string> {
    try {
      return (await this.connection.getLatestBlockhash("confirmed")).blockhash;
    } catch (e) {
      throw new RpcError("failed to fetch a recent blockhash", e);
    }
  }

  async submit(signed: Transaction): Promise<string> {
    let sig: string;
    try {
      sig = await this.connection.sendRawTransaction(signed.serialize());
    } catch (e) {
      throw new RpcError("transaction submission failed", e);
    }
    try {
      await this.connection.confirmTransaction(sig, "confirmed");
    } catch (e) {
      throw new RpcError(`confirmation failed for ${sig}`, e);
    }
    return sig;
  }

  // ---- full build → sign → submit, owner-signed ----

  async initialize(
    owner: OwnerSigner,
    agent: PublicKey,
    label: string,
    permissions: string[],
  ): Promise<string> {
    const authority = owner.getPublicKey();
    const ix = await this.initializeIx(authority, agent, label, permissions);
    const tx = PassportClient.assemble(
      [ix],
      authority,
      await this.latestBlockhash(),
    );
    return owner.executeTransaction(tx, (signed) => this.submit(signed));
  }

  async update(
    owner: OwnerSigner,
    agent: PublicKey,
    label: string | null,
    permissions: string[],
  ): Promise<string> {
    const authority = owner.getPublicKey();
    const ix = await this.updateIx(authority, agent, label, permissions);
    const tx = PassportClient.assemble(
      [ix],
      authority,
      await this.latestBlockhash(),
    );
    return owner.executeTransaction(tx, (signed) => this.submit(signed));
  }

  async revoke(owner: OwnerSigner, agent: PublicKey): Promise<string> {
    const authority = owner.getPublicKey();
    const ix = await this.revokeIx(authority, agent);
    const tx = PassportClient.assemble(
      [ix],
      authority,
      await this.latestBlockhash(),
    );
    return owner.executeTransaction(tx, (signed) => this.submit(signed));
  }
}

function requireValid(permissions: string[]): void {
  const result = validatePermissions(permissions, { namespaceMode: "dynamic" });
  if (!result.ok) {
    throw new OwnerError(
      "invalid_permissions",
      `invalid permissions: ${result.errors.join("; ")}`,
    );
  }
}

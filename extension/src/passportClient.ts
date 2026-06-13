import { AnchorProvider, Program, type Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  derivePassportPda,
  getClusterConfig,
  validatePermissions,
  type Cluster,
} from "@agent-passport/sdk";
import { AGENT_PASSPORT_IDL, type AgentPassport } from "./idl";

/** Adapt a local Keypair to Anchor's wallet shape — no external wallet needed. */
function keypairWallet(kp: Keypair): Wallet {
  const signOne = <T extends Transaction | VersionedTransaction>(tx: T): T => {
    if (tx instanceof VersionedTransaction) tx.sign([kp]);
    else (tx as Transaction).partialSign(kp);
    return tx;
  };
  return {
    payer: kp,
    publicKey: kp.publicKey,
    signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) =>
      Promise.resolve(signOne(tx)),
    signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) =>
      Promise.resolve(txs.map(signOne)),
  } as Wallet;
}

/**
 * Owner-wallet-signed passport writes, signed and paid by a LOCAL keypair (the
 * dev / no-Phantom owner-wallet model). Still strictly separate from the agent
 * key — this is the authority; the agent key only signs action requests.
 */
export class PassportClient {
  private readonly program: Program<AgentPassport>;
  readonly programId: PublicKey;
  readonly connection: Connection;

  constructor(
    owner: Keypair,
    cluster: Cluster,
    opts: { rpcUrl?: string; programId?: string } = {},
  ) {
    const cfg = getClusterConfig(cluster, {
      ...(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}),
      ...(opts.programId ? { programId: opts.programId } : {}),
    });
    this.connection = new Connection(cfg.rpcUrl, "confirmed");
    const provider = new AnchorProvider(this.connection, keypairWallet(owner), {
      commitment: "confirmed",
    });
    this.program = new Program<AgentPassport>(AGENT_PASSPORT_IDL, provider);
    this.programId = new PublicKey(cfg.programId);
  }

  passportPda(agent: PublicKey): PublicKey {
    return derivePassportPda(agent, this.programId)[0];
  }

  private authority(): PublicKey {
    return this.program.provider.publicKey!;
  }

  async initialize(agent: PublicKey, label: string, permissions: string[]): Promise<string> {
    requireValid(permissions);
    return this.program.methods
      .initializePassport(agent, label, permissions)
      .accountsPartial({ authority: this.authority(), passport: this.passportPda(agent) })
      .rpc();
  }

  async update(agent: PublicKey, label: string | null, permissions: string[]): Promise<string> {
    requireValid(permissions);
    return this.program.methods
      .updatePermissions(label, permissions)
      .accountsPartial({ authority: this.authority(), passport: this.passportPda(agent) })
      .rpc();
  }

  async revoke(agent: PublicKey): Promise<string> {
    return this.program.methods
      .closePassport()
      .accountsPartial({ authority: this.authority(), passport: this.passportPda(agent) })
      .rpc();
  }
}

function requireValid(permissions: string[]): void {
  const result = validatePermissions(permissions);
  if (!result.ok) {
    throw new Error(`invalid permissions: ${result.errors.join("; ")}`);
  }
}

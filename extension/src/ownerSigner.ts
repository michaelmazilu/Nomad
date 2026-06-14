import { Transaction, type Keypair, type PublicKey } from "@solana/web3.js";
import type { Cluster } from "@agent-passport/sdk";
import { assertNetworkMatch, type PhantomBridge } from "./phantom";
import { OwnerError } from "./errors";
import type { SponsorClient } from "./sponsorClient";
import type { WalletProviderKind } from "./messages";

/**
 * An owner wallet that can sign (but NOT necessarily send) passport-write
 * transactions. This is the authority half of the protocol; it is strictly
 * separate from the agent identity key, which only ever signs action requests.
 *
 * `signTransaction` is sign-only by contract — submission is the caller's job —
 * so a Phantom signer never needs Phantom to broadcast (which lets localnet work
 * even though Phantom can't reach a local validator).
 */
export interface OwnerSigner {
  readonly kind: "local" | "phantom" | "embedded";
  /** The authority public key written into / checked against the passport. */
  getPublicKey(): PublicKey;
  /**
   * Who pays the rent + transaction fees (the transaction fee payer). Equals the
   * authority for self-paying owners (local/Phantom); for a sponsored owner it is
   * the sponsor's key, so the authority can hold zero SOL.
   */
  getFeePayer(): PublicKey;
  /** Add this owner's signature to an already-built transaction. */
  signTransaction(tx: Transaction): Promise<Transaction>;
  /** Execute a fully assembled transaction and return its chain signature. */
  executeTransaction(
    tx: Transaction,
    submit: (signed: Transaction) => Promise<string>,
  ): Promise<string>;
}

/**
 * DEVELOPMENT-ONLY owner: a local in-extension keypair. Convenient for localnet
 * and CI, but the private key lives in extension storage — never use it to hold
 * real funds. Phantom is the real owner-wallet path.
 */
export class LocalOwnerSigner implements OwnerSigner {
  readonly kind = "local";
  constructor(private readonly keypair: Keypair) {}

  getPublicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  getFeePayer(): PublicKey {
    return this.keypair.publicKey;
  }

  async signTransaction(tx: Transaction): Promise<Transaction> {
    tx.partialSign(this.keypair);
    return tx;
  }

  async executeTransaction(
    tx: Transaction,
    submit: (signed: Transaction) => Promise<string>,
  ): Promise<string> {
    return submit(await this.signTransaction(tx));
  }
}

/**
 * Embedded + sponsored owner: an in-app keypair is the authority, but a backend
 * sponsor pays the rent/fees. The owner key signs locally (no wallet app, no
 * prompt, no SOL), then the partially-signed transaction is relayed to the
 * sponsor, which co-signs as fee payer and submits. The sponsor never sees the
 * authority key — it only adds a fee-payer signature to a validated transaction.
 */
export class SponsoredOwnerSigner implements OwnerSigner {
  readonly kind = "embedded";

  constructor(
    private readonly keypair: Keypair,
    private readonly sponsor: SponsorClient,
    private readonly feePayer: PublicKey,
  ) {}

  getPublicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  getFeePayer(): PublicKey {
    return this.feePayer;
  }

  async signTransaction(tx: Transaction): Promise<Transaction> {
    tx.partialSign(this.keypair);
    return tx;
  }

  /** Sign as authority, then relay to the sponsor (which pays + submits). */
  async executeTransaction(
    tx: Transaction,
    _submit: (signed: Transaction) => Promise<string>,
  ): Promise<string> {
    return this.sponsor.sponsor(await this.signTransaction(tx));
  }
}

/**
 * Phantom owner: delegates signing to Phantom via the connector bridge. The
 * private key never leaves Phantom — we hand over an unsigned transaction and
 * get signed bytes back. The connected public key is captured at connect time.
 */
export class PhantomOwnerSigner implements OwnerSigner {
  readonly kind = "phantom";

  constructor(
    private readonly bridge: PhantomBridge,
    private readonly publicKey: PublicKey,
    private readonly cluster: Cluster,
    private readonly walletCluster: Cluster | null = null,
    private readonly providerKind: WalletProviderKind = "injected",
  ) {}

  getPublicKey(): PublicKey {
    return this.publicKey;
  }

  getFeePayer(): PublicKey {
    return this.publicKey;
  }

  async signTransaction(tx: Transaction): Promise<Transaction> {
    if (this.providerKind === "embedded") {
      throw new OwnerError(
        "wallet_rejected",
        "Embedded Phantom wallets submit transactions directly; sign-only is unavailable.",
      );
    }
    // Fail before prompting Phantom if the wallet is on a different network.
    assertNetworkMatch(this.cluster, this.walletCluster);
    const unsigned = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const signedB64 = await this.bridge.signTransaction(
      toBase64(unsigned),
      this.cluster,
    );
    return Transaction.from(fromBase64(signedB64));
  }

  async executeTransaction(
    tx: Transaction,
    submit: (signed: Transaction) => Promise<string>,
  ): Promise<string> {
    if (this.providerKind !== "embedded") {
      return submit(await this.signTransaction(tx));
    }
    if (this.cluster === "localnet") {
      throw new OwnerError(
        "wallet_rejected",
        "Embedded Phantom wallets cannot submit localnet transactions; switch to devnet or mainnet-beta.",
      );
    }
    assertNetworkMatch(this.cluster, this.walletCluster);
    const unsigned = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    return this.bridge.signAndSendTransaction(toBase64(unsigned), this.cluster);
  }
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

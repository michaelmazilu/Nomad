import { Transaction, type Keypair, type PublicKey } from "@solana/web3.js";
import type { Cluster } from "@agent-passport/sdk";
import { assertNetworkMatch, type PhantomBridge } from "./phantom";

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
  readonly kind: "local" | "phantom";
  /** The authority public key written into / checked against the passport. */
  getPublicKey(): PublicKey;
  /** Add this owner's signature to an already-built transaction. */
  signTransaction(tx: Transaction): Promise<Transaction>;
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

  async signTransaction(tx: Transaction): Promise<Transaction> {
    tx.partialSign(this.keypair);
    return tx;
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
  ) {}

  getPublicKey(): PublicKey {
    return this.publicKey;
  }

  async signTransaction(tx: Transaction): Promise<Transaction> {
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
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

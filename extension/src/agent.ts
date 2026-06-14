import { Keypair } from "@solana/web3.js";
import {
  encodeActionMessage,
  sign,
  toBase58,
  type ActionRequest,
  type SignedAction,
} from "@agent-passport/sdk";
import type { KeyStore } from "./keystore";

/**
 * Owns the agent identity key. The agent key signs ONLY runtime action requests
 * — never passport writes (those are owner-wallet-signed). This separation is
 * enforced by keeping all owner-wallet logic out of this class.
 */
export class AgentKeyManager {
  constructor(private readonly store: KeyStore) {}

  hasKey(): Promise<boolean> {
    return this.store.has(); 
  }

  /** Create an agent identity if none exists; returns the agent public key (Base58). */
  async getOrCreate(): Promise<string> {
    const existing = await this.store.load();
    if (existing) return Keypair.fromSecretKey(existing).publicKey.toBase58();
    const kp = Keypair.generate();
    await this.store.save(kp.secretKey); // the 64-byte secret key
    return kp.publicKey.toBase58();
  }

  async getPublicKey(): Promise<string | null> {
    const sk = await this.store.load();
    return sk ? Keypair.fromSecretKey(sk).publicKey.toBase58() : null;
  }

  /** Sign a runtime action request with the agent key (the only thing it signs). */
  async signAction(request: ActionRequest): Promise<SignedAction> {
    const sk = await this.store.load();
    if (!sk) throw new Error("no agent key: create an identity first");
    const kp = Keypair.fromSecretKey(sk);
    const message = encodeActionMessage(kp.publicKey.toBytes(), request);
    return {
      agentPublicKey: kp.publicKey.toBase58(),
      signature: toBase58(sign(message, sk)),
      request,
    };
  }

  /** Sign arbitrary UTF-8 text with the agent key and return base58 result. */
  async signMessage(message: string): Promise<{ agentPublicKey: string; signature: string }> {
    const sk = await this.store.load();
    if (!sk) throw new Error("no agent key: create an identity first");
    const kp = Keypair.fromSecretKey(sk);
    const bytes = new TextEncoder().encode(message);
    return {
      agentPublicKey: kp.publicKey.toBase58(),
      signature: toBase58(sign(bytes, sk)),
    };
  }

  async deleteKey(): Promise<void> {
    await this.store.clear();
  }
}

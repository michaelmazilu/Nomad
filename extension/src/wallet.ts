import { Keypair } from "@solana/web3.js";
import type { KeyStore } from "./keystore";

/**
 * The owner wallet (authority) — a LOCAL keypair managed by the extension, used
 * to sign and pay for passport writes. This is the no-Phantom / dev owner-wallet
 * model. It is a distinct key from the agent identity; the agent key never signs
 * writes and this key never signs action requests.
 */
export class OwnerWallet {
  constructor(private readonly store: KeyStore) {}

  async getOrCreate(): Promise<string> {
    const sk = await this.store.load();
    if (sk) return Keypair.fromSecretKey(sk).publicKey.toBase58();
    const kp = Keypair.generate();
    await this.store.save(kp.secretKey);
    return kp.publicKey.toBase58();
  }

  async getPublicKey(): Promise<string | null> {
    const sk = await this.store.load();
    return sk ? Keypair.fromSecretKey(sk).publicKey.toBase58() : null;
  }

  async keypair(): Promise<Keypair> {
    const sk = await this.store.load();
    if (!sk) throw new Error("no owner key: create one first");
    return Keypair.fromSecretKey(sk);
  }
}

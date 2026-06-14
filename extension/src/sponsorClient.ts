import { Buffer } from "buffer";
import { PublicKey, type Transaction } from "@solana/web3.js";
import { RpcError } from "./errors";

/**
 * Client half of the sponsored-write relay. The embedded owner key signs a
 * passport-write transaction locally (it is the authority), then hands the
 * partially-signed bytes to the sponsor backend, which co-signs as the fee
 * payer, pays the rent/fees, and submits. The owner key thus needs no SOL, and
 * the sponsor never sees or holds the authority key — it only adds a fee-payer
 * signature to a transaction whose shape it validates.
 */
export class SponsorClient {
  private feePayerPk: PublicKey | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly authToken?: string,
  ) {}

  /** The sponsor's fee-payer pubkey (cached). Must be the transaction fee payer. */
  async feePayer(): Promise<PublicKey> {
    if (this.feePayerPk) return this.feePayerPk;
    let body: { feePayer?: string };
    try {
      const res = await fetch(new URL("health", this.baseUrl).toString());
      if (!res.ok) throw new Error(`sponsor health returned ${res.status}`);
      body = (await res.json()) as { feePayer?: string };
    } catch (e) {
      throw new RpcError(
        `could not reach the sponsor service: ${e instanceof Error ? e.message : String(e)}`,
        e,
      );
    }
    if (!body.feePayer) {
      throw new RpcError("sponsor reported no fee payer");
    }
    this.feePayerPk = new PublicKey(body.feePayer);
    return this.feePayerPk;
  }

  /** Relay a partially-signed transaction; returns the on-chain signature. */
  async sponsor(signed: Transaction): Promise<string> {
    const txBase64 = Buffer.from(
      signed.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }),
    ).toString("base64");
    let res: Response;
    try {
      res = await fetch(new URL("sponsor", this.baseUrl).toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.authToken
            ? { authorization: `Bearer ${this.authToken}` }
            : {}),
        },
        body: JSON.stringify({ txBase64 }),
      });
    } catch (e) {
      throw new RpcError(
        `sponsor request failed: ${e instanceof Error ? e.message : String(e)}`,
        e,
      );
    }
    const body = (await res.json().catch(() => ({}))) as {
      signature?: string;
      error?: string;
    };
    if (!res.ok || !body.signature) {
      throw new RpcError(
        body.error ?? `sponsor rejected the transaction (${res.status})`,
      );
    }
    return body.signature;
  }
}

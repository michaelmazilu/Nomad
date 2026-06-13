import { encodeBase58 } from "./base58";
import { ACCOUNT_DISCRIMINATOR_LENGTH } from "./constants";
import type { Passport } from "./types";

const textDecoder = new TextDecoder("utf-8", { fatal: false });

/** Minimal Borsh reader for the passport layout. Bounds-checked; throws on malformed data. */
class BorshReader {
  private off = 0;
  private readonly view: DataView;

  constructor(private readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  private ensure(n: number): void {
    if (this.off + n > this.data.length) {
      throw new Error(
        `passport decode out of bounds: need ${n} at offset ${this.off}, length ${this.data.length}`,
      );
    }
  }

  skip(n: number): void {
    this.ensure(n);
    this.off += n;
  }

  u8(): number {
    this.ensure(1);
    return this.view.getUint8(this.off++);
  }

  u32(): number {
    this.ensure(4);
    const v = this.view.getUint32(this.off, true);
    this.off += 4;
    return v;
  }

  i64(): number {
    this.ensure(8);
    const v = this.view.getBigInt64(this.off, true);
    this.off += 8;
    return Number(v); // Unix seconds — well within safe-integer range
  }

  pubkey(): string {
    this.ensure(32);
    const slice = this.data.subarray(this.off, this.off + 32);
    this.off += 32;
    return encodeBase58(slice);
  }

  string(): string {
    const len = this.u32();
    this.ensure(len);
    const slice = this.data.subarray(this.off, this.off + len);
    this.off += len;
    return textDecoder.decode(slice);
  }

  vecString(): string[] {
    const count = this.u32();
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(this.string());
    return out;
  }
}

/**
 * Decode the Borsh-encoded passport account. Mirrors the program field order
 * exactly: skip the 8-byte Anchor discriminator, then
 * `u8, u8, pubkey, pubkey, String, Vec<String>, i64, i64`. The discriminator
 * value is Anchor-version-dependent, so we skip rather than recompute it — the
 * devnet integration test is the definitive cross-check. Throws on malformed
 * data; the verifier treats a throw as fail-closed.
 */
export function decodePassport(data: Uint8Array): Passport {
  const r = new BorshReader(data);
  r.skip(ACCOUNT_DISCRIMINATOR_LENGTH);
  const version = r.u8();
  const bump = r.u8();
  const authority = r.pubkey();
  const agent = r.pubkey();
  const label = r.string();
  const permissions = r.vecString();
  const createdAt = r.i64();
  const updatedAt = r.i64();
  return {
    version,
    bump,
    authority,
    agent,
    label,
    permissions,
    createdAt,
    updatedAt,
  };
}

import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { sign, verify, toBase58, fromBase58, tryFromBase58 } from "../src/crypto";
import { encodeActionMessage } from "../src/message";
import { SECRET_KEY_LENGTH, SIGNATURE_LENGTH } from "../src/constants";

describe("crypto sign/verify", () => {
  it("Solana keypair secretKey is 64 bytes (the form the signer needs)", () => {
    const kp = Keypair.generate();
    expect(kp.secretKey.length).toBe(SECRET_KEY_LENGTH);
    expect(kp.publicKey.toBytes().length).toBe(32);
  });

  it("signs and verifies an action message (fixed 64-byte signature)", () => {
    const kp = Keypair.generate();
    const msg = encodeActionMessage(kp.publicKey.toBytes(), {
      action: "calendar.read",
      timestamp: 1_700_000_000_000,
    });
    const sig = sign(msg, kp.secretKey);
    expect(sig.length).toBe(SIGNATURE_LENGTH);
    expect(verify(msg, sig, kp.publicKey.toBytes())).toBe(true);
  });

  it("signature length is independent of message length", () => {
    const kp = Keypair.generate();
    const short = sign(new Uint8Array(1), kp.secretKey);
    const long = sign(new Uint8Array(10_000).fill(9), kp.secretKey);
    expect(short.length).toBe(64);
    expect(long.length).toBe(64);
  });

  it("rejects a tampered message, signature, or wrong key", () => {
    const kp = Keypair.generate();
    const msg = encodeActionMessage(kp.publicKey.toBytes(), {
      action: "calendar.read",
      timestamp: 1,
    });
    const sig = sign(msg, kp.secretKey);

    const tamperedMsg = Uint8Array.from(msg);
    tamperedMsg[tamperedMsg.length - 1] ^= 0xff;
    expect(verify(tamperedMsg, sig, kp.publicKey.toBytes())).toBe(false);

    const tamperedSig = Uint8Array.from(sig);
    tamperedSig[0] ^= 0xff;
    expect(verify(msg, tamperedSig, kp.publicKey.toBytes())).toBe(false);

    const other = Keypair.generate();
    expect(verify(msg, sig, other.publicKey.toBytes())).toBe(false);
  });

  it("throws when given the 32-byte seed instead of the 64-byte secret key", () => {
    const kp = Keypair.generate();
    const seedOnly = kp.secretKey.slice(0, 32);
    expect(() => sign(new Uint8Array(4), seedOnly)).toThrow();
  });

  it("verify returns false (never throws) on malformed inputs", () => {
    const kp = Keypair.generate();
    expect(verify(new Uint8Array(4), new Uint8Array(10), kp.publicKey.toBytes())).toBe(false);
    expect(verify(new Uint8Array(4), new Uint8Array(64), new Uint8Array(31))).toBe(false);
  });

  it("base58 round-trips and tryFromBase58 is null-safe", () => {
    const bytes = Keypair.generate().publicKey.toBytes();
    expect(Array.from(fromBase58(toBase58(bytes)))).toEqual(Array.from(bytes));
    expect(tryFromBase58("not valid base58 !!! 0OIl")).toBeNull();
  });
});

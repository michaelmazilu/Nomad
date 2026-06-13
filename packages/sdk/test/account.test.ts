import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { decodePassport } from "../src/account";
import { ACCOUNT_DISCRIMINATOR_LENGTH } from "../src/constants";

const te = new TextEncoder();

function strBytes(s: string): Uint8Array {
  const b = te.encode(s);
  const out = new Uint8Array(4 + b.length);
  new DataView(out.buffer).setUint32(0, b.length, true);
  out.set(b, 4);
  return out;
}
function i64Bytes(n: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, BigInt(n), true);
  return out;
}
function u32Bytes(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, true);
  return out;
}
function concat(arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/** Reference Borsh encoder matching the program's Passport layout exactly. */
function encodePassportAccount(p: {
  version: number;
  bump: number;
  authority: Uint8Array;
  agent: Uint8Array;
  label: string;
  permissions: string[];
  createdAt: number;
  updatedAt: number;
}): Uint8Array {
  const chunks: Uint8Array[] = [
    new Uint8Array(ACCOUNT_DISCRIMINATOR_LENGTH).fill(0xab), // arbitrary discriminator
    Uint8Array.of(p.version),
    Uint8Array.of(p.bump),
    p.authority,
    p.agent,
    strBytes(p.label),
    u32Bytes(p.permissions.length),
    ...p.permissions.map(strBytes),
    i64Bytes(p.createdAt),
    i64Bytes(p.updatedAt),
  ];
  return concat(chunks);
}

describe("decodePassport", () => {
  it("round-trips a fully populated account, skipping the discriminator", () => {
    const authority = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const input = {
      version: 1,
      bump: 254,
      authority: authority.toBytes(),
      agent: agent.toBytes(),
      label: "My Calendar Agent",
      permissions: ["calendar.read", "calendar.*", "api:example.com"],
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_500,
    };
    const decoded = decodePassport(encodePassportAccount(input));
    expect(decoded.version).toBe(1);
    expect(decoded.bump).toBe(254);
    expect(decoded.authority).toBe(authority.toBase58());
    expect(decoded.agent).toBe(agent.toBase58());
    expect(decoded.label).toBe("My Calendar Agent");
    expect(decoded.permissions).toEqual([
      "calendar.read",
      "calendar.*",
      "api:example.com",
    ]);
    expect(decoded.createdAt).toBe(1_700_000_000);
    expect(decoded.updatedAt).toBe(1_700_000_500);
  });

  it("handles an empty permission set and empty label", () => {
    const kp = Keypair.generate();
    const decoded = decodePassport(
      encodePassportAccount({
        version: 1,
        bump: 1,
        authority: kp.publicKey.toBytes(),
        agent: kp.publicKey.toBytes(),
        label: "",
        permissions: [],
        createdAt: 0,
        updatedAt: 0,
      }),
    );
    expect(decoded.label).toBe("");
    expect(decoded.permissions).toEqual([]);
  });

  it("throws on truncated data (fail-closed signal)", () => {
    const kp = Keypair.generate();
    const full = encodePassportAccount({
      version: 1,
      bump: 1,
      authority: kp.publicKey.toBytes(),
      agent: kp.publicKey.toBytes(),
      label: "x",
      permissions: [],
      createdAt: 0,
      updatedAt: 0,
    });
    expect(() => decodePassport(full.subarray(0, 20))).toThrow();
    expect(() => decodePassport(new Uint8Array(4))).toThrow();
  });
});

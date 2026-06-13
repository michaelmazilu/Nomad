import { describe, it, expect } from "vitest";
import { encodeActionMessage, compareUtf8 } from "../src/message";
import { ACTION_DOMAIN_TAG, MESSAGE_SCHEMA_VERSION } from "../src/constants";
import type { ActionRequest } from "../src/types";

const enc = new TextEncoder();

/** Independent minimal reader to round-trip the canonical layout in tests. */
function decodeMessage(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  const u32 = () => {
    const v = view.getUint32(off, true);
    off += 4;
    return v;
  };
  const u64 = () => {
    const v = view.getBigUint64(off, true);
    off += 8;
    return v;
  };
  const u8 = () => bytes[off++]!;
  const str = () => {
    const len = u32();
    const s = new TextDecoder().decode(bytes.subarray(off, off + len));
    off += len;
    return s;
  };
  const tag = str();
  const schema = u8();
  const agent = bytes.subarray(off, off + 32);
  off += 32;
  const timestamp = Number(u64());
  const action = str();
  const resource = str();
  const count = u32();
  const params: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const k = str();
    params[k] = str();
  }
  return { tag, schema, agent, timestamp, action, resource, params, end: off };
}

const AGENT = new Uint8Array(32).fill(7);

describe("encodeActionMessage", () => {
  it("produces the exact byte layout for the trivial zero case (golden vector)", () => {
    const req: ActionRequest = { action: "", timestamp: 0 };
    const bytes = encodeActionMessage(new Uint8Array(32), req);
    // 4 (taglen) + 25 (tag) + 1 (schema) + 32 (pubkey) + 8 (ts) + 4 (action) + 4 (resource) + 4 (params)
    expect(bytes.length).toBe(82);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([25, 0, 0, 0]);
    expect(new TextDecoder().decode(bytes.subarray(4, 29))).toBe(
      "agent-passport:v1:request",
    );
    expect(bytes[29]).toBe(MESSAGE_SCHEMA_VERSION);
    expect(Array.from(bytes.subarray(30, 62))).toEqual(Array(32).fill(0));
    expect(Array.from(bytes.subarray(62, 70))).toEqual(Array(8).fill(0)); // ts
    expect(Array.from(bytes.subarray(70))).toEqual(Array(12).fill(0)); // action/resource/params lens
  });

  it("round-trips through an independent decoder", () => {
    const req: ActionRequest = {
      action: "calendar.read",
      resource: "primary",
      params: { scope: "today", tz: "UTC" },
      timestamp: 1_700_000_000_123,
    };
    const got = decodeMessage(encodeActionMessage(AGENT, req));
    expect(got.tag).toBe(ACTION_DOMAIN_TAG);
    expect(got.schema).toBe(MESSAGE_SCHEMA_VERSION);
    expect(Array.from(got.agent)).toEqual(Array.from(AGENT));
    expect(got.timestamp).toBe(req.timestamp);
    expect(got.action).toBe("calendar.read");
    expect(got.resource).toBe("primary");
    expect(got.params).toEqual({ scope: "today", tz: "UTC" });
    expect(got.end).toBe(encodeActionMessage(AGENT, req).length);
  });

  it("is deterministic regardless of param insertion order", () => {
    const a: ActionRequest = {
      action: "x",
      timestamp: 5,
      params: { a: "1", b: "2", c: "3" },
    };
    const b: ActionRequest = {
      action: "x",
      timestamp: 5,
      params: { c: "3", a: "1", b: "2" },
    };
    expect(encodeActionMessage(AGENT, a)).toEqual(encodeActionMessage(AGENT, b));
  });

  it("sorts param keys by UTF-8 bytes, not locale (uppercase before lowercase)", () => {
    // Byte order: 'Z' (0x5A) < 'a' (0x61) < 'b' (0x62)
    expect(compareUtf8("Z", "a")).toBeLessThan(0);
    expect(compareUtf8("a", "b")).toBeLessThan(0);
    const req: ActionRequest = {
      action: "x",
      timestamp: 0,
      params: { b: "1", a: "2", Z: "3" },
    };
    const decoded = decodeMessage(encodeActionMessage(AGENT, req));
    expect(Object.keys(decoded.params)).toEqual(["Z", "a", "b"]);
  });

  it("omitted resource encodes identically to empty string", () => {
    const without: ActionRequest = { action: "x", timestamp: 1 };
    const withEmpty: ActionRequest = { action: "x", resource: "", timestamp: 1 };
    expect(encodeActionMessage(AGENT, without)).toEqual(
      encodeActionMessage(AGENT, withEmpty),
    );
  });

  it("rejects a wrong-length agent public key", () => {
    expect(() =>
      encodeActionMessage(new Uint8Array(31), { action: "x", timestamp: 0 }),
    ).toThrow();
  });

  it("rejects non-integer / negative timestamps", () => {
    expect(() =>
      encodeActionMessage(AGENT, { action: "x", timestamp: 1.5 }),
    ).toThrow();
    expect(() =>
      encodeActionMessage(AGENT, { action: "x", timestamp: -1 }),
    ).toThrow();
  });
});

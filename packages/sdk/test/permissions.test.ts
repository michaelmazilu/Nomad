import { describe, it, expect } from "vitest";
import {
  validateScope,
  validatePermissions,
  permits,
  isWildcardScope,
} from "../src/permissions";

describe("validateScope", () => {
  const valid = [
    "calendar.read",
    "calendar.events.list",
    "mail.send",
    "files.read",
    "api:example.com",
    "api:example.com/path",
    "mcp:my-server",
    "calendar.*",
    "calendar.events.*",
    "system.admin",
  ];
  for (const s of valid) {
    it(`accepts "${s}"`, () => expect(validateScope(s)).toBe(true));
  }

  const invalid = [
    ["", "empty"],
    ["calendar", "bare namespace, no separator"],
    ["unknown.read", "namespace not in allowlist"],
    ["Calendar.read", "uppercase"],
    ["calendar.re ad", "whitespace"],
    ["cal*.read", "star not trailing"],
    ["calendar.*.x", "wildcard not trailing"],
    ["calendar.read*", "bare trailing star without dot"],
    ["*", "lone star"],
    [".read", "empty namespace"],
    ["calendar.", "empty rest"],
    [`calendar.${"x".repeat(64)}`, "exceeds 64 bytes"],
  ] as const;
  for (const [s, why] of invalid) {
    it(`rejects "${s}" (${why})`, () => expect(validateScope(s)).toBe(false));
  }

  it("honors a custom namespace allowlist", () => {
    expect(validateScope("widget.read", { knownNamespaces: ["widget"] })).toBe(
      true,
    );
    expect(validateScope("calendar.read", { knownNamespaces: ["widget"] })).toBe(
      false,
    );
  });

  it("isWildcardScope detects trailing .*", () => {
    expect(isWildcardScope("calendar.*")).toBe(true);
    expect(isWildcardScope("calendar.read")).toBe(false);
  });
});

describe("validatePermissions", () => {
  it("accepts a clean set", () => {
    const r = validatePermissions(["calendar.read", "mail.send"]);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it("flags duplicates", () => {
    const r = validatePermissions(["calendar.read", "calendar.read"]);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });
  it("flags too many scopes", () => {
    const many = Array.from({ length: 33 }, (_, i) => `calendar.s${i}`);
    const r = validatePermissions(many);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("too many"))).toBe(true);
  });
  it("flags invalid scopes", () => {
    const r = validatePermissions(["calendar.read", "BAD"]);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("invalid scope: BAD"))).toBe(true);
  });
});

describe("permits matcher", () => {
  it("exact match", () => {
    expect(permits(["calendar.read"], "calendar.read")).toBe(true);
    expect(permits(["calendar.read"], "calendar.write")).toBe(false);
  });
  it("trailing wildcard matches by prefix", () => {
    expect(permits(["calendar.*"], "calendar.read")).toBe(true);
    expect(permits(["calendar.*"], "calendar.events.list")).toBe(true);
    expect(permits(["calendar.events.*"], "calendar.events.list")).toBe(true);
  });
  it("wildcard does not cross namespaces or match the bare namespace", () => {
    expect(permits(["calendar.*"], "mail.read")).toBe(false);
    expect(permits(["calendar.*"], "calendar")).toBe(false);
    expect(permits(["calendar.events.*"], "calendar.read")).toBe(false);
  });
  it("empty grants permit nothing", () => {
    expect(permits([], "calendar.read")).toBe(false);
  });
  it("is total/safe even with a malformed stored scope", () => {
    expect(permits(["", "***", "calendar.read"], "calendar.read")).toBe(true);
    expect(() => permits(["***"], "anything")).not.toThrow();
  });
});

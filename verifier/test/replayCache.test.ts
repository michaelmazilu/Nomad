import { describe, it, expect } from "vitest";
import { InMemoryReplayCache } from "../src/replayCache";

describe("InMemoryReplayCache", () => {
  it("is empty before add, present after, within TTL", () => {
    const t = 1000;
    const c = new InMemoryReplayCache(() => t);
    expect(c.has("sig")).toBe(false);
    c.add("sig", 500);
    expect(c.has("sig")).toBe(true);
  });

  it("expires at/after the TTL boundary", () => {
    let t = 1000;
    const c = new InMemoryReplayCache(() => t);
    c.add("sig", 500); // expiry = 1500
    t = 1500;
    expect(c.has("sig")).toBe(false);
  });

  it("evicts expired entries lazily on has()", () => {
    let t = 0;
    const c = new InMemoryReplayCache(() => t);
    c.add("a", 100);
    expect(c.size).toBe(1);
    t = 200;
    expect(c.has("a")).toBe(false);
    expect(c.size).toBe(0);
  });

  it("distinct signatures are tracked independently", () => {
    const t = 0;
    const c = new InMemoryReplayCache(() => t);
    c.add("a", 100);
    expect(c.has("a")).toBe(true);
    expect(c.has("b")).toBe(false);
  });
});

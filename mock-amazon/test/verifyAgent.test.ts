import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyAgent } from "../lib/verifyAgent";

// The one Agent ID the demo approves (mirrors DEMO_AGENT_ID in lib/verifyAgent.ts).
const DEMO_AGENT_ID = "Fxo8xDJaaAtKYef5CgpuvfSYijrDDeYHX5pbbUdm4gte";
const OTHER_AGENT_ID = "2cUASaguALsZffvL4sgzaU4YsH5o4Yn9NWYRSKizKWJx";

function mockFetchJson(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => body })),
  );
}

function mockFetchThrows() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network down");
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("verifyAgent — only the demo Agent ID is approved", () => {
  it("approves the demo Agent ID when it verifies on-chain", async () => {
    mockFetchJson({ status: "ok", ok: true, label: "Shopping Agent" });
    const d = await verifyAgent(DEMO_AGENT_ID);
    expect(d.decision).toBe("approved");
    if (d.decision === "approved") expect(d.label).toBe("Shopping Agent");
  });

  it("rejects any other ID even when it verifies ok on-chain", async () => {
    mockFetchJson({ status: "ok", ok: true, label: "Some Other Agent" });
    const d = await verifyAgent(OTHER_AGENT_ID);
    expect(d).toMatchObject({
      decision: "fraudulent",
      reason: "agent_not_authorized",
    });
  });

  it("rejects a non-demo ID with the real reason (no_passport)", async () => {
    mockFetchJson({ status: "no_passport", ok: false });
    const d = await verifyAgent(OTHER_AGENT_ID);
    expect(d).toMatchObject({
      decision: "fraudulent",
      reason: "agent_not_authorized",
    });
  });

  it("rejects a non-demo ID lacking the purchase scope (not_permitted)", async () => {
    mockFetchJson({ status: "not_permitted", ok: false });
    const d = await verifyAgent(OTHER_AGENT_ID);
    expect(d).toMatchObject({
      decision: "fraudulent",
      reason: "action_not_permitted",
    });
  });

  it("fails closed for a non-demo ID on a network error", async () => {
    mockFetchThrows();
    const d = await verifyAgent(OTHER_AGENT_ID);
    expect(d).toMatchObject({
      decision: "fraudulent",
      reason: "verifier_unavailable",
    });
  });

  it("empty input is rejected without a network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const d = await verifyAgent("   ");
    expect(d).toMatchObject({
      decision: "fraudulent",
      reason: "empty_agent_id",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

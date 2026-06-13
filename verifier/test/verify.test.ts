import { describe, it, expect } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  encodeActionMessage,
  sign,
  toBase58,
  AGENT_PASSPORT_PROGRAM_ID,
  type ActionRequest,
  type Passport,
} from "@agent-passport/sdk";
import { verify, type VerifierConfig } from "../src/verify";
import { InMemoryReplayCache, type ReplayCache } from "../src/replayCache";
import { createVerifier, DEFAULT_SKEW_MS } from "../src/index";
import type { PassportReader } from "../src/passportReader";
import type { VerifyInput } from "../src/types";

const NOW = 1_700_000_000_000;
const programId = new PublicKey(AGENT_PASSPORT_PROGRAM_ID);

function passportFor(agentBase58: string, permissions: string[]): Passport {
  return {
    version: 1,
    bump: 255,
    authority: Keypair.generate().publicKey.toBase58(),
    agent: agentBase58,
    label: "test",
    permissions,
    createdAt: 1,
    updatedAt: 1,
  };
}

function fakeReader(behavior: {
  passport?: Passport | null;
  throws?: boolean;
}): PassportReader {
  return {
    async get() {
      if (behavior.throws) throw new Error("rpc down");
      return behavior.passport ?? null;
    },
  };
}

function makeConfig(
  reader: PassportReader,
  overrides: Partial<VerifierConfig> = {},
): VerifierConfig {
  return {
    programId,
    skewMs: 60_000,
    reader,
    replayCache: new InMemoryReplayCache(() => NOW),
    now: () => NOW,
    ...overrides,
  };
}

function signedInput(kp: Keypair, request: ActionRequest): VerifyInput {
  const msg = encodeActionMessage(kp.publicKey.toBytes(), request);
  return {
    agentPublicKey: kp.publicKey.toBase58(),
    signature: toBase58(sign(msg, kp.secretKey)),
    request,
  };
}

describe("verify pipeline — one case per outcome", () => {
  it("ok: valid signature, fresh, passport permits", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, { action: "calendar.read", timestamp: NOW });
    const config = makeConfig(
      fakeReader({
        passport: passportFor(kp.publicKey.toBase58(), ["calendar.read"]),
      }),
    );
    const r = await verify(input, config);
    expect(r.status).toBe("ok");
    expect(r.ok).toBe(true);
    expect(r.passport?.permissions).toContain("calendar.read");
  });

  it("ok: granted via trailing wildcard", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, {
      action: "calendar.events.list",
      timestamp: NOW,
    });
    const config = makeConfig(
      fakeReader({
        passport: passportFor(kp.publicKey.toBase58(), ["calendar.*"]),
      }),
    );
    expect((await verify(input, config)).status).toBe("ok");
  });

  it("not_permitted: action not in scopes", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, { action: "mail.send", timestamp: NOW });
    const config = makeConfig(
      fakeReader({
        passport: passportFor(kp.publicKey.toBase58(), ["calendar.read"]),
      }),
    );
    const r = await verify(input, config);
    expect(r.status).toBe("not_permitted");
    expect(r.passport).toBeDefined();
  });

  it("no_passport: reader returns null (unregistered or revoked)", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, { action: "calendar.read", timestamp: NOW });
    const config = makeConfig(fakeReader({ passport: null }));
    expect((await verify(input, config)).status).toBe("no_passport");
  });

  it("stale_or_future: timestamp older than the window", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, {
      action: "calendar.read",
      timestamp: NOW - 61_000,
    });
    const config = makeConfig(
      fakeReader({
        passport: passportFor(kp.publicKey.toBase58(), ["calendar.read"]),
      }),
    );
    expect((await verify(input, config)).status).toBe("stale_or_future");
  });

  it("stale_or_future: future-dated beyond the window", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, {
      action: "calendar.read",
      timestamp: NOW + 61_000,
    });
    const config = makeConfig(
      fakeReader({
        passport: passportFor(kp.publicKey.toBase58(), ["calendar.read"]),
      }),
    );
    expect((await verify(input, config)).status).toBe("stale_or_future");
  });

  it("bad_signature: tampered signature bytes", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, { action: "calendar.read", timestamp: NOW });
    input.signature = toBase58(Uint8Array.from({ length: 64 }, () => 1));
    const config = makeConfig(
      fakeReader({
        passport: passportFor(kp.publicKey.toBase58(), ["calendar.read"]),
      }),
    );
    expect((await verify(input, config)).status).toBe("bad_signature");
  });

  it("bad_signature: request mutated after signing", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, { action: "calendar.read", timestamp: NOW });
    input.request = { ...input.request, action: "calendar.write" };
    const config = makeConfig(
      fakeReader({
        passport: passportFor(kp.publicKey.toBase58(), [
          "calendar.read",
          "calendar.write",
        ]),
      }),
    );
    expect((await verify(input, config)).status).toBe("bad_signature");
  });

  it("bad_signature: malformed base58 inputs", async () => {
    const config = makeConfig(fakeReader({ passport: null }));
    const r = await verify(
      {
        agentPublicKey: "!!!",
        signature: "!!!",
        request: { action: "x", timestamp: NOW },
      },
      config,
    );
    expect(r.status).toBe("bad_signature");
  });

  it("replay: identical signature rejected on second use", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, { action: "calendar.read", timestamp: NOW });
    const config = makeConfig(
      fakeReader({
        passport: passportFor(kp.publicKey.toBase58(), ["calendar.read"]),
      }),
    );
    expect((await verify(input, config)).status).toBe("ok");
    expect((await verify(input, config)).status).toBe("replay");
  });

  it("verifier_unavailable: read failure fails closed", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, { action: "calendar.read", timestamp: NOW });
    const config = makeConfig(fakeReader({ throws: true }));
    const r = await verify(input, config);
    expect(r.status).toBe("verifier_unavailable");
    expect(r.ok).toBe(false);
  });

  it("verifier_unavailable: replay-cache read failure fails closed (no bypass)", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, { action: "calendar.read", timestamp: NOW });
    const throwingCache: ReplayCache = {
      has() {
        throw new Error("cache down");
      },
      add() {},
    };
    const config = makeConfig(
      fakeReader({
        passport: passportFor(kp.publicKey.toBase58(), ["calendar.read"]),
      }),
      { replayCache: throwingCache },
    );
    expect((await verify(input, config)).status).toBe("verifier_unavailable");
  });

  it("verifier_unavailable: replay-cache write failure fails closed", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, { action: "calendar.read", timestamp: NOW });
    const throwingCache: ReplayCache = {
      has() {
        return false;
      },
      add() {
        throw new Error("cache down");
      },
    };
    const config = makeConfig(
      fakeReader({
        passport: passportFor(kp.publicKey.toBase58(), ["calendar.read"]),
      }),
      { replayCache: throwingCache },
    );
    expect((await verify(input, config)).status).toBe("verifier_unavailable");
  });

  it("records signature before the read: a transient failure burns it (single-use)", async () => {
    const kp = Keypair.generate();
    const input = signedInput(kp, { action: "calendar.read", timestamp: NOW });
    const replayCache = new InMemoryReplayCache(() => NOW);
    const failing = makeConfig(fakeReader({ throws: true }), { replayCache });
    expect((await verify(input, failing)).status).toBe("verifier_unavailable");
    // Same signature retried after the failure is now treated as a replay.
    const recovered = makeConfig(
      fakeReader({
        passport: passportFor(kp.publicKey.toBase58(), ["calendar.read"]),
      }),
      { replayCache },
    );
    expect((await verify(input, recovered)).status).toBe("replay");
  });
});

describe("createVerifier", () => {
  it("applies the default skew window and program ID", () => {
    const v = createVerifier({ cluster: "localnet" });
    expect(v.config.skewMs).toBe(DEFAULT_SKEW_MS);
    expect(v.config.programId.toBase58()).toBe(AGENT_PASSPORT_PROGRAM_ID);
  });
});

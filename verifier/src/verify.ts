import { PublicKey } from "@solana/web3.js";
import {
  encodeActionMessage,
  verify as verifySignature,
  permits,
  tryFromBase58,
  PUBLIC_KEY_LENGTH,
  SIGNATURE_LENGTH,
  type Passport,
} from "@agent-passport/sdk";
import type { PassportReader } from "./passportReader";
import type { ReplayCache } from "./replayCache";
import type { VerifyInput, VerifyResult, VerifyStatus } from "./types";

export interface VerifierConfig {
  programId: PublicKey;
  /** Max |now - request.timestamp| in ms. Replay TTL equals this. */
  skewMs: number;
  reader: PassportReader;
  replayCache: ReplayCache;
  /** Injectable clock (ms) — defaults to Date.now in createVerifier. */
  now: () => number;
}

function deny(
  status: VerifyStatus,
  reason: string,
  passport?: Passport,
): VerifyResult {
  return passport
    ? { status, ok: false, reason, passport }
    : { status, ok: false, reason };
}

/**
 * The verification pipeline. Cheap, local, offline rejections happen before any
 * network call; there is exactly one network call (the passport read). Any
 * read/RPC error fails closed as `verifier_unavailable` — never a silent allow.
 */
export async function verify(
  input: VerifyInput,
  config: VerifierConfig,
): Promise<VerifyResult> {
  const now = config.now();

  if (!input || typeof input !== "object") {
    return deny("bad_signature", "malformed input");
  }
  const { agentPublicKey, signature, request } = input;
  if (
    !request ||
    typeof request !== "object" ||
    typeof request.action !== "string"
  ) {
    return deny("bad_signature", "malformed request");
  }

  const agentBytes =
    typeof agentPublicKey === "string" ? tryFromBase58(agentPublicKey) : null;
  const sigBytes =
    typeof signature === "string" ? tryFromBase58(signature) : null;
  if (!agentBytes || agentBytes.length !== PUBLIC_KEY_LENGTH) {
    return deny("bad_signature", "invalid agent public key");
  }
  if (!sigBytes || sigBytes.length !== SIGNATURE_LENGTH) {
    return deny("bad_signature", "invalid signature");
  }

  // 1. Freshness (local, offline)
  if (
    !Number.isFinite(request.timestamp) ||
    Math.abs(now - request.timestamp) > config.skewMs
  ) {
    return deny("stale_or_future", `timestamp outside ±${config.skewMs}ms`);
  }

  // 2. Replay (local). A cache failure fails closed — it must never silently
  //    skip the replay check (a pluggable Redis-backed cache can throw).
  let alreadySeen: boolean;
  try {
    alreadySeen = await config.replayCache.has(signature);
  } catch (e) {
    return deny(
      "verifier_unavailable",
      `replay cache read failed: ${asMessage(e)}`,
    );
  }
  if (alreadySeen) {
    return deny("replay", "signature already seen");
  }

  // 3. Signature (offline; reconstruct the exact signed bytes via the SDK encoder)
  let message: Uint8Array;
  try {
    message = encodeActionMessage(agentBytes, request);
  } catch (e) {
    return deny("bad_signature", `could not encode request: ${asMessage(e)}`);
  }
  if (!verifySignature(message, sigBytes, agentBytes)) {
    return deny("bad_signature", "signature does not verify");
  }

  // 4. Record AFTER a valid signature (TTL = skew window) so the cache holds only
  //    genuine in-window signatures. Each signed request is single-use: a transient
  //    failure below burns it, and clients retry by re-signing with a fresh timestamp.
  //    A cache write failure fails closed rather than admitting an unrecorded signature.
  try {
    await config.replayCache.add(signature, config.skewMs);
  } catch (e) {
    return deny(
      "verifier_unavailable",
      `replay cache write failed: ${asMessage(e)}`,
    );
  }

  // 5. On-chain read — the only network call. Fail closed on any error.
  let passport: Passport | null;
  try {
    passport = await config.reader.get(new PublicKey(agentBytes));
  } catch (e) {
    return deny(
      "verifier_unavailable",
      `passport read failed: ${asMessage(e)}`,
    );
  }
  if (passport === null) {
    return deny(
      "no_passport",
      "no passport at the derived PDA (unregistered or revoked)",
    );
  }

  // 6. Permission check (local)
  if (!permits(passport.permissions, request.action)) {
    return deny(
      "not_permitted",
      `action "${request.action}" not permitted`,
      passport,
    );
  }
  return { status: "ok", ok: true, passport };
}

function asMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

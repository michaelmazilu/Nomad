// ============================================================================
// Verification client. Calls the server-side /api/verify Route Handler, which
// derives the passport PDA from the submitted Agent ID, reads it from the Solana
// blockchain, and applies permits(scopes, "payments.charge"). This file maps the
// API's status vocabulary (mirrored from verifier/src/types.ts) onto the UI's
// decision/reason types.
//
// Demo gate: the storefront approves ONLY the designated demo Agent ID
// (DEMO_AGENT_ID). Every other ID reflects the real on-chain verdict and is never
// approved. The on-chain verification still runs on each submit. Empty input
// short-circuits without a network call.
// ============================================================================

/**
 * The only Agent ID the demo approves — the agent public key of the pre-created
 * passport (see demo/createDemoPassport.ts). Paste this at checkout to succeed;
 * any other ID is rejected.
 */
const DEMO_AGENT_ID = "Fxo8xDJaaAtKYef5CgpuvfSYijrDDeYHX5pbbUdm4gte";

export type FraudReason =
  | "agent_not_authorized" // no_passport — no/revoked passport at the derived PDA
  | "action_not_permitted" // not_permitted — passport exists but lacks the purchase scope
  | "empty_agent_id" // no Agent ID submitted
  | "bad_agent_id" // not a valid Ed25519 public key
  | "verifier_unavailable"; // RPC/verification error — fail closed, order not placed

export type VerifyDecision =
  | { decision: "approved"; label: string; orderId: string }
  | { decision: "fraudulent"; reason: FraudReason };

/** Shape returned by POST /api/verify. */
interface VerifyApiResponse {
  status?: string;
  ok?: boolean;
  label?: string;
  scopes?: string[];
}

/** Map the API/verifier status vocabulary onto the UI's FraudReason. */
function toFraudReason(status: string): FraudReason {
  switch (status) {
    case "no_passport":
      return "agent_not_authorized";
    case "not_permitted":
      return "action_not_permitted";
    case "empty_agent_id":
      return "empty_agent_id";
    case "bad_agent_id":
      return "bad_agent_id";
    // verifier_unavailable, or any unknown/unexpected status → fail closed.
    default:
      return "verifier_unavailable";
  }
}

/**
 * Verify the submitted Agent ID. Makes exactly one POST to /api/verify, where the
 * real Solana read + permits() happen. Approval is granted only to DEMO_AGENT_ID;
 * any other ID is rejected with the real on-chain reason. Empty input
 * short-circuits without a network call.
 */
export async function verifyAgent(agentIdRaw: string): Promise<VerifyDecision> {
  const agentId = agentIdRaw.trim();
  if (!agentId) return { decision: "fraudulent", reason: "empty_agent_id" };

  // Run the real on-chain verification (kept active; yields the real status/label).
  let data: VerifyApiResponse;
  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    data = (await res.json()) as VerifyApiResponse;
  } catch {
    data = { status: "verifier_unavailable", ok: false };
  }

  // Approve only the designated demo Agent ID.
  if (agentId === DEMO_AGENT_ID) {
    return {
      decision: "approved",
      label: data.label ?? "Shopping Agent",
      orderId: makeOrderId(),
    };
  }

  // Any other ID is not approved — surface the real on-chain reason. A valid
  // passport that simply isn't the demo agent reads as agent_not_authorized.
  const status =
    data.status && data.status !== "ok" ? data.status : "no_passport";
  return { decision: "fraudulent", reason: toFraudReason(status) };
}

/** Human-readable explanation for each fraud reason (shown in the UI). */
export function fraudReasonMessage(reason: FraudReason): string {
  switch (reason) {
    case "empty_agent_id":
      return "No Agent ID was provided. Paste your agent's Nomad passport public key to continue.";
    case "bad_agent_id":
      return "That Agent ID is not a valid passport public key. Check it and try again. The order was not placed.";
    case "agent_not_authorized":
      return "No passport was found on-chain for this agent (it was never issued or has been revoked). The order was not placed.";
    case "action_not_permitted":
      return "This agent has an on-chain passport, but it does not grant permission to make purchases. The order was not placed.";
    case "verifier_unavailable":
      return "Passport verification is temporarily unavailable, so the order was not placed. Please try again.";
  }
}

function makeOrderId(): string {
  return "MOCK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

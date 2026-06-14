// ============================================================================
// MOCK ONLY — stands in for Nomad's on-chain passport read + permits() check.
//
// In the REAL system (see verifier/src/verify.ts in this repo) an agent signs an
// action request with its Ed25519 *agent key*, and the verifier:
//   1. checks freshness (±60s) and a replay cache,
//   2. re-verifies the Ed25519 signature,
//   3. reads the passport PDA derived from ["passport", agentPubkey] ON-CHAIN
//      (the only network call), then
//   4. evaluates permits(passport.permissions, action).
//
// Here NONE of that happens. There is no Solana, no Ed25519, no on-chain read,
// and NO network/API/fetch call of any kind. The decision below is a synchronous,
// hardcoded, client-side lookup in a static array. Do not mistake this for the
// real verifier.
//
// IMPORTANT (protocol fidelity): in Nomad the *owner wallet* (authority) and the
// *agent key* are two DISTINCT keys, never mixed — the wallet issues/funds/revokes
// the passport, the agent key only signs actions. So "the agent is authorized"
// does NOT mean "agent key == wallet key". It means: the agent's ID corresponds to
// a passport that a trusted owner wallet issued AND whose scopes grant the action.
// We model exactly that with the hardcoded registry below.
// ============================================================================

/** The scope a checkout/purchase requires (mirrors a real Nomad action string). */
export const PURCHASE_ACTION = "payments.charge";

export interface MockPassport {
  agentId: string; // agent public key (base58-looking) — the *agent key*, not the wallet
  ownerWallet: string; // the trusted authority wallet that issued this passport
  label: string;
  permissions: string[]; // granted scopes
}

// The authorized agent(s). An order is APPROVED iff the submitted Agent ID is
// found here AND its permissions grant PURCHASE_ACTION via permits().
export const AUTHORIZED_PASSPORTS: MockPassport[] = [
  {
    // ── KNOWN-GOOD Agent ID (use this to demo the happy path). ──
    agentId: "Ag3ntPa55port1111111111111111111111111111111",
    ownerWallet: "0wnerWa11et2222222222222222222222222222222",
    label: "Shopping Agent",
    permissions: ["payments.charge", "commerce.checkout"],
  },
  {
    // A second valid agent that gets the purchase right via a wildcard scope,
    // exercising the trailing "ns.*" branch of permits().
    agentId: "Buyer4gentWi1dcardPay9999999999999999999999",
    ownerWallet: "0wnerWa11et2222222222222222222222222222222",
    label: "Procurement Agent",
    permissions: ["payments.*", "calendar.read"],
  },
];

// A passport that exists but was NOT granted the purchase scope — included so the
// "action_not_permitted" fraud branch is easy to demo. (Think: an agent issued a
// passport for calendar access only, trying to check out.)
export const UNDERPRIVILEGED_PASSPORTS: MockPassport[] = [
  {
    agentId: "Read0n1yAgentNoPayScope88888888888888888888",
    ownerWallet: "0wnerWa11et2222222222222222222222222222222",
    label: "Read-Only Agent",
    permissions: ["calendar.read", "email.read"],
  },
];

/**
 * Local copy of the SDK's matcher (packages/sdk/src/permissions.ts:131):
 * exact match OR a trailing "ns.*" wildcard prefix match. No regex, no glob.
 */
function permits(granted: readonly string[], action: string): boolean {
  for (const g of granted) {
    if (g === action) return true;
    if (g.endsWith(".*") && action.startsWith(g.slice(0, -1))) return true;
  }
  return false;
}

export type FraudReason =
  | "agent_not_authorized"
  | "action_not_permitted"
  | "empty_agent_id";

export type VerifyDecision =
  | { decision: "approved"; label: string; orderId: string }
  | { decision: "fraudulent"; reason: FraudReason };

/**
 * THE HARDCODED DECISION. Synchronous, client-side, no network. Looks the
 * submitted Agent ID up in the static registry and applies permits().
 */
export function verifyAgent(agentIdRaw: string): VerifyDecision {
  const agentId = agentIdRaw.trim();
  if (!agentId) return { decision: "fraudulent", reason: "empty_agent_id" };

  // Known-but-underprivileged passport → "action_not_permitted".
  const underprivileged = UNDERPRIVILEGED_PASSPORTS.find(
    (p) => p.agentId === agentId,
  );
  if (underprivileged && !permits(underprivileged.permissions, PURCHASE_ACTION)) {
    return { decision: "fraudulent", reason: "action_not_permitted" };
  }

  const passport = AUTHORIZED_PASSPORTS.find((p) => p.agentId === agentId);
  if (!passport) return { decision: "fraudulent", reason: "agent_not_authorized" };
  if (!permits(passport.permissions, PURCHASE_ACTION)) {
    return { decision: "fraudulent", reason: "action_not_permitted" };
  }
  return { decision: "approved", label: passport.label, orderId: makeOrderId() };
}

/** Human-readable explanation for each fraud reason (shown in the UI). */
export function fraudReasonMessage(reason: FraudReason): string {
  switch (reason) {
    case "empty_agent_id":
      return "No Agent ID was provided. Paste your agent's Nomad passport public key to continue.";
    case "agent_not_authorized":
      return "This agent's identity could not be verified against an authorizing passport. The order was not placed.";
    case "action_not_permitted":
      return "This agent has a passport, but it does not grant permission to make purchases. The order was not placed.";
  }
}

function makeOrderId(): string {
  return "MOCK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

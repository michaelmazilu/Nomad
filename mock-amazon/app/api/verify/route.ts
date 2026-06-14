// ============================================================================
// REAL on-chain passport verification at the point of sale (POS).
//
// Thin Route Handler over lib/verifyPassport: given an Agent ID (the agent's
// public key) it derives the passport PDA from ["passport", agentPubkey], reads
// that account from the Solana blockchain (the single network call), and applies
// permits(passport.permissions, "payments.charge"). These are steps 5–6 of the
// Nomad verifier pipeline (verifier/src/verify.ts).
//
// Runs on the SERVER so the RPC call never hits the browser (no CORS, the RPC
// URL stays configurable, and web3.js is never bundled to the client). It does
// NOT verify a signature — the storefront agent only types an ID, so this proves
// "a passport granting the purchase scope exists on-chain for this agent", not
// key possession (that is Level 2, behind the extension's window.nomad flow).
// Every failure FAILS CLOSED — an RPC error returns verifier_unavailable, never
// a silent approval.
// ============================================================================
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  HTTP_STATUS,
  resolveClusterConfig,
  rpcReader,
  verifyPassport,
} from "@/lib/verifyPassport";

// web3.js needs Node APIs (Buffer, crypto) — never the edge runtime.
export const runtime = "nodejs";
// Reading the chain must never be statically cached/prerendered.
export const dynamic = "force-dynamic";

// Resolve cluster + RPC + program once, and build the RPC-backed reader.
const cfg = resolveClusterConfig();
const programId = new PublicKey(cfg.programId);
const read = rpcReader(cfg.rpcUrl, programId);

export async function POST(req: Request) {
  let agentId = "";
  try {
    const body = (await req.json()) as { agentId?: string };
    agentId = body.agentId ?? "";
  } catch {
    // Unparseable body → treat as a malformed Agent ID.
    return NextResponse.json(
      { status: "bad_agent_id", ok: false },
      { status: HTTP_STATUS.bad_agent_id },
    );
  }

  const result = await verifyPassport(agentId, read);
  return NextResponse.json(result, { status: HTTP_STATUS[result.status] });
}

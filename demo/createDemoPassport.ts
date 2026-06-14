/**
 * Pre-demo setup for the Jamazon storefront (mock-amazon/). Creates ONE shared,
 * fixed-identity passport on devnet whose AGENT PUBLIC KEY is the "Agent ID"
 * every demo agent pastes at checkout. The storefront's /api/verify route reads
 * exactly this passport from the chain and approves the purchase.
 *
 *   owner wallet (authority)  -> initialize_passport(agentPubkey, label, scopes)
 *   agent key (identity)      -> its PUBLIC key is the Agent ID handed out
 *
 * The agent key and owner wallet are DISTINCT (the program enforces
 * has_one = authority); the agent key only ever signs actions, never writes.
 *
 * Usage (devnet by default):
 *   npm run demo:passport
 *
 * The agent keypair is persisted to demo/demo-agent.keypair.json (gitignored) and
 * REUSED on subsequent runs, so the Agent ID stays stable across the demo. Env:
 *   CLUSTER (devnet|localnet|mainnet-beta, default devnet)
 *   RPC_URL (default: SDK cluster default)
 *   WALLET  (owner keypair json, default ~/.config/solana/id.json)
 *   AGENT_KEYPAIR (path to the agent keypair json, default demo/demo-agent.keypair.json)
 *
 * To demo the "revocation" beat, close the passport with the owner wallet and the
 * SAME Agent ID flips to no_passport (see demo/e2e.ts closePassport, or grant.ts).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  encodeActionMessage,
  sign,
  toBase58,
  derivePassportPda,
  getClusterConfig,
  type ActionRequest,
  type Cluster,
} from "@agent-passport/sdk";
import { createVerifier } from "@agent-passport/verifier";
import idl from "../target/idl/agent_passport.json";
import type { AgentPassport } from "../target/types/agent_passport";

const HERE = dirname(fileURLToPath(import.meta.url));

const cluster = (process.env.CLUSTER ?? "devnet") as Cluster;
const cfg = getClusterConfig(
  cluster,
  process.env.RPC_URL ? { rpcUrl: process.env.RPC_URL } : {},
);

const LABEL = "Shopping Agent";
const SCOPES = ["payments.charge", "commerce.checkout"]; // mirrors the extension auto-create

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]),
  );
}

function loadOwner(): Keypair {
  const path = process.env.WALLET ?? `${homedir()}/.config/solana/id.json`;
  return loadKeypair(path);
}

/** Load the fixed agent keypair, creating + persisting one on first run. */
function loadOrCreateAgent(): Keypair {
  const path =
    process.env.AGENT_KEYPAIR ?? resolve(HERE, "demo-agent.keypair.json");
  if (existsSync(path)) return loadKeypair(path);
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`generated new agent keypair -> ${path}`);
  return kp;
}

async function main(): Promise<void> {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const owner = loadOwner();
  const agent = loadOrCreateAgent();
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(owner),
    { commitment: "confirmed" },
  );
  const program = new Program<AgentPassport>(idl as AgentPassport, provider);
  const [pda] = derivePassportPda(agent.publicKey, program.programId);

  console.log(`cluster : ${cluster} (${cfg.rpcUrl})`);
  console.log(`program : ${program.programId.toBase58()}`);
  console.log(`owner   : ${owner.publicKey.toBase58()} (authority)`);
  console.log(
    `agent   : ${agent.publicKey.toBase58()}  <-- Agent ID to hand out`,
  );
  console.log(`passport: ${pda.toBase58()}`);

  // Revocation beat: REVOKE=1 closes the passport so the SAME Agent ID flips to
  // no_passport at checkout — the protocol working in reverse, no code change.
  if (process.env.REVOKE) {
    const exists = await connection.getAccountInfo(pda);
    if (!exists) {
      console.log("\n[revoke] no passport to close — nothing to do");
      return;
    }
    console.log("\n[revoke] owner closes the passport (revocation)…");
    await program.methods
      .closePassport()
      .accountsPartial({ authority: owner.publicKey, passport: pda })
      .rpc();
    console.log(
      `Revoked. ${agent.publicKey.toBase58()} now resolves to no_passport.`,
    );
    return;
  }

  // Fund the owner if needed (devnet/localnet airdrop; mainnet must be pre-funded).
  if (cluster !== "mainnet-beta") {
    const bal = await connection.getBalance(owner.publicKey);
    if (bal < LAMPORTS_PER_SOL / 50) {
      console.log("\n[fund] owner balance low — requesting an airdrop…");
      try {
        const sig = await connection.requestAirdrop(
          owner.publicKey,
          LAMPORTS_PER_SOL,
        );
        await connection.confirmTransaction(sig, "confirmed");
      } catch (e) {
        console.warn(
          `airdrop failed (${e instanceof Error ? e.message : String(e)}). ` +
            "Fund the owner wallet manually (e.g. https://faucet.solana.com) and re-run.",
        );
      }
    }
  }

  // Create the passport if it doesn't exist yet; otherwise refresh its scopes so
  // re-runs are idempotent and the purchase scope is always present.
  const existing = await connection.getAccountInfo(pda);
  if (existing) {
    console.log("\n[write] passport already exists — updating scopes to match");
    await program.methods
      .updatePermissions(LABEL, SCOPES)
      .accountsPartial({ authority: owner.publicKey, passport: pda })
      .rpc();
  } else {
    console.log(
      `\n[write] owner creates passport: ${LABEL} ${JSON.stringify(SCOPES)}`,
    );
    await program.methods
      .initializePassport(agent.publicKey, LABEL, SCOPES)
      .accountsPartial({ authority: owner.publicKey, passport: pda })
      .rpc();
  }

  // Prove it with the real verifier: sign payments.charge with the agent key and
  // expect `ok` — the same pipeline the storefront's /api/verify mirrors (minus
  // the signature step, which the storefront omits for the type-an-ID flow).
  console.log("\n[verify] signing payments.charge with the agent key…");
  const request: ActionRequest = {
    action: "payments.charge",
    timestamp: Date.now(),
  };
  const message = encodeActionMessage(agent.publicKey.toBytes(), request);
  const signed = {
    agentPublicKey: agent.publicKey.toBase58(),
    signature: toBase58(sign(message, agent.secretKey)),
    request,
  };
  const result = await createVerifier({
    cluster,
    rpcUrl: cfg.rpcUrl,
  }).verify(signed);
  console.log(`verifier verdict: ${result.status} (expected: ok)`);

  console.log("\nDone. Use this Agent ID at checkout:");
  console.log(`  ${agent.publicKey.toBase58()}`);
  if (result.status !== "ok") {
    console.error(
      "\nWARNING: verifier did not return ok — check CLUSTER/RPC_URL match where the passport was created.",
    );
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

/**
 * Grant (create or update) a passport for a given agent pubkey, signed by your
 * local keypair as the owner wallet. This is the wallet-free way to give the
 * extension's agent some on-chain permissions so the popup's "Load from chain"
 * + "Check permission" buttons have real scopes to evaluate.
 *
 *   npm run grant -- <AGENT_PUBKEY> "calendar.*,mail.send" ["Label"]
 *
 * Env: RPC_URL, CLUSTER (localnet|devnet|mainnet-beta), WALLET (owner keypair json).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  derivePassportPda,
  getClusterConfig,
  validatePermissions,
  type Cluster,
} from "@agent-passport/sdk";
import idl from "../target/idl/agent_passport.json";
import type { AgentPassport } from "../target/types/agent_passport";

const [agentArg, scopesArg, labelArg] = process.argv.slice(2);
if (!agentArg || !scopesArg) {
  console.error('usage: npm run grant -- <AGENT_PUBKEY> "calendar.*,mail.send" ["Label"]');
  process.exit(1);
}

const cluster = (process.env.CLUSTER ?? "localnet") as Cluster;
const cfg = getClusterConfig(
  cluster,
  process.env.RPC_URL ? { rpcUrl: process.env.RPC_URL } : {},
);
const scopes = scopesArg.split(",").map((s) => s.trim()).filter(Boolean);
const label = labelArg ?? "Granted Agent";

const validation = validatePermissions(scopes);
if (!validation.ok) {
  console.error("invalid scopes:", validation.errors.join("; "));
  process.exit(1);
}

function loadOwner(): Keypair {
  const path = process.env.WALLET ?? `${homedir()}/.config/solana/id.json`;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]),
  );
}

async function main(): Promise<void> {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const owner = loadOwner();
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(owner),
    { commitment: "confirmed" },
  );
  const program = new Program<AgentPassport>(idl as AgentPassport, provider);
  const agent = new PublicKey(agentArg);
  const [pda] = derivePassportPda(agent, program.programId);

  if (cluster === "localnet") {
    const bal = await connection.getBalance(owner.publicKey);
    if (bal < LAMPORTS_PER_SOL) {
      const sig = await connection.requestAirdrop(owner.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
    }
  }

  const existing = await connection.getAccountInfo(pda);
  const sig = existing
    ? await program.methods
        .updatePermissions(label, scopes)
        .accountsPartial({ authority: owner.publicKey, passport: pda })
        .rpc()
    : await program.methods
        .initializePassport(agent, label, scopes)
        .accountsPartial({ authority: owner.publicKey, passport: pda })
        .rpc();

  console.log(`${existing ? "updated" : "created"} passport: ${pda.toBase58()}`);
  console.log(`agent : ${agent.toBase58()}`);
  console.log(`scopes: ${scopes.join(", ")}`);
  console.log(`tx    : ${sig}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

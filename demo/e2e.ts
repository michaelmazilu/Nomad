/**
 * End-to-end demo of the full protocol against a running cluster (localnet by
 * default). Exercises every moving part on a REAL on-chain account:
 *
 *   owner wallet  -> initialize passport (on-chain write)
 *   agent key     -> sign action requests (offline)
 *   verifier      -> verify against the live passport (offline sig + 1 read)
 *   owner wallet  -> close passport (revocation)
 *   verifier      -> now denies (no_passport)
 *
 * Prereqs: a validator with the program deployed. Easiest:  `anchor localnet`
 * in one terminal, then `npm run demo` in another. Override with env:
 *   RPC_URL, CLUSTER (localnet|devnet|mainnet-beta), WALLET (owner keypair json).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  encodeActionMessage,
  sign,
  toBase58,
  derivePassportPda,
  type ActionRequest,
  type Cluster,
} from "@agent-passport/sdk";
import { createVerifier } from "@agent-passport/verifier";
import idl from "../target/idl/agent_passport.json";
import type { AgentPassport } from "../target/types/agent_passport";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const cluster = (process.env.CLUSTER ?? "localnet") as Cluster;

function loadOwner(): Keypair {
  const path = process.env.WALLET ?? `${homedir()}/.config/solana/id.json`;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]),
  );
}

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  const owner = loadOwner();
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(owner),
    { commitment: "confirmed" },
  );
  const program = new Program<AgentPassport>(idl as AgentPassport, provider);

  if (cluster === "localnet") {
    const bal = await connection.getBalance(owner.publicKey);
    if (bal < LAMPORTS_PER_SOL) {
      const sig = await connection.requestAirdrop(
        owner.publicKey,
        2 * LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig, "confirmed");
    }
  }

  const agent = Keypair.generate();
  const [pda] = derivePassportPda(agent.publicKey, program.programId);
  console.log(`cluster : ${cluster} (${RPC_URL})`);
  console.log(`program : ${program.programId.toBase58()}`);
  console.log(`owner   : ${owner.publicKey.toBase58()}`);
  console.log(`agent   : ${agent.publicKey.toBase58()}`);
  console.log(`passport: ${pda.toBase58()}`);

  const verifier = createVerifier({ cluster, rpcUrl: RPC_URL });

  const signed = (action: string) => {
    const request: ActionRequest = { action, timestamp: Date.now() };
    const message = encodeActionMessage(agent.publicKey.toBytes(), request);
    return {
      agentPublicKey: agent.publicKey.toBase58(),
      signature: toBase58(sign(message, agent.secretKey)),
      request,
    };
  };
  const show = async (label: string, input: ReturnType<typeof signed>) => {
    const r = await verifier.verify(input);
    console.log(`  ${label.padEnd(46)} -> ${r.status}`);
  };

  console.log(
    "\n[write] owner creates passport: scopes [calendar.read, calendar.*]",
  );
  await program.methods
    .initializePassport(agent.publicKey, "Demo Agent", [
      "calendar.read",
      "calendar.*",
    ])
    .accountsPartial({ authority: owner.publicKey, passport: pda })
    .rpc();

  console.log("\n[verify] against the live passport:");
  const okInput = signed("calendar.events.list"); // matched by calendar.*
  await show("calendar.events.list (via calendar.*)", okInput);
  await show("mail.send (not granted)", signed("mail.send"));
  await show("replay the first request", okInput);

  console.log("\n[write] owner revokes (closes the account)");
  await program.methods
    .closePassport()
    .accountsPartial({ authority: owner.publicKey, passport: pda })
    .rpc();

  console.log("\n[verify] after revocation:");
  await show("calendar.read (revoked)", signed("calendar.read"));

  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

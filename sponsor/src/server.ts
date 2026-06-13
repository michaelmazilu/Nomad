import Fastify from "fastify";
import { Keypair } from "@solana/web3.js";
import type { Cluster } from "@agent-passport/sdk";
import { RateLimiter, Sponsor, SponsorError, loadKeypairFile } from "./index";

/**
 * Thin HTTP wrapper around the fee-payer sponsor. Environment-driven:
 *
 *   CLUSTER=devnet \
 *   RPC_URL=... PROGRAM_ID=... \
 *   SPONSOR_KEYPAIR_PATH=~/.config/solana/id.json \
 *   SPONSOR_AUTH_TOKEN=secret \           # optional: require Bearer auth
 *   RATE_LIMIT_PER_MIN=30 PORT=8790 \
 *   npm start -w @agent-passport/sponsor
 *
 * The fee-payer key must be funded on the chosen cluster (it pays rent + fees).
 * If SPONSOR_KEYPAIR_PATH is unset, an ephemeral key is generated and its pubkey
 * logged — fund it (airdrop on devnet/localnet) before sponsoring.
 */
const cluster = (process.env["CLUSTER"] ?? "localnet") as Cluster;

const keypairPath = process.env["SPONSOR_KEYPAIR_PATH"];
const feePayer = keypairPath
  ? loadKeypairFile(keypairPath)
  : Keypair.generate();

const sponsor = new Sponsor({
  cluster,
  feePayer,
  ...(process.env["RPC_URL"] ? { rpcUrl: process.env["RPC_URL"] } : {}),
  ...(process.env["PROGRAM_ID"]
    ? { programId: process.env["PROGRAM_ID"] }
    : {}),
});

const authToken = process.env["SPONSOR_AUTH_TOKEN"];
const rateLimiter = new RateLimiter(
  Number(process.env["RATE_LIMIT_PER_MIN"] ?? 30),
);

const app = Fastify({ logger: true });

// The extension's service worker calls this cross-origin; allow it (and the
// preflight). Lock `access-control-allow-origin` down to your extension id in
// production rather than "*".
app.addHook("onRequest", async (request, reply) => {
  reply.header("access-control-allow-origin", "*");
  reply.header("access-control-allow-headers", "content-type, authorization");
  reply.header("access-control-allow-methods", "GET, POST, OPTIONS");
  if (request.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

app.get("/health", async () => ({
  status: "ok",
  cluster,
  feePayer: sponsor.feePayer.toBase58(),
}));

app.post("/sponsor", async (request, reply) => {
  if (authToken) {
    const header = request.headers.authorization ?? "";
    if (header !== `Bearer ${authToken}`) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  }

  const key = request.ip || "anon";
  if (!rateLimiter.allow(key)) {
    return reply.code(429).send({ error: "rate limit exceeded" });
  }

  const body = request.body as { txBase64?: string } | null;
  if (!body?.txBase64) {
    return reply.code(400).send({ error: "missing txBase64" });
  }

  try {
    const signature = await sponsor.sponsor(body.txBase64);
    return reply.send({ signature });
  } catch (e) {
    if (e instanceof SponsorError) {
      return reply.code(e.status).send({ error: e.message });
    }
    request.log.error(e);
    return reply
      .code(500)
      .send({ error: e instanceof Error ? e.message : String(e) });
  }
});

const port = Number(process.env["PORT"] ?? 8790);
app
  .listen({ port, host: "0.0.0.0" })
  .then((addr) => {
    app.log.info(
      `agent-passport sponsor listening on ${addr} (cluster=${cluster})`,
    );
    app.log.info(`fee payer: ${sponsor.feePayer.toBase58()}`);
    if (!keypairPath) {
      app.log.warn(
        "ephemeral fee payer in use — set SPONSOR_KEYPAIR_PATH and fund the key above",
      );
    }
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

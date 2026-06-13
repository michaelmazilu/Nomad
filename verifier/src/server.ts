import Fastify from "fastify";
import type { Cluster } from "@agent-passport/sdk";
import { createVerifier, DEFAULT_SKEW_MS } from "./index";
import type { VerifyInput } from "./types";

/**
 * Thin reference HTTP wrapper over the verify library. Configuration is
 * environment-driven; cluster is required and first-class.
 *
 *   CLUSTER=devnet RPC_URL=... PROGRAM_ID=... PORT=8787 SKEW_MS=60000 npm start
 */
const cluster = (process.env["CLUSTER"] ?? "localnet") as Cluster;
const verifier = createVerifier({
  cluster,
  ...(process.env["RPC_URL"] ? { rpcUrl: process.env["RPC_URL"] } : {}),
  ...(process.env["PROGRAM_ID"]
    ? { programId: process.env["PROGRAM_ID"] }
    : {}),
  skewMs: process.env["SKEW_MS"]
    ? Number(process.env["SKEW_MS"])
    : DEFAULT_SKEW_MS,
});

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  status: "ok",
  cluster,
  programId: verifier.config.programId.toBase58(),
  skewMs: verifier.config.skewMs,
}));

app.post("/verify", async (request, reply) => {
  const result = await verifier.verify(request.body as VerifyInput);
  // HTTP status mirrors the semantic outcome: allow / fail-closed-unavailable / deny.
  const code = result.ok
    ? 200
    : result.status === "verifier_unavailable"
      ? 503
      : 403;
  return reply.code(code).send(result);
});

const port = Number(process.env["PORT"] ?? 8787);
app
  .listen({ port, host: "0.0.0.0" })
  .then((addr) =>
    app.log.info(
      `agent-passport verifier listening on ${addr} (cluster=${cluster})`,
    ),
  )
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

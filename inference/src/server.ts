import Fastify from "fastify";

/**
 * Intent-detection proxy. The Anthropic API key lives here (server-side) so it
 * never ships inside the extension bundle. The extension POSTs the latest
 * ChatGPT message; this service asks Haiku 4.5 whether the user wants to create
 * an agent and returns a boolean.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... \
 *   ANTHROPIC_MODEL=claude-haiku-4-5 \   # optional
 *   PORT=8791 \
 *   npm start -w @agent-passport/inference
 */
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

if (!process.env["ANTHROPIC_API_KEY"]) {
  console.error(
    "ANTHROPIC_API_KEY is not set. Copy inference/.env.example to inference/.env " +
      "and add your key (the npm scripts load it via --env-file=.env).",
  );
  process.exit(1);
}
const apiKey: string = process.env["ANTHROPIC_API_KEY"];
const model = process.env["ANTHROPIC_MODEL"] ?? "claude-haiku-4-5";

const app = Fastify({ logger: true });

// The extension's service worker calls this cross-origin; allow it (and the
// preflight). Lock `access-control-allow-origin` down to your extension id in
// production rather than "*".
app.addHook("onRequest", async (request, reply) => {
  reply.header("access-control-allow-origin", "*");
  reply.header("access-control-allow-headers", "content-type");
  reply.header("access-control-allow-methods", "POST, OPTIONS");
  if (request.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

app.get("/health", async () => ({ status: "ok", model }));

/** Ask Haiku 4.5 whether one ChatGPT message asks to create an agent. */
async function classifyAgentIntent(text: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 5,
        system:
          'You read one message a user sent in ChatGPT and decide whether they are asking to create an agent. Answer with exactly "yes" or "no" — nothing else.',
        messages: [{ role: "user", content: text }],
      }),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `anthropic request failed (${response.status}): ${body || response.statusText}`,
      );
    }
    const parsed = JSON.parse(body) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const answer = (parsed.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join(" ")
      .toLowerCase();
    return /\byes\b/.test(answer);
  } finally {
    clearTimeout(timeout);
  }
}

app.post("/detect-agent-intent", async (request, reply) => {
  const body = request.body as { text?: string } | null;
  const text = body?.text?.trim();
  if (!text) {
    return reply.code(400).send({ error: "missing text" });
  }
  try {
    const wantsAgent = await classifyAgentIntent(text);
    return reply.send({ wantsAgent });
  } catch (e) {
    request.log.error(e);
    return reply
      .code(502)
      .send({ error: e instanceof Error ? e.message : String(e) });
  }
});

const port = Number(process.env["PORT"] ?? 8791);
app
  .listen({ port, host: "0.0.0.0" })
  .then((addr) => {
    app.log.info(`agent-passport inference proxy listening on ${addr}`);
    app.log.info(`model: ${model}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

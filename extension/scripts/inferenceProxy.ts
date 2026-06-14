import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const extensionDir = dirname(scriptDir);
const rootDir = dirname(extensionDir);

function loadDotEnv(path: string): void {
  try {
    const text = readFileSync(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Local env files are optional.
  }
}

loadDotEnv(resolve(rootDir, ".env"));
loadDotEnv(resolve(extensionDir, ".env"));

const PORT = Number(process.env.NOMAD_INFERENCE_PROXY_PORT ?? 8788);
const MODEL = process.env.OPENAI_MODEL ?? "gpt-5-nano";
const MAX_BODY_BYTES = 320_000;

interface InferenceRequest {
  schema?: string;
  instructions?: string;
  context?: {
    url?: string;
    title?: string;
    text?: string;
    truncated?: boolean;
  };
}

function sendJson(
  res: ServerResponse,
  status: number,
  data: Record<string, unknown>,
): void {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json",
  });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        req.destroy(new Error("request body too large"));
      }
    });
    req.on("end", () => resolveBody(body));
    req.on("error", reject);
  });
}

function extractOutputText(data: unknown): string {
  const root = data as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
  };
  if (typeof root.output_text === "string") return root.output_text;
  for (const item of root.output ?? []) {
    for (const content of item.content ?? []) {
      if (
        (content.type === "output_text" || content.type === "text") &&
        typeof content.text === "string"
      ) {
        return content.text;
      }
    }
  }
  throw new Error("OpenAI response did not include output text");
}

function promptFor(req: InferenceRequest): string {
  const context = req.context;
  return [
    "Infer a least-privilege Nomad permission passport from this ChatGPT conversation.",
    "",
    "Return JSON only. Use these fields:",
    "- agentName: short nullable string",
    "- label: short human label, max 64 bytes",
    "- scopes: 1-32 lowercase scope strings",
    "- testAction: optional non-wildcard scope to try",
    "",
    "Scope grammar:",
    "- lowercase only",
    "- namespace.action or namespace:resource",
    "- wildcard only as trailing .*",
    "- examples: web.search, github.repo.read, slack.message.send, calendar.read, files.write",
    "",
    "Prefer narrow read scopes unless the conversation clearly asks to create, edit, send, transfer, merge, or update.",
    "",
    `Source URL: ${context?.url ?? ""}`,
    `Title: ${context?.title ?? ""}`,
    `Truncated: ${context?.truncated ? "yes" : "no"}`,
    "",
    "Conversation:",
    context?.text ?? "",
  ].join("\n");
}

async function infer(
  reqBody: InferenceRequest,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Put it in extension/.env or export it before starting the proxy.",
    );
  }
  if (
    typeof reqBody.context?.text !== "string" ||
    !reqBody.context.text.trim()
  ) {
    throw new Error("context.text is required");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: "system",
          content:
            "You convert ChatGPT conversation context into strict, least-privilege Nomad permission JSON.",
        },
        { role: "user", content: promptFor(reqBody) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "nomad_permission_inference",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["agentName", "label", "scopes", "testAction"],
            properties: {
              agentName: { type: ["string", "null"] },
              label: { type: "string" },
              scopes: {
                type: "array",
                minItems: 1,
                maxItems: 32,
                items: { type: "string" },
              },
              testAction: { type: ["string", "null"] },
            },
          },
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message =
      typeof data?.error?.message === "string"
        ? data.error.message
        : response.statusText;
    throw new Error(`OpenAI request failed (${response.status}): ${message}`);
  }

  return JSON.parse(extractOutputText(data)) as Record<string, unknown>;
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  if (req.method !== "POST" || req.url !== "/infer") {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw) as InferenceRequest;
    sendJson(res, 200, await infer(body));
  } catch (e) {
    sendJson(res, 500, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.info(
    `Nomad inference proxy listening on http://127.0.0.1:${PORT}/infer (${MODEL})`,
  );
  console.info(
    `Env files checked: ${join(rootDir, ".env")}, ${join(extensionDir, ".env")}`,
  );
});

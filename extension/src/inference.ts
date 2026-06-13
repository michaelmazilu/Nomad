import {
  compareUtf8,
  isWildcardScope,
  MAX_LABEL_LEN,
  validatePermissions,
  validateScope,
} from "@agent-passport/sdk";

const textEncoder = new TextEncoder();
export const MAX_CONTEXT_CHARS = 12000;

export type InferenceRiskLevel = "low" | "medium" | "high";

export interface ExtractedTabContext {
  url: string;
  title: string;
  text: string;
}

export interface NormalizedTabContext extends ExtractedTabContext {
  originalLength: number;
  truncated: boolean;
}

export interface InferredPermissionFields {
  agentName: string | null;
  label: string;
  scopes: string[];
  testAction?: string;
  riskLevel: InferenceRiskLevel;
  warnings: string[];
}

function byteLen(s: string): number {
  return textEncoder.encode(s).length;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("inference response must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requiredString(value: unknown, field: string): string {
  const s = optionalString(value, field);
  if (!s) throw new Error(`${field} is required`);
  return s;
}

function requireLabel(value: string): string {
  if (byteLen(value) > MAX_LABEL_LEN) {
    throw new Error(`label exceeds ${MAX_LABEL_LEN} bytes`);
  }
  return value;
}

function truncateLabel(value: string): string {
  let out = value.trim().replace(/\s+/g, " ");
  while (out.length > 0 && byteLen(out) > MAX_LABEL_LEN) {
    out = out.slice(0, -1);
  }
  return out || "ChatGPT Agent";
}

function canonicalScopes(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("scopes must be an array");
  const seen = new Set<string>();
  const scopes: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") throw new Error("scopes must be strings");
    const scope = item.trim().toLowerCase();
    if (!scope || seen.has(scope)) continue;
    seen.add(scope);
    scopes.push(scope);
  }
  scopes.sort(compareUtf8);
  return scopes;
}

export function isSupportedChatGptUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "chatgpt.com" ||
      host.endsWith(".chatgpt.com") ||
      host === "chat.openai.com"
    );
  } catch {
    return false;
  }
}

export function normalizeTabContext(
  context: ExtractedTabContext,
  maxChars = MAX_CONTEXT_CHARS,
): NormalizedTabContext {
  const title = context.title.trim().replace(/\s+/g, " ");
  const text = context.text.replace(/\s+/g, " ").trim();
  if (!text) throw new Error("no readable ChatGPT conversation text found");
  return {
    url: context.url,
    title,
    text: text.slice(0, maxChars),
    originalLength: text.length,
    truncated: text.length > maxChars,
  };
}

function classifyRisk(scopes: readonly string[]): {
  riskLevel: InferenceRiskLevel;
  warnings: string[];
} {
  const warnings: string[] = [];
  let score = 0;
  const namespaces = new Set<string>();

  for (const scope of scopes) {
    const sep = scope.search(/[.:]/);
    const ns = sep === -1 ? scope : scope.slice(0, sep);
    namespaces.add(ns);

    if (isWildcardScope(scope)) {
      warnings.push(`Wildcard scope inferred: ${scope}`);
      score = Math.max(score, 1);
    }
    if (
      ns === "system" ||
      ns === "wallet" ||
      ns === "payment" ||
      ns === "payments" ||
      scope.includes("transfer") ||
      scope.includes("admin")
    ) {
      warnings.push(`Sensitive-looking scope inferred: ${scope}`);
      score = Math.max(score, 2);
    }
  }

  if (namespaces.size >= 5) {
    warnings.push(`Scopes span ${namespaces.size} namespaces`);
    score = Math.max(score, 1);
  }
  if (scopes.length >= 16) {
    warnings.push(`Large permission set inferred: ${scopes.length} scopes`);
    score = Math.max(score, 2);
  }

  return {
    riskLevel: score >= 2 ? "high" : score === 1 ? "medium" : "low",
    warnings: Array.from(new Set(warnings)),
  };
}

export function parseInferencePayload(
  payload: unknown,
): InferredPermissionFields {
  const obj = asRecord(payload);
  const agentName = optionalString(obj.agentName, "agentName") ?? null;
  const label = requireLabel(
    optionalString(obj.label, "label") ?? requiredString(agentName, "label"),
  );
  const scopes = canonicalScopes(obj.scopes);
  if (scopes.length === 0) throw new Error("at least one scope is required");
  const validation = validatePermissions(scopes, {
    namespaceMode: "dynamic",
  });
  if (!validation.ok) {
    throw new Error(`invalid inferred scopes: ${validation.errors.join("; ")}`);
  }

  const testAction = optionalString(
    obj.testAction,
    "testAction",
  )?.toLowerCase();
  if (
    testAction &&
    (isWildcardScope(testAction) ||
      !validateScope(testAction, { namespaceMode: "dynamic" }))
  ) {
    throw new Error(`invalid inferred testAction: ${testAction}`);
  }

  const risk = classifyRisk(scopes);
  return {
    agentName,
    label,
    scopes,
    ...(testAction ? { testAction } : {}),
    ...risk,
  };
}

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function labelFromContext(context: NormalizedTabContext): string {
  const title = context.title
    .replace(/\s*[-|]\s*chatgpt\s*$/i, "")
    .replace(/^chatgpt\s*[-|]\s*/i, "")
    .trim();
  if (title && title.toLowerCase() !== "chatgpt") {
    return truncateLabel(title);
  }

  const firstUserLine = context.text
    .split(/\b(?:user|you):/i)
    .map((part) => part.trim())
    .find((part) => part.length > 12);
  return truncateLabel(firstUserLine ?? "ChatGPT Agent");
}

export function inferFromChatGptContext(
  context: NormalizedTabContext,
  reason = "Used local ChatGPT inference.",
): InferredPermissionFields {
  const text = `${context.title}\n${context.text}`.toLowerCase();
  const scopes = new Set<string>();
  const add = (scope: string): void => {
    if (scopes.size < 32) scopes.add(scope);
  };

  if (
    includesAny(text, [
      "look up",
      "search",
      "google",
      "browse",
      "browser",
      "web",
      "internet",
      "website",
      "url",
    ])
  ) {
    add("web.search");
  }
  if (
    includesAny(text, [
      "github",
      "repo",
      "pull request",
      "issue",
      "commit",
      "branch",
      "code review",
    ])
  ) {
    add("github.repo.read");
    if (
      includesAny(text, [
        "create",
        "update",
        "edit",
        "write",
        "merge",
        "push",
        "comment",
      ])
    ) {
      add("github.repo.write");
    }
  }
  if (includesAny(text, ["slack", "channel", "message", "dm"])) {
    add("slack.message.read");
    if (includesAny(text, ["send", "post", "reply", "notify"])) {
      add("slack.message.send");
    }
  }
  if (includesAny(text, ["calendar", "schedule", "meeting", "event"])) {
    add("calendar.read");
    if (
      includesAny(text, [
        "create",
        "schedule",
        "book",
        "reschedule",
        "cancel",
      ])
    ) {
      add("calendar.events.write");
    }
  }
  if (includesAny(text, ["email", "mail", "inbox"])) {
    add("mail.read");
    if (includesAny(text, ["send", "reply", "draft", "forward"])) {
      add("mail.send");
    }
  }
  if (
    includesAny(text, [
      "file",
      "document",
      "docx",
      "pdf",
      "spreadsheet",
      "csv",
      "drive",
    ])
  ) {
    add("files.read");
    if (includesAny(text, ["create", "edit", "write", "update", "export"])) {
      add("files.write");
    }
  }
  if (
    includesAny(text, [
      "wallet",
      "phantom",
      "solana",
      "payment",
      "transfer",
      "pay ",
    ])
  ) {
    add("wallet.read");
    if (includesAny(text, ["transfer", "payment", "pay ", "send sol"])) {
      add("wallet.transfer");
    }
  }

  if (scopes.size === 0) {
    add("chatgpt.conversation.read");
  }

  const inferred = parseInferencePayload({
    agentName: labelFromContext(context),
    label: labelFromContext(context),
    scopes: Array.from(scopes),
    testAction: Array.from(scopes).find((scope) => !isWildcardScope(scope)),
  });
  return {
    ...inferred,
    warnings: [reason, ...inferred.warnings],
  };
}

export function parseInferenceJson(text: string): InferredPermissionFields {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("inference response was not valid JSON");
  }
  return parseInferencePayload(parsed);
}

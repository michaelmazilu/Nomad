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

export function parseInferenceJson(text: string): InferredPermissionFields {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("inference response was not valid JSON");
  }
  return parseInferencePayload(parsed);
}

import { MAX_PERMISSIONS, MAX_SCOPE_LEN } from "./constants";

/**
 * Reserved namespace allowlist. Scopes must begin with one of these (the part
 * before the first `.` or `:`). This is OFF-CHAIN policy — the program enforces
 * only the hard length/count bounds — so namespaces can be added here without a
 * program redeploy. Override via `ScopeOptions.knownNamespaces`.
 */
export const DEFAULT_KNOWN_NAMESPACES = [
  "calendar",
  "mail",
  "files",
  "contacts",
  "tasks",
  "api", // resource form: "api:example.com"
  "mcp", // resource form: "mcp:server-name"
  "system", // reserved
] as const;

const textEncoder = new TextEncoder();
const NAMESPACE_RE = /^[a-z0-9]+$/;
const REST_RE = /^[a-z0-9._:/-]+$/;

export interface ScopeOptions {
  knownNamespaces?: Iterable<string>;
  namespaceMode?: "known" | "dynamic";
  maxScopeLen?: number;
}

export interface PermissionsOptions extends ScopeOptions {
  maxPermissions?: number;
}

export interface PermissionsValidation {
  ok: boolean;
  errors: string[];
}

function byteLen(s: string): number {
  return textEncoder.encode(s).length;
}

function firstSepIndex(s: string): number {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 46 /* . */ || c === 58 /* : */) return i;
  }
  return -1;
}

/** True if this scope is a trailing-prefix wildcard (e.g. `calendar.*`). */
export function isWildcardScope(scope: string): boolean {
  return scope.endsWith(".*");
}

/**
 * Validate a single scope against the grammar and reserved-namespace allowlist.
 *
 * Grammar: `<namespace><sep><rest>` where the namespace is `[a-z0-9]+` and must
 * be in the allowlist, `sep` is `.` or `:`, and `rest` is lowercase ASCII over
 * `[a-z0-9._:/-]`. A single trailing `.*` (e.g. `calendar.*` or `calendar.events.*`)
 * is the ONLY wildcard form. Total and predictable — no regex/glob from callers.
 */
export function validateScope(scope: string, opts: ScopeOptions = {}): boolean {
  const namespaceMode = opts.namespaceMode ?? "known";
  const allow = new Set<string>(
    opts.knownNamespaces ?? DEFAULT_KNOWN_NAMESPACES,
  );
  const maxLen = opts.maxScopeLen ?? MAX_SCOPE_LEN;

  if (scope.length === 0 || byteLen(scope) > maxLen) return false;
  if (scope !== scope.toLowerCase()) return false;

  if (isWildcardScope(scope)) {
    const body = scope.slice(0, -2); // strip the trailing ".*"
    if (body.length === 0 || body.includes("*")) return false;
    const sep = firstSepIndex(body);
    const ns = sep === -1 ? body : body.slice(0, sep);
    if (!NAMESPACE_RE.test(ns)) return false;
    if (namespaceMode === "known" && !allow.has(ns)) return false;
    if (sep !== -1) {
      const rest = body.slice(sep + 1);
      if (rest.length === 0 || !REST_RE.test(rest)) return false;
    }
    return true;
  }

  if (scope.includes("*")) return false; // '*' only allowed as the trailing ".*"
  const sep = firstSepIndex(scope);
  if (sep === -1) return false; // a concrete scope must have a separator
  const ns = scope.slice(0, sep);
  const rest = scope.slice(sep + 1);
  if (!NAMESPACE_RE.test(ns)) return false;
  if (namespaceMode === "known" && !allow.has(ns)) return false;
  if (rest.length === 0 || !REST_RE.test(rest)) return false;
  return true;
}

/**
 * Validate a complete permission set: bounds (count), each scope, and dedup.
 * Used client-side for fail-fast UX; the program is the hard boundary for counts
 * and lengths, and the namespace allowlist is enforced only here (off-chain).
 */
export function validatePermissions(
  scopes: readonly string[],
  opts: PermissionsOptions = {},
): PermissionsValidation {
  const errors: string[] = [];
  const max = opts.maxPermissions ?? MAX_PERMISSIONS;
  if (scopes.length > max) {
    errors.push(`too many scopes: ${scopes.length} > ${max}`);
  }
  const seen = new Set<string>();
  for (const s of scopes) {
    if (seen.has(s)) {
      errors.push(`duplicate scope: ${s}`);
      continue;
    }
    seen.add(s);
    if (!validateScope(s, opts)) errors.push(`invalid scope: ${s}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Total, predictable permission matcher. Returns true iff `action` is granted by
 * `grantedScopes`: an exact match, OR a granted `ns.*` wildcard whose `ns.`
 * prefix `action` starts with. No regex, no glob. Never throws — safe even if a
 * stored scope is malformed.
 */
export function permits(
  grantedScopes: readonly string[],
  action: string,
): boolean {
  for (const granted of grantedScopes) {
    if (granted === action) return true;
    if (granted.endsWith(".*")) {
      const prefix = granted.slice(0, -1); // "calendar." from "calendar.*"
      if (action.startsWith(prefix)) return true;
    }
  }
  return false;
}

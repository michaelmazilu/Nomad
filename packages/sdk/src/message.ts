import {
  ACTION_DOMAIN_TAG,
  MESSAGE_SCHEMA_VERSION,
  PUBLIC_KEY_LENGTH,
} from "./constants";
import type { ActionRequest } from "./types";

const textEncoder = new TextEncoder();

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function u64le(n: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}

/**
 * Deterministic, environment-independent string ordering by raw UTF-8 bytes.
 * (Deliberately NOT `localeCompare`, whose result is locale-dependent and would
 * let signer and verifier disagree about byte order.)
 */
export function compareUtf8(a: string, b: string): number {
  const ab = textEncoder.encode(a);
  const bb = textEncoder.encode(b);
  const n = Math.min(ab.length, bb.length);
  for (let i = 0; i < n; i++) {
    const d = ab[i]! - bb[i]!;
    if (d !== 0) return d;
  }
  return ab.length - bb.length;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/**
 * Canonical, length-prefixed, little-endian encoding of an action request — the
 * exact bytes the agent signs and the verifier reconstructs. This is the single
 * source of truth for the wire format; both sides MUST call this function.
 *
 * Layout:
 * ```
 * [u32 LE len | "agent-passport:v1:request"]   domain-separation tag
 * [u8]                                          schema version
 * [32 bytes]                                     agent public key (raw)
 * [u64 LE]                                       timestamp (ms since epoch)
 * [u32 LE len | action]
 * [u32 LE len | resource]                        empty string if N/A
 * [u32 LE count]  params, keys sorted by UTF-8 bytes:
 *   ([u32 LE len | key][u32 LE len | value])*
 * ```
 */
export function encodeActionMessage(
  agentPublicKey: Uint8Array,
  request: ActionRequest,
): Uint8Array {
  if (agentPublicKey.length !== PUBLIC_KEY_LENGTH) {
    throw new Error(
      `agentPublicKey must be ${PUBLIC_KEY_LENGTH} bytes, got ${agentPublicKey.length}`,
    );
  }
  if (
    !Number.isInteger(request.timestamp) ||
    request.timestamp < 0 ||
    request.timestamp > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      "request.timestamp must be a non-negative integer (ms since epoch)",
    );
  }
  if (typeof request.action !== "string") {
    throw new Error("request.action must be a string");
  }

  const lp = (bytes: Uint8Array): Uint8Array[] => [u32le(bytes.length), bytes];
  const str = (s: string): Uint8Array[] => lp(textEncoder.encode(s));

  const chunks: Uint8Array[] = [];
  chunks.push(...str(ACTION_DOMAIN_TAG));
  chunks.push(Uint8Array.of(MESSAGE_SCHEMA_VERSION));
  chunks.push(agentPublicKey);
  chunks.push(u64le(request.timestamp));
  chunks.push(...str(request.action));
  chunks.push(...str(request.resource ?? ""));

  const params = request.params ?? {};
  const keys = Object.keys(params).sort(compareUtf8);
  chunks.push(u32le(keys.length));
  for (const k of keys) {
    chunks.push(...str(k));
    chunks.push(...str(params[k]!));
  }
  return concat(chunks);
}

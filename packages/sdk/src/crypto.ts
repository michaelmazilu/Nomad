import nacl from "tweetnacl";
import { encodeBase58, decodeBase58 } from "./base58";
import {
  PUBLIC_KEY_LENGTH,
  SECRET_KEY_LENGTH,
  SIGNATURE_LENGTH,
} from "./constants";

/**
 * Sign a message with an Ed25519 64-byte secret key (Solana keypair `secretKey`).
 * This is an Ed25519 *signing* operation, not a hash. The 64-byte form is the
 * 32-byte seed + 32-byte public key; passing the 32-byte seed alone is a common
 * silent bug, so we reject it loudly.
 */
export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  if (secretKey.length !== SECRET_KEY_LENGTH) {
    throw new Error(
      `secretKey must be ${SECRET_KEY_LENGTH} bytes (Ed25519 64-byte secret key); ` +
        `got ${secretKey.length}. The 32-byte seed alone is NOT sufficient.`,
    );
  }
  return nacl.sign.detached(message, secretKey);
}

/**
 * Verify a detached Ed25519 signature. Offline — no network, no Solana. Malformed
 * inputs (wrong-length signature/pubkey) are treated as invalid; this never throws,
 * so the verifier's signature step can rely on a clean boolean.
 */
export function verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (
    signature.length !== SIGNATURE_LENGTH ||
    publicKey.length !== PUBLIC_KEY_LENGTH
  ) {
    return false;
  }
  try {
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}

/** Base58 encode (Solana's address/signature encoding). */
export function toBase58(bytes: Uint8Array): string {
  return encodeBase58(bytes);
}

/** Base58 decode. Throws on invalid input. */
export function fromBase58(s: string): Uint8Array {
  return decodeBase58(s);
}

/** Decode Base58, returning null instead of throwing on malformed input. */
export function tryFromBase58(s: string): Uint8Array | null {
  try {
    return decodeBase58(s);
  } catch {
    return null;
  }
}

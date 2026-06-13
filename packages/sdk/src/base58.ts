/**
 * Self-contained Base58 (Bitcoin alphabet) codec — matches Solana's address /
 * signature encoding. Implemented here rather than via a dependency so the SDK
 * has no CJS/ESM interop surface for its base58 (the heavy web3.js dep is only
 * used by `cluster`/`pda`). Pure, deterministic, runs in browser and Node.
 */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const DECODE_MAP = (() => {
  const m = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) m[ALPHABET.charCodeAt(i)] = i;
  return m;
})();

export function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]!];
  return out;
}

export function decodeBase58(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;

  const bytes: number[] = [];
  for (let i = zeros; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const value = code < 128 ? DECODE_MAP[code]! : -1;
    if (value < 0) throw new Error(`invalid base58 character at index ${i}`);
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[zeros + bytes.length - 1 - i] = bytes[i]!;
  }
  return out;
}

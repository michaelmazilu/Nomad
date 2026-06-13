/**
 * Agent secret-key storage behind one interface.
 *
 * `PlaintextKeyStore` ships first and is HONESTLY not encrypted —
 * `chrome.storage.local` is plaintext on disk. `EncryptedKeyStore` (WebCrypto
 * AES-GCM with a PBKDF2 passphrase-derived key) drops in behind the same
 * interface; only then is "encrypted at rest" a true claim.
 *
 * The signer needs the 64-byte Ed25519 secret key (32-byte seed + 32-byte public
 * key); the 32-byte seed alone is not sufficient.
 */
export interface KeyStore {
  has(): Promise<boolean>;
  load(): Promise<Uint8Array | null>;
  save(secretKey: Uint8Array): Promise<void>;
  clear(): Promise<void>;
  /** Honest claim about whether the key is actually encrypted on disk. */
  readonly encryptedAtRest: boolean;
}

const SECRET_KEY_LEN = 64;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// WebCrypto's BufferSource type (TS 5.7+) rejects the ArrayBufferLike-generic
// Uint8Array; normalize to a fresh ArrayBuffer-backed view at the call boundary.
function bufferSource(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

/** Plaintext store — NOT encrypted at rest. Explicit by design. */
export class PlaintextKeyStore implements KeyStore {
  readonly encryptedAtRest = false;
  constructor(
    private readonly storageKey = "agentPassport.secretKey.plaintext",
  ) {}

  async has(): Promise<boolean> {
    return (await this.load()) !== null;
  }
  async load(): Promise<Uint8Array | null> {
    const got = await chrome.storage.local.get(this.storageKey);
    const value = got[this.storageKey];
    return typeof value === "string" ? base64ToBytes(value) : null;
  }
  async save(secretKey: Uint8Array): Promise<void> {
    if (secretKey.length !== SECRET_KEY_LEN) {
      throw new Error(`secretKey must be ${SECRET_KEY_LEN} bytes`);
    }
    await chrome.storage.local.set({
      [this.storageKey]: bytesToBase64(secretKey),
    });
  }
  async clear(): Promise<void> {
    await chrome.storage.local.remove(this.storageKey);
  }
}

interface EncryptedBlob {
  v: 1;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

/**
 * AES-GCM at rest, key derived from a user passphrase via PBKDF2. Call
 * `setPassphrase` to unlock before load/save; `lock` clears it from memory.
 */
export class EncryptedKeyStore implements KeyStore {
  readonly encryptedAtRest = true;
  private passphrase: string | null = null;

  constructor(
    private readonly storageKey = "agentPassport.secretKey.encrypted",
    private readonly iterations = 310_000,
  ) {}

  setPassphrase(passphrase: string): void {
    this.passphrase = passphrase;
  }
  lock(): void {
    this.passphrase = null;
  }
  private requirePassphrase(): string {
    if (this.passphrase === null) {
      throw new Error("key store is locked: call setPassphrase() first");
    }
    return this.passphrase;
  }

  private async deriveKey(
    passphrase: string,
    salt: Uint8Array,
    iterations: number,
  ): Promise<CryptoKey> {
    const base = await crypto.subtle.importKey(
      "raw",
      bufferSource(new TextEncoder().encode(passphrase)),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: bufferSource(salt), iterations, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async has(): Promise<boolean> {
    const got = await chrome.storage.local.get(this.storageKey);
    return got[this.storageKey] != null;
  }
  async save(secretKey: Uint8Array): Promise<void> {
    if (secretKey.length !== SECRET_KEY_LEN) {
      throw new Error(`secretKey must be ${SECRET_KEY_LEN} bytes`);
    }
    const passphrase = this.requirePassphrase();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(passphrase, salt, this.iterations);
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: bufferSource(iv) },
        key,
        bufferSource(secretKey),
      ),
    );
    const blob: EncryptedBlob = {
      v: 1,
      iter: this.iterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ct: bytesToBase64(ct),
    };
    await chrome.storage.local.set({ [this.storageKey]: blob });
  }
  async load(): Promise<Uint8Array | null> {
    const got = await chrome.storage.local.get(this.storageKey);
    const blob = got[this.storageKey] as EncryptedBlob | undefined;
    if (!blob) return null;
    const passphrase = this.requirePassphrase();
    const key = await this.deriveKey(
      passphrase,
      base64ToBytes(blob.salt),
      blob.iter,
    );
    try {
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bufferSource(base64ToBytes(blob.iv)) },
        key,
        bufferSource(base64ToBytes(blob.ct)),
      );
      return new Uint8Array(pt);
    } catch {
      throw new Error("decryption failed: wrong passphrase or corrupted data");
    }
  }
  async clear(): Promise<void> {
    await chrome.storage.local.remove(this.storageKey);
  }
}

/**
 * Typed errors for the owner-wallet / passport-write flow. Each maps to a
 * distinct, user-actionable failure so the popup can show a useful message
 * instead of a raw stack. `code` is a stable string the UI/tests can switch on.
 */

export type OwnerErrorCode =
  | "missing_wallet"
  | "wallet_rejected"
  | "network_mismatch"
  | "not_connected"
  | "rpc_error"
  | "invalid_permissions";

export class OwnerError extends Error {
  constructor(
    readonly code: OwnerErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OwnerError";
  }
}

/** Phantom (or any injected provider) is not available in the connector page. */
export class MissingWalletError extends OwnerError {
  constructor(
    message = "No Phantom wallet detected. Install Phantom and retry.",
  ) {
    super("missing_wallet", message);
    this.name = "MissingWalletError";
  }
}

/** The user dismissed/declined the Phantom signature or connect prompt. */
export class WalletRejectedError extends OwnerError {
  constructor(message = "Wallet request was rejected.", cause?: unknown) {
    super("wallet_rejected", message, cause);
    this.name = "WalletRejectedError";
  }
}

/**
 * The cluster the transaction was built for does not match the cluster the
 * wallet is operating on (or the extension's current selection). Submitting
 * anyway would send a transaction with a foreign blockhash to the wrong chain.
 */
export class NetworkMismatchError extends OwnerError {
  constructor(
    readonly expected: string,
    readonly actual: string,
    message = `Network mismatch: built for "${expected}" but wallet is on "${actual}".`,
  ) {
    super("network_mismatch", message);
    this.name = "NetworkMismatchError";
  }
}

/** A wallet operation was requested before connecting one. */
export class NotConnectedError extends OwnerError {
  constructor(message = "Connect an owner wallet first.") {
    super("not_connected", message);
    this.name = "NotConnectedError";
  }
}

/** An RPC call (blockhash fetch, submit, confirm) failed. */
export class RpcError extends OwnerError {
  constructor(message: string, cause?: unknown) {
    super("rpc_error", message, cause);
    this.name = "RpcError";
  }
}

/** Heuristic: did an error originate from a user declining a Phantom prompt? */
export function isUserRejection(err: unknown): boolean {
  if (err instanceof WalletRejectedError) return true;
  // Phantom raises `{ code: 4001 }` (EIP-1193 style) or a "User rejected" message.
  const e = err as { code?: number; message?: string } | null;
  if (!e) return false;
  if (e.code === 4001) return true;
  return (
    typeof e.message === "string" && /reject|denied|cancel/i.test(e.message)
  );
}

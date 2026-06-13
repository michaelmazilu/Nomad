import { Buffer } from "buffer";
import { Transaction } from "@solana/web3.js";

// @solana/web3.js (v1) expects a global Buffer in the browser.
const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;

/**
 * The Phantom connector page. The extension opens this in a tab with
 * `?ext=<extensionId>&req=<requestId>`; the page pulls the pending request from
 * the extension, performs the Phantom call (connect or sign-only), and pushes
 * the result back. All cross-context messaging goes through
 * `externally_connectable` — the extension only accepts messages from this
 * origin, and this page only sends to the extension id handed to it.
 */

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: {
    onlyIfTrusted?: boolean;
  }) => Promise<{ publicKey: { toString(): string } }>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
    phantom?: { solana?: PhantomProvider };
  }
}

const statusEl = document.getElementById("status") as HTMLDivElement;
const detailEl = document.getElementById("detail") as HTMLDivElement;

function setStatus(
  text: string,
  klass: "info" | "ok" | "error",
  detail = "",
): void {
  statusEl.textContent = text;
  statusEl.className = `status ${klass}`;
  detailEl.textContent = detail;
}

function getProvider(): PhantomProvider | undefined {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solana?.isPhantom) return window.solana;
  return undefined;
}

function sendToExtension<T = unknown>(extId: string, msg: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(extId, msg, (resp: T) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message ?? "extension messaging failed"));
        else resolve(resp);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isUserRejection(err: unknown): boolean {
  const e = err as { code?: number; message?: string } | null;
  if (!e) return false;
  if (e.code === 4001) return true;
  return (
    typeof e.message === "string" && /reject|denied|cancel/i.test(e.message)
  );
}

interface PullResponse {
  ok: boolean;
  action?: "connect" | "sign";
  cluster?: string;
  txBase64?: string;
  error?: string;
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const extId = params.get("ext");
  const req = params.get("req");
  if (!extId || !req) {
    setStatus(
      "Missing request parameters.",
      "error",
      "Open this page from the extension.",
    );
    return;
  }

  // Pull the pending request (and its transaction) from the extension.
  let pull: PullResponse;
  try {
    pull = await sendToExtension<PullResponse>(extId, {
      type: "CONNECTOR_PULL",
      req,
    });
  } catch (e) {
    setStatus(
      "Could not reach the extension.",
      "error",
      e instanceof Error ? e.message : String(e),
    );
    return;
  }
  if (!pull?.ok || !pull.action) {
    setStatus("Request not found or expired.", "error", pull?.error ?? "");
    return;
  }

  const provider = getProvider();
  if (!provider) {
    await sendToExtension(extId, {
      type: "CONNECTOR_PUSH",
      req,
      ok: false,
      code: "missing_wallet",
      error: "Phantom is not installed in this browser.",
    });
    setStatus(
      "Phantom not found.",
      "error",
      "Install Phantom (phantom.app) and retry.",
    );
    return;
  }

  try {
    if (pull.action === "connect") {
      setStatus("Approve the connection in Phantom…", "info");
      const { publicKey } = await provider.connect();
      await sendToExtension(extId, {
        type: "CONNECTOR_PUSH",
        req,
        ok: true,
        publicKey: publicKey.toString(),
        // Phantom does not expose its active cluster to dApps; report unknown.
        walletCluster: null,
      });
      setStatus(
        "Connected ✓",
        "ok",
        `${publicKey.toString()} — you can close this tab.`,
      );
      return;
    }

    // action === "sign"
    if (!pull.txBase64) throw new Error("no transaction to sign");
    setStatus(
      "Approve the transaction in Phantom…",
      "info",
      `cluster: ${pull.cluster ?? "?"}`,
    );
    await provider.connect({ onlyIfTrusted: false });
    const tx = Transaction.from(fromBase64(pull.txBase64));
    const signed = await provider.signTransaction(tx);
    const signedTxBase64 = toBase64(
      signed.serialize({ requireAllSignatures: false }),
    );
    await sendToExtension(extId, {
      type: "CONNECTOR_PUSH",
      req,
      ok: true,
      signedTxBase64,
    });
    setStatus(
      "Signed ✓",
      "ok",
      "Returned the signature to the extension. You can close this tab.",
    );
  } catch (e) {
    const rejected = isUserRejection(e);
    await sendToExtension(extId, {
      type: "CONNECTOR_PUSH",
      req,
      ok: false,
      ...(rejected ? { code: "wallet_rejected" } : {}),
      error: e instanceof Error ? e.message : String(e),
    });
    setStatus(
      rejected ? "Request rejected in Phantom." : "Phantom request failed.",
      "error",
      e instanceof Error ? e.message : String(e),
    );
  }
}

void main();

import { Buffer } from "buffer";
import {
  AddressType,
  BrowserSDK,
  type ISolanaChain,
  type WalletAddress,
} from "@phantom/browser-sdk";
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

interface PhantomWindow {
  solana?: PhantomProvider;
  phantom?: { solana?: PhantomProvider };
}

type ConnectorAction = "connect" | "sign" | "sign_and_send";
type WalletProviderKind = "embedded" | "injected";
type EmbeddedAuthProvider = "google" | "apple";
type SdkSolanaTransaction = Parameters<
  ISolanaChain["signAndSendTransaction"]
>[0];

const statusEl = document.getElementById("status") as HTMLDivElement;
const detailEl = document.getElementById("detail") as HTMLDivElement;
const viteEnv =
  (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env ?? {};
const phantomAppId = viteEnv.VITE_PHANTOM_APP_ID?.trim() || null;
const embeddedAuthProvider: EmbeddedAuthProvider =
  viteEnv.VITE_PHANTOM_AUTH_PROVIDER === "apple" ? "apple" : "google";

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
  const w = window as unknown as PhantomWindow;
  if (w.phantom?.solana?.isPhantom) return w.phantom.solana;
  if (w.solana?.isPhantom) return w.solana;
  return undefined;
}

function createSdk(): BrowserSDK {
  if (phantomAppId) {
    return new BrowserSDK({
      providers: ["google", "apple", "injected"],
      addressTypes: [AddressType.solana],
      appId: phantomAppId,
      authOptions: {
        redirectUrl: location.href,
      },
    });
  }
  return new BrowserSDK({
    providers: ["injected"],
    addressTypes: [AddressType.solana],
  });
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

async function connectFast(
  provider: PhantomProvider,
): Promise<{ publicKey: { toString(): string } }> {
  try {
    setStatus("Checking Phantom session...", "info");
    return await provider.connect({ onlyIfTrusted: true });
  } catch {
    setStatus("Approve the connection in Phantom...", "info");
    return provider.connect();
  }
}

function solanaAddress(addresses: WalletAddress[]): string | null {
  return (
    addresses.find((addr) => addr.addressType === AddressType.solana)
      ?.address ?? null
  );
}

function sdkProviderKind(sdk: BrowserSDK): WalletProviderKind {
  return sdk.getCurrentProviderInfo()?.type === "injected"
    ? "injected"
    : "embedded";
}

function sdkPublicKey(
  sdk: BrowserSDK,
  addresses: WalletAddress[] = [],
): string {
  const publicKey =
    solanaAddress(addresses) ??
    solanaAddress(sdk.getAddresses()) ??
    sdk.solana.publicKey;
  if (!publicKey) throw new Error("Phantom returned no Solana address.");
  return publicKey;
}

async function connectSdkFast(): Promise<{
  sdk: BrowserSDK;
  publicKey: string;
  providerKind: WalletProviderKind;
}> {
  if (!phantomAppId) {
    throw new Error("Set VITE_PHANTOM_APP_ID to enable Phantom Connect.");
  }

  const sdk = createSdk();
  try {
    setStatus("Checking Phantom session...", "info");
    await sdk.autoConnect();
    if (sdk.isConnected()) {
      return {
        sdk,
        publicKey: sdkPublicKey(sdk),
        providerKind: sdkProviderKind(sdk),
      };
    }
  } catch {
    // No existing Phantom Connect session; continue to the fastest new-user path.
  }

  setStatus(
    "Continue with Phantom...",
    "info",
    `Signing in with ${embeddedAuthProvider}.`,
  );
  const result = await sdk.connect({ provider: embeddedAuthProvider });
  return {
    sdk,
    publicKey: sdkPublicKey(sdk, result.addresses),
    providerKind: sdkProviderKind(sdk),
  };
}

function toSdkNetwork(cluster: string | undefined): "devnet" | "mainnet" {
  if (cluster === "devnet") return "devnet";
  if (cluster === "mainnet-beta") return "mainnet";
  throw new Error(
    "Embedded Phantom wallets cannot submit localnet transactions; switch to devnet or mainnet-beta.",
  );
}

function closeSoon(): void {
  window.setTimeout(() => {
    window.close();
  }, 650);
}

interface PullResponse {
  ok: boolean;
  action?: ConnectorAction;
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

  try {
    if (pull.action === "connect") {
      const connected = phantomAppId
        ? await connectSdkFast()
        : await (async () => {
            const provider = getProvider();
            if (!provider)
              throw new Error("Phantom is not installed in this browser.");
            const { publicKey } = await connectFast(provider);
            return {
              publicKey: publicKey.toString(),
              providerKind: "injected" as const,
            };
          })();
      await sendToExtension(extId, {
        type: "CONNECTOR_PUSH",
        req,
        ok: true,
        publicKey: connected.publicKey,
        providerKind: connected.providerKind,
        // Phantom does not expose its active cluster to dApps; report unknown.
        walletCluster: null,
      });
      setStatus(
        "Connected",
        "ok",
        `${connected.publicKey} - returning to Nomad...`,
      );
      closeSoon();
      return;
    }

    if (!pull.txBase64) throw new Error("no transaction to sign");

    if (pull.action === "sign_and_send") {
      const { sdk } = await connectSdkFast();
      const network = toSdkNetwork(pull.cluster);
      setStatus(
        "Preparing Phantom transaction...",
        "info",
        `cluster: ${pull.cluster ?? "?"}`,
      );
      await sdk.solana.switchNetwork(network);
      setStatus(
        "Approve the transaction in Phantom...",
        "info",
        `cluster: ${pull.cluster ?? "?"}`,
      );
      const tx = Transaction.from(fromBase64(pull.txBase64));
      const result = await sdk.solana.signAndSendTransaction(
        tx as unknown as SdkSolanaTransaction,
      );
      await sendToExtension(extId, {
        type: "CONNECTOR_PUSH",
        req,
        ok: true,
        txSig: result.signature,
      });
      setStatus("Submitted", "ok", "Transaction sent. Closing...");
      closeSoon();
      return;
    }

    // action === "sign"
    const provider = getProvider();
    if (!provider) throw new Error("Phantom is not installed in this browser.");
    setStatus(
      "Checking Phantom session...",
      "info",
      `cluster: ${pull.cluster ?? "?"}`,
    );
    await connectFast(provider);
    setStatus(
      "Approve the transaction in Phantom...",
      "info",
      `cluster: ${pull.cluster ?? "?"}`,
    );
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
    setStatus("Signed", "ok", "Returned the signature to Nomad. Closing...");
    closeSoon();
  } catch (e) {
    const rejected = isUserRejection(e);
    const missingWallet =
      e instanceof Error && /not installed|not found/i.test(e.message);
    await sendToExtension(extId, {
      type: "CONNECTOR_PUSH",
      req,
      ok: false,
      ...(rejected
        ? { code: "wallet_rejected" }
        : missingWallet
          ? { code: "missing_wallet" }
          : {}),
      error: e instanceof Error ? e.message : String(e),
    });
    setStatus(
      missingWallet
        ? "Phantom not found."
        : rejected
          ? "Request rejected in Phantom."
          : "Phantom request failed.",
      "error",
      e instanceof Error ? e.message : String(e),
    );
  }
}

void main();

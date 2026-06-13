import type { Cluster } from "@agent-passport/sdk";
import {
  MissingWalletError,
  NetworkMismatchError,
  OwnerError,
  WalletRejectedError,
} from "./errors";

/**
 * Phantom can only be reached from a normal web page (it injects `window.solana`
 * into http/https origins, not into a chrome-extension:// popup or the service
 * worker). So all Phantom interaction happens in a small "connector" web page;
 * this module is the extension-side half of that bridge.
 *
 * The bridge NEVER sees a private key. The connector asks Phantom to connect
 * (public key only) or to SIGN an already-built transaction; the signed bytes
 * come back, and the extension submits them. Phantom signs, never sends.
 */
export interface PhantomBridge {
  /** Connect Phantom and return its public key (+ the cluster it reports, if any). */
  connect(
    cluster: Cluster,
  ): Promise<{ publicKey: string; walletCluster: Cluster | null }>;
  /** Ask Phantom to sign (not send) a serialized transaction; returns signed base64. */
  signTransaction(unsignedTxBase64: string, cluster: Cluster): Promise<string>;
}

/** Throw if the wallet's reported cluster disagrees with what we built for. */
export function assertNetworkMatch(
  expected: Cluster,
  actual: Cluster | null,
): void {
  if (actual != null && actual !== expected) {
    throw new NetworkMismatchError(expected, actual);
  }
}

type ConnectorAction = "connect" | "sign";

interface PendingRequest {
  action: ConnectorAction;
  cluster: Cluster;
  txBase64?: string;
  resolve: (value: ConnectorResult) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ConnectorResult {
  publicKey?: string;
  walletCluster?: Cluster | null;
  signedTxBase64?: string;
}

/** Messages the connector page sends back to the extension (externally_connectable). */
export type ConnectorMessage =
  | { type: "CONNECTOR_PULL"; req: string }
  | {
      type: "CONNECTOR_PUSH";
      req: string;
      ok: true;
      publicKey?: string;
      walletCluster?: Cluster | null;
      signedTxBase64?: string;
    }
  | {
      type: "CONNECTOR_PUSH";
      req: string;
      ok: false;
      code?: string;
      error: string;
    };

export type ConnectorReply =
  | { handled: false }
  | { handled: true; response: unknown };

/** Map a connector-reported failure code to a typed error. */
function toError(code: string | undefined, message: string): unknown {
  switch (code) {
    case "missing_wallet":
      return new MissingWalletError(message);
    case "wallet_rejected":
      return new WalletRejectedError(message);
    default:
      return new OwnerError("wallet_rejected", message);
  }
}

/**
 * Drives Phantom by opening the connector page in a tab and exchanging messages
 * with it. The connector pulls the pending request, performs the Phantom call,
 * and pushes the result back; `handleConnectorMessage` is fed those messages by
 * the background's `onMessageExternal` listener.
 */
export class TabPhantomBridge implements PhantomBridge {
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly connectorUrl: string,
    private readonly extensionId: string,
    private readonly openTab: (url: string) => Promise<void>,
    private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly timeoutMs = 180_000,
  ) {}

  connect(
    cluster: Cluster,
  ): Promise<{ publicKey: string; walletCluster: Cluster | null }> {
    return this.run("connect", cluster).then((r) => {
      if (!r.publicKey)
        throw new OwnerError(
          "wallet_rejected",
          "wallet returned no public key",
        );
      return { publicKey: r.publicKey, walletCluster: r.walletCluster ?? null };
    });
  }

  signTransaction(unsignedTxBase64: string, cluster: Cluster): Promise<string> {
    return this.run("sign", cluster, unsignedTxBase64).then((r) => {
      if (!r.signedTxBase64)
        throw new OwnerError("wallet_rejected", "wallet returned no signature");
      return r.signedTxBase64;
    });
  }

  private run(
    action: ConnectorAction,
    cluster: Cluster,
    txBase64?: string,
  ): Promise<ConnectorResult> {
    const req = this.newId();
    return new Promise<ConnectorResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req);
        reject(new WalletRejectedError("Timed out waiting for the wallet."));
      }, this.timeoutMs);
      this.pending.set(req, {
        action,
        cluster,
        txBase64,
        resolve,
        reject,
        timer,
      });
      const url = `${this.connectorUrl}?ext=${encodeURIComponent(this.extensionId)}&req=${encodeURIComponent(req)}&action=${action}&cluster=${cluster}`;
      this.openTab(url).catch((e) => {
        this.settle(req, undefined, e);
      });
    });
  }

  /** Feed a message from the connector page. Returns the reply for sendResponse. */
  handleConnectorMessage(msg: ConnectorMessage): ConnectorReply {
    if (msg?.type === "CONNECTOR_PULL") {
      const p = this.pending.get(msg.req);
      if (!p)
        return {
          handled: true,
          response: { ok: false, error: "unknown request" },
        };
      return {
        handled: true,
        response: {
          ok: true,
          action: p.action,
          cluster: p.cluster,
          txBase64: p.txBase64,
        },
      };
    }
    if (msg?.type === "CONNECTOR_PUSH") {
      if (!this.pending.has(msg.req)) {
        return {
          handled: true,
          response: { ok: false, error: "unknown request" },
        };
      }
      if (msg.ok) {
        this.settle(msg.req, {
          publicKey: msg.publicKey,
          walletCluster: msg.walletCluster ?? null,
          signedTxBase64: msg.signedTxBase64,
        });
      } else {
        this.settle(msg.req, undefined, toError(msg.code, msg.error));
      }
      return { handled: true, response: { ok: true } };
    }
    return { handled: false };
  }

  private settle(req: string, value?: ConnectorResult, err?: unknown): void {
    const p = this.pending.get(req);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(req);
    if (err !== undefined) p.reject(err);
    else p.resolve(value ?? {});
  }
}

import "./polyfill";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  decodePassport,
  derivePassportPda,
  getClusterConfig,
  type Cluster,
} from "@agent-passport/sdk";
import { createVerifier } from "@agent-passport/verifier";
import { PlaintextKeyStore } from "./keystore";
import { AgentKeyManager } from "./agent";
import { OwnerWallet } from "./wallet";
import { PassportClient } from "./passportClient";
import {
  LocalOwnerSigner,
  PhantomOwnerSigner,
  type OwnerSigner,
} from "./ownerSigner";
import { TabPhantomBridge, type ConnectorMessage } from "./phantom";
import { NotConnectedError, RpcError } from "./errors";
import { CONNECTOR_URL } from "./config";
import type {
  AgentInfo,
  AirdropResult,
  AttemptResult,
  Msg,
  OwnerInfo,
  OwnerMode,
  PassportInfo,
  TxResult,
} from "./messages";

// Both keys live ONLY here, in the service worker, behind the KeyStore. The popup
// is a thin UI that messages this worker — keys never enter the popup DOM. The
// agent key signs action requests; the LOCAL owner key (dev-only) signs passport
// writes. The real owner path is Phantom, whose key never enters the extension.
const agent = new AgentKeyManager(
  new PlaintextKeyStore("agentPassport.agentKey"),
);
const localOwner = new OwnerWallet(
  new PlaintextKeyStore("agentPassport.ownerKey"),
);

const PHANTOM_KEY = "agentPassport.phantom";
interface PhantomConnection {
  publicKey: string;
  walletCluster: Cluster | null;
}

let bridgeSingleton: TabPhantomBridge | null = null;
function bridge(): TabPhantomBridge {
  if (!bridgeSingleton) {
    bridgeSingleton = new TabPhantomBridge(
      CONNECTOR_URL,
      chrome.runtime.id,
      async (url) => {
        await chrome.tabs.create({ url });
      },
    );
  }
  return bridgeSingleton;
}

const connect = (cluster: Cluster): Connection =>
  new Connection(getClusterConfig(cluster).rpcUrl, "confirmed");

async function loadPhantom(): Promise<PhantomConnection | null> {
  const got = await chrome.storage.local.get(PHANTOM_KEY);
  return (got[PHANTOM_KEY] as PhantomConnection | undefined) ?? null;
}
async function savePhantom(conn: PhantomConnection): Promise<void> {
  await chrome.storage.local.set({ [PHANTOM_KEY]: conn });
}

async function getBalance(cluster: Cluster, pubkey: string): Promise<number> {
  try {
    return (
      (await connect(cluster).getBalance(new PublicKey(pubkey))) /
      LAMPORTS_PER_SOL
    );
  } catch {
    return 0; // balance is display-only; don't fail the whole refresh on an RPC blip
  }
}

async function ownerAddress(mode: OwnerMode): Promise<string | null> {
  return mode === "local"
    ? localOwner.getPublicKey()
    : ((await loadPhantom())?.publicKey ?? null);
}

/** Resolve the active owner signer. Phantom never exposes its key to us. */
async function ownerSigner(
  mode: OwnerMode,
  cluster: Cluster,
): Promise<OwnerSigner> {
  if (mode === "local") return new LocalOwnerSigner(await localOwner.keypair());
  const conn = await loadPhantom();
  if (!conn)
    throw new NotConnectedError(
      "Connect Phantom before signing a passport write.",
    );
  return new PhantomOwnerSigner(
    bridge(),
    new PublicKey(conn.publicKey),
    cluster,
    conn.walletCluster,
  );
}

async function readPassport(
  cluster: Cluster,
): Promise<PassportInfo["passport"]> {
  const agentPk = await agent.getPublicKey();
  if (!agentPk) return null;
  const cfg = getClusterConfig(cluster);
  const [pda] = derivePassportPda(
    new PublicKey(agentPk),
    new PublicKey(cfg.programId),
  );
  const info = await new Connection(cfg.rpcUrl, "confirmed").getAccountInfo(
    pda,
  );
  if (!info) return null;
  const p = decodePassport(Uint8Array.from(info.data));
  return { scopes: p.permissions, label: p.label };
}

async function handle(msg: Msg): Promise<unknown> {
  switch (msg.type) {
    case "AGENT_ENSURE":
      return { agentPublicKey: await agent.getOrCreate() } satisfies AgentInfo;
    case "AGENT_GET":
      return { agentPublicKey: await agent.getPublicKey() } satisfies AgentInfo;

    case "PHANTOM_CONNECT": {
      const { publicKey, walletCluster } = await bridge().connect(msg.cluster);
      await savePhantom({ publicKey, walletCluster });
      const balanceSol = await getBalance(msg.cluster, publicKey);
      return {
        kind: "phantom",
        ownerPublicKey: publicKey,
        balanceSol,
        walletCluster,
      } satisfies OwnerInfo;
    }
    case "OWNER_LOCAL_ENSURE": {
      const ownerPublicKey = await localOwner.getOrCreate();
      return {
        kind: "local",
        ownerPublicKey,
        balanceSol: 0,
      } satisfies OwnerInfo;
    }
    case "OWNER_GET": {
      const ownerPublicKey = await ownerAddress(msg.mode);
      const balanceSol = ownerPublicKey
        ? await getBalance(msg.cluster, ownerPublicKey)
        : 0;
      const walletCluster =
        msg.mode === "phantom"
          ? ((await loadPhantom())?.walletCluster ?? null)
          : null;
      return {
        kind: ownerPublicKey ? msg.mode : null,
        ownerPublicKey,
        balanceSol,
        walletCluster,
      } satisfies OwnerInfo;
    }
    case "OWNER_AIRDROP": {
      const addr = await ownerAddress(msg.mode);
      if (!addr) throw new NotConnectedError("No owner wallet to airdrop to.");
      const c = connect(msg.cluster);
      let txSig: string;
      try {
        txSig = await c.requestAirdrop(
          new PublicKey(addr),
          2 * LAMPORTS_PER_SOL,
        );
        await c.confirmTransaction(txSig, "confirmed");
      } catch (e) {
        throw new RpcError(
          "airdrop failed (devnet faucet limits, or localnet not running)",
          e,
        );
      }
      const balanceSol =
        (await c.getBalance(new PublicKey(addr))) / LAMPORTS_PER_SOL;
      return { balanceSol, txSig } satisfies AirdropResult;
    }

    case "PASSPORT_READ":
      return {
        passport: await readPassport(msg.cluster),
      } satisfies PassportInfo;
    case "PASSPORT_CREATE": {
      const agentPk = await agent.getOrCreate();
      const owner = await ownerSigner(msg.mode, msg.cluster);
      const client = new PassportClient(msg.cluster);
      const txSig = await client.initialize(
        owner,
        new PublicKey(agentPk),
        msg.label,
        msg.scopes,
      );
      return { txSig, cluster: msg.cluster } satisfies TxResult;
    }
    case "PASSPORT_UPDATE": {
      const agentPk = await agent.getOrCreate();
      const owner = await ownerSigner(msg.mode, msg.cluster);
      const client = new PassportClient(msg.cluster);
      const txSig = await client.update(
        owner,
        new PublicKey(agentPk),
        msg.label,
        msg.scopes,
      );
      return { txSig, cluster: msg.cluster } satisfies TxResult;
    }
    case "PASSPORT_REVOKE": {
      const agentPk = await agent.getOrCreate();
      const owner = await ownerSigner(msg.mode, msg.cluster);
      const client = new PassportClient(msg.cluster);
      const txSig = await client.revoke(owner, new PublicKey(agentPk));
      return { txSig, cluster: msg.cluster } satisfies TxResult;
    }

    case "ATTEMPT_ACTION": {
      // The agent signs the action; the verifier checks it against the live
      // on-chain passport and returns the real decision.
      const signed = await agent.signAction({
        action: msg.action,
        timestamp: Date.now(),
      });
      const result = await createVerifier({ cluster: msg.cluster }).verify(
        signed,
      );
      return {
        status: result.status,
        reason: result.reason,
        scopes: result.passport?.permissions ?? null,
        signed,
      } satisfies AttemptResult;
    }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg as Msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) =>
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  return true; // async response
});

// External messages come from (a) the Phantom connector page relaying connect /
// sign results, and (b) agent web pages doing read-only action attempts. Writes
// and key export are never allowed from outside.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  const connectorReply = bridge().handleConnectorMessage(
    msg as ConnectorMessage,
  );
  if (connectorReply.handled) {
    sendResponse(connectorReply.response);
    return false;
  }
  const m = msg as Msg;
  if (m.type === "ATTEMPT_ACTION" || m.type === "AGENT_GET") {
    handle(m)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) =>
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    return true;
  }
  sendResponse({ ok: false, error: "request type not allowed externally" });
  return false;
});

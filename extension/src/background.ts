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
import type {
  AgentInfo,
  AirdropResult,
  AttemptResult,
  Msg,
  OwnerInfo,
  PassportInfo,
  TxResult,
} from "./messages";

// Both keys live ONLY here, in the service worker, behind the KeyStore. The popup
// is a thin UI that messages this worker — keys never enter the popup DOM. Swap
// PlaintextKeyStore for EncryptedKeyStore (+ unlock) to encrypt them at rest.
const agent = new AgentKeyManager(new PlaintextKeyStore("agentPassport.agentKey"));
const owner = new OwnerWallet(new PlaintextKeyStore("agentPassport.ownerKey"));

const connect = (cluster: Cluster): Connection =>
  new Connection(getClusterConfig(cluster).rpcUrl, "confirmed");

async function readPassport(cluster: Cluster): Promise<PassportInfo["passport"]> {
  const agentPk = await agent.getPublicKey();
  if (!agentPk) return null;
  const cfg = getClusterConfig(cluster);
  const [pda] = derivePassportPda(new PublicKey(agentPk), new PublicKey(cfg.programId));
  const info = await new Connection(cfg.rpcUrl, "confirmed").getAccountInfo(pda);
  if (!info) return null;
  const p = decodePassport(Uint8Array.from(info.data));
  return { scopes: p.permissions, label: p.label };
}

async function passportClient(cluster: Cluster): Promise<PassportClient> {
  return new PassportClient(await owner.keypair(), cluster);
}

async function handle(msg: Msg): Promise<unknown> {
  switch (msg.type) {
    case "AGENT_ENSURE":
      return { agentPublicKey: await agent.getOrCreate() } satisfies AgentInfo;
    case "AGENT_GET":
      return { agentPublicKey: await agent.getPublicKey() } satisfies AgentInfo;
    case "OWNER_ENSURE":
      return { ownerPublicKey: await owner.getOrCreate(), balanceSol: 0 } satisfies OwnerInfo;
    case "OWNER_GET": {
      const ownerPublicKey = await owner.getPublicKey();
      const balanceSol = ownerPublicKey
        ? (await connect(msg.cluster).getBalance(new PublicKey(ownerPublicKey))) /
          LAMPORTS_PER_SOL
        : 0;
      return { ownerPublicKey, balanceSol } satisfies OwnerInfo;
    }
    case "OWNER_AIRDROP": {
      const kp = await owner.keypair();
      const c = connect(msg.cluster);
      const txSig = await c.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await c.confirmTransaction(txSig, "confirmed");
      const balanceSol = (await c.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
      return { balanceSol, txSig } satisfies AirdropResult;
    }
    case "PASSPORT_READ":
      return { passport: await readPassport(msg.cluster) } satisfies PassportInfo;
    case "PASSPORT_CREATE": {
      const agentPk = await agent.getOrCreate();
      const client = await passportClient(msg.cluster);
      return { txSig: await client.initialize(new PublicKey(agentPk), msg.label, msg.scopes) } satisfies TxResult;
    }
    case "PASSPORT_UPDATE": {
      const agentPk = await agent.getOrCreate();
      const client = await passportClient(msg.cluster);
      return { txSig: await client.update(new PublicKey(agentPk), msg.label, msg.scopes) } satisfies TxResult;
    }
    case "PASSPORT_REVOKE": {
      const agentPk = await agent.getOrCreate();
      const client = await passportClient(msg.cluster);
      return { txSig: await client.revoke(new PublicKey(agentPk)) } satisfies TxResult;
    }
    case "ATTEMPT_ACTION": {
      // The agent signs the action; the verifier checks it against the live
      // on-chain passport and returns the real decision.
      const signed = await agent.signAction({ action: msg.action, timestamp: Date.now() });
      const result = await createVerifier({ cluster: msg.cluster }).verify(signed);
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
    .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  return true; // async response
});

// Web pages (agents) in `externally_connectable` may only read the pubkey and
// attempt actions — never trigger writes or export keys.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  const m = msg as Msg;
  if (m.type === "ATTEMPT_ACTION" || m.type === "AGENT_GET") {
    handle(m)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  }
  sendResponse({ ok: false, error: "request type not allowed externally" });
  return false;
});

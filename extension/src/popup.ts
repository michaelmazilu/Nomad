import type { Cluster } from "@agent-passport/sdk";
import type {
  AgentInfo,
  AirdropResult,
  AttemptResult,
  Msg,
  OwnerInfo,
  PassportInfo,
  Response,
  TxResult,
} from "./messages";

const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const hasExtensionRuntime = (): boolean =>
  typeof chrome !== "undefined" &&
  typeof chrome.runtime?.sendMessage === "function";

function log(message: string): void {
  const pre = el("log");
  pre.textContent = `${new Date().toISOString()}  ${message}\n${pre.textContent ?? ""}`;
}

/** Send a message to the background worker; throws on a structured error. */
async function send<T>(msg: Msg): Promise<T> {
  if (!hasExtensionRuntime()) {
    throw new Error("Nomad extension runtime unavailable");
  }
  const res: Response = await chrome.runtime.sendMessage(msg);
  if (!res.ok) throw new Error(res.error);
  return res.data as T;
}

const cluster = (): Cluster =>
  el<HTMLSelectElement>("cluster").value as Cluster;

const scopes = (): string[] =>
  el<HTMLTextAreaElement>("permissions")
    .value.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

async function withErrors(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    log(`error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function showVerdict(result: AttemptResult): void {
  const v = el("verdict");
  const klass =
    result.status === "ok"
      ? "ok"
      : result.status === "not_permitted" || result.status === "no_passport"
        ? "deny"
        : "warn";
  const scopeNote = result.scopes
    ? ` — agent scopes: [${result.scopes.join(", ")}]`
    : "";
  v.textContent = `${result.status.toUpperCase()}${result.reason ? ` — ${result.reason}` : ""}${scopeNote}`;
  v.className = `verdict ${klass}`;
  v.style.display = "block";
}

async function refresh(): Promise<void> {
  const a = await send<AgentInfo>({ type: "AGENT_GET" });
  el("agentPubkey").textContent = a.agentPublicKey ?? "none";
  const o = await send<OwnerInfo>({ type: "OWNER_GET", cluster: cluster() });
  el("ownerPubkey").textContent = o.ownerPublicKey ?? "none";
  el("ownerBalance").textContent = o.balanceSol.toFixed(4);
}

el("cluster").addEventListener("change", () => void withErrors(refresh));

el("ensureAgent").addEventListener("click", () =>
  withErrors(async () => {
    const { agentPublicKey } = await send<AgentInfo>({ type: "AGENT_ENSURE" });
    el("agentPubkey").textContent = agentPublicKey ?? "none";
    log(`agent ready: ${agentPublicKey}`);
  }),
);

el("ensureOwner").addEventListener("click", () =>
  withErrors(async () => {
    await send<OwnerInfo>({ type: "OWNER_ENSURE" });
    await refresh();
    log("owner wallet ready");
  }),
);

el("airdrop").addEventListener("click", () =>
  withErrors(async () => {
    const r = await send<AirdropResult>({
      type: "OWNER_AIRDROP",
      cluster: cluster(),
    });
    el("ownerBalance").textContent = r.balanceSol.toFixed(4);
    log(`airdrop ok, balance ${r.balanceSol} SOL`);
  }),
);

el("createPassport").addEventListener("click", () =>
  withErrors(async () => {
    const r = await send<TxResult>({
      type: "PASSPORT_CREATE",
      cluster: cluster(),
      label: el<HTMLInputElement>("label").value,
      scopes: scopes(),
    });
    log(`passport created: ${r.txSig}`);
  }),
);

el("updatePassport").addEventListener("click", () =>
  withErrors(async () => {
    const label = el<HTMLInputElement>("label").value;
    const r = await send<TxResult>({
      type: "PASSPORT_UPDATE",
      cluster: cluster(),
      label: label || null,
      scopes: scopes(),
    });
    log(`passport updated: ${r.txSig}`);
  }),
);

el("revokePassport").addEventListener("click", () =>
  withErrors(async () => {
    const r = await send<TxResult>({
      type: "PASSPORT_REVOKE",
      cluster: cluster(),
    });
    log(`passport revoked: ${r.txSig}`);
  }),
);

el("loadPassport").addEventListener("click", () =>
  withErrors(async () => {
    const { passport } = await send<PassportInfo>({
      type: "PASSPORT_READ",
      cluster: cluster(),
    });
    if (!passport) {
      el("onchainScopes").textContent = "none (no passport on this cluster)";
      log("no passport found on chain for this agent");
      return;
    }
    el("onchainScopes").textContent = passport.scopes.join(", ") || "(empty)";
    el<HTMLTextAreaElement>("permissions").value = passport.scopes.join("\n");
    log(
      `loaded ${passport.scopes.length} scope(s) from chain (label: ${passport.label})`,
    );
  }),
);

el("attemptAction").addEventListener("click", () =>
  withErrors(async () => {
    const action = el<HTMLInputElement>("action").value || "calendar.read";
    const result = await send<AttemptResult>({
      type: "ATTEMPT_ACTION",
      cluster: cluster(),
      action,
    });
    showVerdict(result);
    log(`attempt "${action}" -> ${result.status}`);
  }),
);

if (hasExtensionRuntime()) {
  void withErrors(refresh);
}

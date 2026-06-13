import { validatePermissions, type Cluster } from "@agent-passport/sdk";
import type {
  AgentInfo,
  AirdropResult,
  AttemptResult,
  Msg,
  OwnerInfo,
  OwnerMode,
  PassportInfo,
  Response,
  TxResult,
} from "./messages";

const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

function log(message: string): void {
  const pre = el("log");
  pre.textContent = `${new Date().toISOString()}  ${message}\n${pre.textContent ?? ""}`;
}

/** Send a message to the background worker; throws on a structured error. */
async function send<T>(msg: Msg): Promise<T> {
  const res: Response = await chrome.runtime.sendMessage(msg);
  if (!res.ok) throw new Error(res.error);
  return res.data as T;
}

const cluster = (): Cluster =>
  el<HTMLSelectElement>("cluster").value as Cluster;
const ownerMode = (): OwnerMode =>
  el<HTMLSelectElement>("ownerMode").value as OwnerMode;

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

function showTx(text: string, klass: "pending" | "ok" | "error"): void {
  const s = el("txStatus");
  s.textContent = text;
  s.className = `status ${klass}`;
  s.style.display = "block";
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

/** Reject early — before any signature is requested — if scopes are malformed. */
function ensureValidScopes(list: string[]): void {
  const result = validatePermissions(list);
  if (!result.ok)
    throw new Error(`invalid permissions: ${result.errors.join("; ")}`);
}

function applyOwnerInfo(o: OwnerInfo): void {
  el("ownerPubkey").textContent = o.ownerPublicKey ?? "none";
  el("ownerBalance").textContent = o.balanceSol.toFixed(4);
  const warn = el("ownerWarn");
  if (o.walletCluster && o.walletCluster !== cluster()) {
    warn.textContent = `⚠ Phantom is on "${o.walletCluster}" but "${cluster()}" is selected — signing will be blocked.`;
  } else {
    warn.textContent = "";
  }
}

function syncOwnerControls(): void {
  const phantom = ownerMode() === "phantom";
  el("connectOwner").textContent = phantom
    ? "Connect Phantom"
    : "Create / load local wallet";
  el("ownerHint").textContent = phantom
    ? "Phantom signs & pays for passport writes; its private key never enters the extension."
    : "DEV ONLY: a keypair generated and stored inside the extension. Do not use for real funds.";
}

async function refresh(): Promise<void> {
  const a = await send<AgentInfo>({ type: "AGENT_GET" });
  el("agentPubkey").textContent = a.agentPublicKey ?? "none";
  const o = await send<OwnerInfo>({
    type: "OWNER_GET",
    cluster: cluster(),
    mode: ownerMode(),
  });
  applyOwnerInfo(o);
}

el("cluster").addEventListener("change", () => void withErrors(refresh));
el("ownerMode").addEventListener("change", () => {
  syncOwnerControls();
  void withErrors(refresh);
});

el("ensureAgent").addEventListener("click", () =>
  withErrors(async () => {
    const { agentPublicKey } = await send<AgentInfo>({ type: "AGENT_ENSURE" });
    el("agentPubkey").textContent = agentPublicKey ?? "none";
    log(`agent ready: ${agentPublicKey}`);
  }),
);

el("connectOwner").addEventListener("click", () =>
  withErrors(async () => {
    if (ownerMode() === "phantom") {
      log("opening Phantom connector tab — approve the connection there…");
      const o = await send<OwnerInfo>({
        type: "PHANTOM_CONNECT",
        cluster: cluster(),
      });
      applyOwnerInfo(o);
      log(`Phantom connected: ${o.ownerPublicKey}`);
    } else {
      const o = await send<OwnerInfo>({ type: "OWNER_LOCAL_ENSURE" });
      applyOwnerInfo(o);
      log(`local dev wallet ready: ${o.ownerPublicKey}`);
      await refresh();
    }
  }),
);

el("airdrop").addEventListener("click", () =>
  withErrors(async () => {
    const r = await send<AirdropResult>({
      type: "OWNER_AIRDROP",
      cluster: cluster(),
      mode: ownerMode(),
    });
    el("ownerBalance").textContent = r.balanceSol.toFixed(4);
    log(`airdrop ok, balance ${r.balanceSol} SOL`);
  }),
);

el("createPassport").addEventListener("click", () =>
  withErrors(async () => {
    const list = scopes();
    ensureValidScopes(list);
    showTx("Submitting create… approve in Phantom if prompted.", "pending");
    const r = await send<TxResult>({
      type: "PASSPORT_CREATE",
      cluster: cluster(),
      mode: ownerMode(),
      label: el<HTMLInputElement>("label").value,
      scopes: list,
    });
    showTx(`Created ✓  sig: ${r.txSig}`, "ok");
    log(`passport created on ${r.cluster}: ${r.txSig}`);
  }).catch(() => showTx("Create failed — see log.", "error")),
);

el("updatePassport").addEventListener("click", () =>
  withErrors(async () => {
    const list = scopes();
    ensureValidScopes(list);
    const label = el<HTMLInputElement>("label").value;
    showTx("Submitting update… approve in Phantom if prompted.", "pending");
    const r = await send<TxResult>({
      type: "PASSPORT_UPDATE",
      cluster: cluster(),
      mode: ownerMode(),
      label: label || null,
      scopes: list,
    });
    showTx(`Updated ✓  sig: ${r.txSig}`, "ok");
    log(`passport updated on ${r.cluster}: ${r.txSig}`);
  }).catch(() => showTx("Update failed — see log.", "error")),
);

el("revokePassport").addEventListener("click", () =>
  withErrors(async () => {
    showTx("Submitting revoke… approve in Phantom if prompted.", "pending");
    const r = await send<TxResult>({
      type: "PASSPORT_REVOKE",
      cluster: cluster(),
      mode: ownerMode(),
    });
    showTx(`Revoked ✓  sig: ${r.txSig}`, "ok");
    log(`passport revoked on ${r.cluster}: ${r.txSig}`);
  }).catch(() => showTx("Revoke failed — see log.", "error")),
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

syncOwnerControls();
void withErrors(refresh);

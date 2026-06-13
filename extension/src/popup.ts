import {
  MAX_LABEL_LEN,
  validatePermissions,
  type Cluster,
} from "@agent-passport/sdk";
import type {
  AgentInfo,
  AirdropResult,
  AttemptResult,
  InferenceResult,
  Msg,
  OwnerInfo,
  OwnerMode,
  PassportInfo,
  Response,
  TxResult,
} from "./messages";
import { DEMO_PHANTOM_LOGIN } from "./config";

interface PhantomProvider {
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
    phantom?: { solana?: PhantomProvider };
  }
}

const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

function setText(id: string, text: string): void {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

const hasExtensionRuntime = (): boolean =>
  typeof chrome !== "undefined" &&
  typeof chrome.runtime?.sendMessage === "function";

const hasStorage = (): boolean =>
  typeof chrome !== "undefined" &&
  typeof chrome.storage?.local?.get === "function";

function log(message: string): void {
  const out = document.getElementById("log");
  if (out) {
    const line = `${new Date().toLocaleTimeString()} ${message}`;
    out.textContent = `${line}\n${out.textContent ?? ""}`.slice(0, 4000);
  }
  if (message.startsWith("error:")) {
    console.error(`[Nomad] ${message}`);
    return;
  }
  console.info(`[Nomad] ${message}`);
}

let phantomActionTimer: ReturnType<typeof setTimeout> | null = null;

function setPhantomAction(text: string, resetMs?: number): void {
  if (phantomActionTimer) {
    clearTimeout(phantomActionTimer);
    phantomActionTimer = null;
  }
  const button = el<HTMLButtonElement>("connectOwner");
  button.dataset.state = text.toLowerCase();
  button.setAttribute(
    "aria-label",
    text === "Connect" ? "Connect Phantom wallet" : `Phantom wallet ${text}`,
  );
  if (resetMs !== undefined) {
    phantomActionTimer = setTimeout(() => {
      button.dataset.state = "connect";
      button.setAttribute("aria-label", "Connect Phantom wallet");
      phantomActionTimer = null;
    }, resetMs);
  }
}

function getPhantomProvider(): PhantomProvider | undefined {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solana?.isPhantom) return window.solana;
  return undefined;
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
const ownerMode = (): OwnerMode =>
  el<HTMLSelectElement>("ownerMode").value as OwnerMode;

let currentAgent: AgentInfo = { agentPublicKey: null };
let currentOwner: OwnerInfo = {
  kind: null,
  ownerPublicKey: null,
  balanceSol: 0,
};
let devWalletSkipped = false;
const SETTINGS_KEY = "agentPassport.settings";
interface PopupSettings {
  reviewBeforeApply: boolean;
}
const DEFAULT_SETTINGS: PopupSettings = { reviewBeforeApply: false };
let settings: PopupSettings = { ...DEFAULT_SETTINGS };
let pendingInference: InferenceResult | null = null;
const textEncoder = new TextEncoder();

const scopes = (): string[] =>
  el<HTMLTextAreaElement>("permissions")
    .value.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

async function loadSettings(): Promise<void> {
  if (!hasStorage()) return;
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  settings = {
    ...DEFAULT_SETTINGS,
    ...((got[SETTINGS_KEY] as Partial<PopupSettings> | undefined) ?? {}),
  };
  el<HTMLInputElement>("reviewBeforeApply").checked =
    settings.reviewBeforeApply;
}

async function saveSettings(next: Partial<PopupSettings>): Promise<void> {
  settings = { ...settings, ...next };
  if (hasStorage())
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

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
  const result = validatePermissions(list, { namespaceMode: "dynamic" });
  if (!result.ok)
    throw new Error(`invalid permissions: ${result.errors.join("; ")}`);
}

function ensureValidLabel(label: string): void {
  const bytes = textEncoder.encode(label).length;
  if (bytes > MAX_LABEL_LEN) {
    throw new Error(`label exceeds ${MAX_LABEL_LEN} bytes`);
  }
}

function renderStage(): void {
  const walletConnected =
    devWalletSkipped ||
    (currentOwner.kind === "phantom" && Boolean(currentOwner.ownerPublicKey));
  const agentSynced = Boolean(currentAgent.agentPublicKey);
  el("walletGate").hidden = walletConnected;
  el("postWallet").hidden = !walletConnected;
  el("agentGate").hidden = !walletConnected || agentSynced;
  el("workspace").hidden = !walletConnected || !agentSynced;
  el("settingsActions").hidden = !walletConnected;
  setText("settingsCluster", cluster());
}

function applyAgentInfo(a: AgentInfo): void {
  currentAgent = a;
  const agentPublicKey = a.agentPublicKey ?? "none";
  setText("settingsAgentPubkey", agentPublicKey);
  renderStage();
}

function applyOwnerInfo(o: OwnerInfo): void {
  currentOwner = o;
  setText("settingsOwnerPubkey", o.ownerPublicKey ?? "none");
  setText("settingsOwnerBalance", o.balanceSol.toFixed(4));
  setText(
    "settingsWalletCluster",
    o.walletCluster
      ? `${o.walletCluster}${o.walletCluster !== cluster() ? " (mismatch)" : ""}`
      : "unknown",
  );
  const warn = el("ownerWarn");
  if (o.walletCluster && o.walletCluster !== cluster()) {
    warn.textContent = `⚠ Phantom is on "${o.walletCluster}" but "${cluster()}" is selected — signing will be blocked.`;
  } else {
    warn.textContent = "";
  }
  renderStage();
}

function syncOwnerControls(): void {
  el("ownerHint").textContent = "";
}

function syncAmbientPointer(event: PointerEvent): void {
  const x = Math.round((event.clientX / window.innerWidth) * 100);
  const y = Math.round((event.clientY / window.innerHeight) * 100);
  const driftX = (event.clientX / window.innerWidth - 0.5) * 10;
  const driftY = (event.clientY / window.innerHeight - 0.5) * 10;
  document.body.style.setProperty("--bg-x", `${x}%`);
  document.body.style.setProperty("--bg-y", `${y}%`);
  document.body.style.setProperty("--drift-x", `${driftX.toFixed(2)}px`);
  document.body.style.setProperty("--drift-y", `${driftY.toFixed(2)}px`);
}

function syncLiquidButtonPointer(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("button");
  if (!button) return;
  const rect = button.getBoundingClientRect();
  const x = Math.round(((event.clientX - rect.left) / rect.width) * 100);
  const y = Math.round(((event.clientY - rect.top) / rect.height) * 100);
  button.style.setProperty("--button-x", `${x}%`);
  button.style.setProperty("--button-y", `${y}%`);
}

function releaseLiquidButton(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("button");
  if (!button || button.classList.contains("dev-skip")) return;
  button.classList.remove("liquid-release");
  void button.offsetWidth;
  button.classList.add("liquid-release");
}

async function refresh(): Promise<void> {
  const a = await send<AgentInfo>({ type: "AGENT_GET" });
  applyAgentInfo(a);
  const o = await send<OwnerInfo>({
    type: "OWNER_GET",
    cluster: cluster(),
    mode: ownerMode(),
  });
  applyOwnerInfo(o);
}

function showInferenceStatus(
  text: string,
  klass: "pending" | "ok" | "error",
): void {
  const s = el("inferenceStatus");
  s.textContent = text;
  s.className = `status ${klass}`;
  s.style.display = "block";
}

function inferenceSummary(result: InferenceResult): string {
  const warnings =
    result.warnings.length > 0 ? ` Warnings: ${result.warnings.join(" ")}` : "";
  return `Inferred ${result.scopes.length} scope(s). Risk: ${result.riskLevel}.${warnings}`;
}

function applyInferenceResult(result: InferenceResult): void {
  el<HTMLInputElement>("label").value = result.label;
  el<HTMLTextAreaElement>("permissions").value = result.scopes.join("\n");
  if (result.testAction) {
    el<HTMLInputElement>("action").value = result.testAction;
  }
  el("inferenceProposal").hidden = true;
  pendingInference = null;
  showInferenceStatus(inferenceSummary(result), "ok");
  log(`inferred fields from ${result.source.url}`);
}

function showInferenceProposal(result: InferenceResult): void {
  pendingInference = result;
  setText("proposalLabel", result.label);
  setText("proposalScopes", result.scopes.join("\n"));
  setText("proposalAction", result.testAction ?? "none");
  setText(
    "proposalWarnings",
    result.warnings.length > 0
      ? result.warnings.join("\n")
      : `Risk: ${result.riskLevel}`,
  );
  el("inferenceProposal").hidden = false;
  showInferenceStatus("Review inferred fields before applying.", "pending");
}

el("settingsToggle").addEventListener("click", () => {
  const panel = el("settingsPanel");
  panel.hidden = !panel.hidden;
  el("settingsToggle").setAttribute("aria-expanded", String(!panel.hidden));
});

el<HTMLInputElement>("reviewBeforeApply").addEventListener("change", (e) => {
  const target = e.currentTarget as HTMLInputElement;
  void withErrors(async () => {
    await saveSettings({ reviewBeforeApply: target.checked });
    log(`review before apply ${target.checked ? "enabled" : "disabled"}`);
  });
});

el("inferFromChatGpt").addEventListener("click", () =>
  withErrors(async () => {
    const button = el<HTMLButtonElement>("inferFromChatGpt");
    button.disabled = true;
    try {
      showInferenceStatus("Reading ChatGPT tab…", "pending");
      const result = await send<InferenceResult>({
        type: "INFER_PERMISSIONS_FROM_ACTIVE_TAB",
      });
      if (settings.reviewBeforeApply) {
        showInferenceProposal(result);
      } else {
        applyInferenceResult(result);
      }
    } catch (e) {
      showInferenceStatus("Inference failed — see settings log.", "error");
      throw e;
    } finally {
      button.disabled = false;
    }
  }),
);

el("applyInference").addEventListener("click", () => {
  if (pendingInference) applyInferenceResult(pendingInference);
});

el("cancelInference").addEventListener("click", () => {
  pendingInference = null;
  el("inferenceProposal").hidden = true;
  showInferenceStatus("Inference proposal canceled.", "pending");
});

el("cluster").addEventListener("change", () => void withErrors(refresh));
el("ownerMode").addEventListener("change", () => {
  syncOwnerControls();
  void withErrors(refresh);
});

el("ensureAgent").addEventListener("click", () =>
  withErrors(async () => {
    const { agentPublicKey } = await send<AgentInfo>({ type: "AGENT_ENSURE" });
    applyAgentInfo({ agentPublicKey });
    log(`agent ready: ${agentPublicKey}`);
  }),
);

async function ensureAgentAfterWalletConnect(): Promise<void> {
  const { agentPublicKey } = await send<AgentInfo>({ type: "AGENT_ENSURE" });
  applyAgentInfo({ agentPublicKey });
  log(`agent ready: ${agentPublicKey}`);
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

function setDemoPhantomPhase(phase: "securing" | "verifying" | "ready"): void {
  setPhantomAction(phase);
}

el("connectOwner").addEventListener("click", () =>
  withErrors(async () => {
    const button = el<HTMLButtonElement>("connectOwner");
    let keepAction = false;
    button.disabled = true;
    try {
      if (DEMO_PHANTOM_LOGIN.enabled) {
        setDemoPhantomPhase("securing");
        log("demo mode: restoring Phantom session");
        await wait(DEMO_PHANTOM_LOGIN.delayMs * 0.36);
        setDemoPhantomPhase("verifying");
        await wait(DEMO_PHANTOM_LOGIN.delayMs * 0.42);
        setDemoPhantomPhase("ready");
        await wait(DEMO_PHANTOM_LOGIN.delayMs * 0.22);
        devWalletSkipped = true;
        const o: OwnerInfo = {
          kind: "phantom",
          ownerPublicKey: DEMO_PHANTOM_LOGIN.publicKey,
          balanceSol: 2,
          providerKind: "injected",
          walletCluster: null,
        };
        applyOwnerInfo(o);
        if (hasExtensionRuntime()) {
          try {
            await ensureAgentAfterWalletConnect();
          } catch (e) {
            log(
              `error: agent sync failed: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
        setPhantomAction("Connected", 1500);
        keepAction = true;
        log(`demo Phantom session restored: ${o.ownerPublicKey}`);
        return;
      }

      if (!hasExtensionRuntime()) {
        const provider = getPhantomProvider();
        if (!provider) {
          setPhantomAction("Unavailable", 2500);
          keepAction = true;
          log(
            "error: Phantom is not injected in this browser preview. Load the unpacked Nomad extension in Chrome with Phantom installed.",
          );
          return;
        }
        setPhantomAction("Approve");
        log("preview mode: opening Phantom directly");
        const { publicKey } = await provider.connect();
        const o: OwnerInfo = {
          kind: "phantom",
          ownerPublicKey: publicKey.toString(),
          balanceSol: 0,
          walletCluster: null,
        };
        applyOwnerInfo(o);
        setPhantomAction("Connected", 1500);
        keepAction = true;
        log(`Phantom connected in preview: ${o.ownerPublicKey}`);
        return;
      }

      setPhantomAction("Opening");
      log("opening Phantom connector tab — approve the connection there…");
      const o = await send<OwnerInfo>({
        type: "PHANTOM_CONNECT",
        cluster: cluster(),
      });
      applyOwnerInfo(o);
      setPhantomAction("Connected", 1500);
      keepAction = true;
      log(`Phantom connected: ${o.ownerPublicKey}`);
    } finally {
      button.disabled = false;
      if (!keepAction) setPhantomAction("Connect");
    }
  }),
);

document.getElementById("skipWallet")?.addEventListener("click", () => {
  devWalletSkipped = true;
  currentOwner = {
    kind: "phantom",
    ownerPublicKey: "skipped for dev",
    balanceSol: 0,
  };
  setText("settingsOwnerPubkey", currentOwner.ownerPublicKey ?? "none");
  setText("settingsOwnerBalance", currentOwner.balanceSol.toFixed(4));
  renderStage();
  log("wallet connect skipped for dev");
});

el("airdrop").addEventListener("click", () =>
  withErrors(async () => {
    const r = await send<AirdropResult>({
      type: "OWNER_AIRDROP",
      cluster: cluster(),
      mode: ownerMode(),
    });
    setText("settingsOwnerBalance", r.balanceSol.toFixed(4));
    log(`airdrop ok, balance ${r.balanceSol} SOL`);
  }),
);

el("createPassport").addEventListener("click", () =>
  withErrors(async () => {
    const list = scopes();
    const label = el<HTMLInputElement>("label").value;
    ensureValidLabel(label);
    ensureValidScopes(list);
    showTx("Submitting create… approve in Phantom if prompted.", "pending");
    const r = await send<TxResult>({
      type: "PASSPORT_CREATE",
      cluster: cluster(),
      mode: ownerMode(),
      label,
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
    ensureValidLabel(label);
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

window.addEventListener("pointermove", syncAmbientPointer);
window.addEventListener("pointermove", syncLiquidButtonPointer);
window.addEventListener("pointerup", releaseLiquidButton);
syncOwnerControls();
renderStage();
void withErrors(loadSettings);
if (hasExtensionRuntime()) {
  void withErrors(refresh);
}

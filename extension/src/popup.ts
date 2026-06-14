import type { AgentIntentResult, Msg, Response } from "./messages";

const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const hasExtensionRuntime = (): boolean =>
  typeof chrome !== "undefined" &&
  typeof chrome.runtime?.sendMessage === "function";

/** Send a message to the background worker; throws on a structured error. */
async function send<T>(msg: Msg): Promise<T> {
  if (!hasExtensionRuntime()) {
    throw new Error("Nomad extension runtime unavailable");
  }
  const res: Response | undefined = await chrome.runtime.sendMessage(msg);
  if (!res) {
    // No response from the worker — usually a stale build (reload the extension)
    // or the service worker not handling this message type.
    throw new Error(`no response from background for ${msg.type}`);
  }
  if (!res.ok) throw new Error(res.error);
  return res.data as T;
}

// While the shadow wallet is on, poll the active ChatGPT tab for new messages
// and ask Haiku 4.5 whether the user wants to create an agent.
const POLL_INTERVAL_MS = 4000;
let monitoring = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function setToggle(on: boolean): void {
  monitoring = on;
  const button = el<HTMLButtonElement>("toggleMonitor");
  button.dataset.state = on ? "on" : "off";
  button.setAttribute("aria-pressed", String(on));
  button.setAttribute(
    "aria-label",
    on ? "Turn agent detection off" : "Turn agent detection on",
  );
  el("toggleLabel").textContent = on ? "On" : "Off";
}

function showSuccess(show: boolean): void {
  el("detectStatus").hidden = !show;
}

async function poll(): Promise<void> {
  if (!monitoring) return;
  try {
    const result = await send<AgentIntentResult>({
      type: "DETECT_AGENT_INTENT_FROM_ACTIVE_TAB",
    });
    if (result?.changed && result.wantsAgent) showSuccess(true);
  } catch (e) {
    // Transient (no ChatGPT tab open, API blip) — keep polling silently.
    console.info(
      `[Nomad] detection skipped: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function startMonitoring(): void {
  setToggle(true);
  showSuccess(false);
  void poll();
  pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
}

function stopMonitoring(): void {
  setToggle(false);
  showSuccess(false);
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

el("toggleMonitor").addEventListener("click", () => {
  if (monitoring) stopMonitoring();
  else startMonitoring();
});

setToggle(false);

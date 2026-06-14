import type {
  AgentIntentResult,
  AgentStatusUpdate,
  Msg,
  Response,
} from "./messages";

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

// The side panel is always on while it is open. Poll the active ChatGPT tab for
// new messages and report each stage instead of exposing a mode toggle.
const POLL_INTERVAL_MS = 4000;
let polling = false;
let passportReady = false;

type StatusState = "working" | "active" | "success" | "error";

function setStatus(
  state: StatusState,
  title: string,
): void {
  el("agentStatus").dataset.state = state;
  el("statusTitle").textContent = title;
}

chrome.runtime.onMessage.addListener((message: AgentStatusUpdate) => {
  if (message.type !== "AGENT_STATUS_UPDATE") return;
  setStatus("working", message.title);
});

async function poll(): Promise<void> {
  if (polling) return;
  polling = true;
  console.log("[Nomad] poll: firing");
  try {
    const result = await send<AgentIntentResult>({
      type: "DETECT_AGENT_INTENT_FROM_ACTIVE_TAB",
    });
    console.log("[Nomad] poll: result =", result);
    if (result.passportStatus === "detection_failed") {
      setStatus("active", "Waiting for action prompt");
    } else if (result.passportStatus === "failed") {
      setStatus("error", "Passport creation failed");
    } else if (
      result.passportStatus === "created" ||
      result.passportStatus === "existing"
    ) {
      passportReady = true;
      setStatus("success", "Passport ready");
    } else if (passportReady) {
      setStatus("success", "Passport ready");
    } else {
      setStatus("active", "Waiting for action prompt");
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setStatus("error", "Connection issue");
    console.warn(
      `[Nomad] poll error: ${message}`,
    );
  } finally {
    polling = false;
  }
}

void poll();
setInterval(() => void poll(), POLL_INTERVAL_MS);

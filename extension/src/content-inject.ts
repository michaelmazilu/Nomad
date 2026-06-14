// Main world: runs inside the ChatGPT page's JS context.
// Sets window.nomad so any page script (custom GPT plugins, console, etc.)
// can call getPublicKey() and signMessage() without knowing about the extension.

type NomadRequest = { type: string; [k: string]: unknown };

function nomadCall<T>(request: NomadRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        requestId: string;
        ok: boolean;
        data: T;
        error?: string;
      };
      if (detail.requestId !== id) return;
      window.removeEventListener("nomad:response", handler);
      if (detail.ok) resolve(detail.data);
      else reject(new Error(detail.error ?? "nomad: unknown error"));
    };
    window.addEventListener("nomad:response", handler);
    window.dispatchEvent(
      new CustomEvent("nomad:request", { detail: { id, ...request } }),
    );
  });
}

window.nomad = {
  getPublicKey(): Promise<string | null> {
    return nomadCall<{ agentPublicKey: string | null }>({
      type: "AGENT_GET_PUBLIC_KEY",
    }).then((r) => r.agentPublicKey);
  },

  signMessage(message: string): Promise<{ agentPublicKey: string; signature: string }> {
    return nomadCall({ type: "AGENT_SIGN_MESSAGE", message });
  },
};

console.log("[Nomad] window.nomad is ready");

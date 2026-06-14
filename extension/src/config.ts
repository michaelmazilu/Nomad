/**
 * Where the Phantom connector web page is served. It must be an http(s) origin
 * (Phantom does not inject into chrome-extension:// pages) and must match the
 * `externally_connectable.matches` entry in the manifest. For local development
 * this is the connector workspace's Vite dev server.
 */
export const CONNECTOR_URL = "http://localhost:5173/";

/**
 * Demo-only Phantom login. Keep the real connector/auth flow in place while
 * allowing presentations to enter the app without opening a wallet prompt.
 */
export const DEMO_PHANTOM_LOGIN = {
  enabled: true,
  delayMs: 1_500,
  publicKey: "6pYmaXSLJALosnttUAaZ4C6tTZ6horFfGD3229FrtrhL",
} as const;

const env = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env;

/**
 * Sponsor backend: signs as fee payer and submits passport writes so an embedded
 * owner key needs no SOL. Must end in a trailing slash (relative URL resolution).
 * `VITE_NOMAD_SPONSOR_TOKEN`, if set, is sent as a bearer token to authenticate.
 */
export const SPONSOR_URL =
  env?.VITE_NOMAD_SPONSOR_URL ?? "http://localhost:8790/";
export const SPONSOR_AUTH_TOKEN = env?.VITE_NOMAD_SPONSOR_TOKEN ?? undefined;

/**
 * Backend endpoint that turns extracted ChatGPT context into strict Nomad
 * inference JSON. Production builds should point this at a controlled proxy;
 * API keys must never be bundled into the extension.
 */
export const INFERENCE_PROXY_URL =
  env?.VITE_NOMAD_INFERENCE_PROXY_URL ?? "http://localhost:8788/infer";

/**
 * Backend proxy that classifies whether a ChatGPT message asks to create an
 * agent. The Anthropic API key lives on this backend (see the `inference`
 * workspace), never in the extension bundle. Must end without a trailing slash.
 */
export const INTENT_PROXY_URL =
  env?.VITE_NOMAD_INTENT_PROXY_URL ??
  "http://localhost:8791/detect-agent-intent";

import { defineManifest } from "@crxjs/vite-plugin";

function hostPermissionFor(url: string | undefined): string[] {
  if (!url) return [];
  try {
    return [`${new URL(url).origin}/*`];
  } catch {
    return [];
  }
}

const inferenceProxyHosts = hostPermissionFor(
  process.env.VITE_NOMAD_INFERENCE_PROXY_URL,
);
const intentProxyHosts = hostPermissionFor(
  process.env.VITE_NOMAD_INTENT_PROXY_URL,
);
const sponsorHosts = hostPermissionFor(process.env.VITE_NOMAD_SPONSOR_URL);

export default defineManifest({
  manifest_version: 3,
  name: "Nomad",
  version: "0.1.0",
  description:
    "Create an agent identity and manage its on-chain Nomad permission passport.",
  // No default_popup: clicking the toolbar icon opens the side panel instead
  // (wired in background.ts via setPanelBehavior). The side panel stays open
  // when you click into the page, unlike the auto-closing action popup.
  action: {
    default_title: "Nomad",
  },
  side_panel: {
    default_path: "src/popup.html",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  permissions: ["storage", "activeTab", "scripting", "sidePanel"],
  host_permissions: [
    // ChatGPT: the side panel persists across tab switches, so activeTab (granted
    // only for the tab active at open time) isn't enough — we need standing access
    // to inject the message extractor whenever a ChatGPT tab becomes active.
    "https://chatgpt.com/*",
    "https://*.chatgpt.com/*",
    "https://chat.openai.com/*",
    "http://localhost:5173/*",
    "http://localhost:8788/*",
    "http://127.0.0.1:8788/*",
    "http://localhost:8790/*",
    "http://127.0.0.1:8790/*",
    "http://localhost:8791/*",
    "http://127.0.0.1:8791/*",
    ...inferenceProxyHosts,
    ...intentProxyHosts,
    ...sponsorHosts,
    "http://127.0.0.1:8899/*",
    "https://api.devnet.solana.com/*",
    "https://api.mainnet-beta.solana.com/*",
  ],
  // The Phantom connector is a normal web page (Phantom does not inject into a
  // chrome-extension:// context). It talks back to this extension over
  // `externally_connectable`; only the connector's dev origin is allowed.
  externally_connectable: {
    matches: ["http://localhost:5173/*"],
  },
});

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
const sponsorHosts = hostPermissionFor(process.env.VITE_NOMAD_SPONSOR_URL);

export default defineManifest({
  manifest_version: 3,
  name: "Nomad",
  version: "0.1.0",
  description:
    "Create an agent identity and manage its on-chain Nomad permission passport.",
  action: {
    default_popup: "src/popup.html",
    default_title: "Nomad",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  permissions: ["storage", "activeTab", "scripting"],
  host_permissions: [
    "http://localhost:5173/*",
    "http://localhost:8788/*",
    "http://127.0.0.1:8788/*",
    "http://localhost:8790/*",
    "http://127.0.0.1:8790/*",
    ...inferenceProxyHosts,
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

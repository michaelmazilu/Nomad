import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Agent Passport",
  version: "0.1.0",
  description:
    "Create an agent identity and manage its on-chain permission passport.",
  action: {
    default_popup: "src/popup.html",
    default_title: "Agent Passport",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  permissions: ["storage"],
  host_permissions: [
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

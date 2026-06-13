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
});

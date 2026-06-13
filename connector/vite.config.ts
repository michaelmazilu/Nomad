import { defineConfig } from "vite";

// The connector MUST be served on a fixed origin that the extension manifest
// lists under `externally_connectable.matches` (http://localhost:5173). Phantom
// injects `window.solana` only into normal http(s) pages, which is the whole
// reason this page exists separately from the extension popup.
export default defineConfig({
  define: { global: "globalThis" },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { target: "esnext", sourcemap: true },
});

import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [crx({ manifest })],
  // web3.js v1 references `global`; map it to globalThis for the browser bundle.
  define: { global: "globalThis" },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
});

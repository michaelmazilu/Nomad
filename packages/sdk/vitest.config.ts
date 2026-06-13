import { defineConfig } from "vitest/config";

// @solana/web3.js (v1) → rpc-websockets (CJS) → require()s an ESM-only uuid,
// which trips ERR_REQUIRE_ESM under Node. The SSR dependency optimizer pre-bundles
// these with esbuild into a single module, eliminating the runtime require.
export default defineConfig({
  test: {
    environment: "node",
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ["@solana/web3.js", "rpc-websockets", "uuid"],
        },
      },
    },
  },
});

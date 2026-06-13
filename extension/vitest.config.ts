import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    deps: {
      optimizer: {
        ssr: {
          // Pre-bundle web3.js / anchor so rpc-websockets' require() of the
          // ESM-only uuid is inlined (otherwise ERR_REQUIRE_ESM under Node).
          enabled: true,
          include: [
            "@solana/web3.js",
            "@coral-xyz/anchor",
            "rpc-websockets",
            "uuid",
          ],
        },
      },
    },
  },
});

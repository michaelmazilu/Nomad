import { defineConfig } from "vitest/config";

// Unit tests for the server-side verification core (lib/verifyPassport.ts). Kept
// in test/ (singular) so Playwright's e2e dir (tests/) never picks them up. The
// ssr optimizer mirrors verifier/vitest.config.ts so @solana/web3.js + its ESM
// transitive deps (rpc-websockets, uuid) load cleanly under Node.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
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

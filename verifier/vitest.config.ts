import { defineConfig } from "vitest/config";

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

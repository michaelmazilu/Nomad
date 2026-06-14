import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// The checkout's /api/verify route imports the workspace SDK (@agent-passport/sdk),
// which resolves from the monorepo root's node_modules — OUTSIDE this app dir. So
// the output-file-tracing root must be the monorepo root, otherwise the SDK is not
// traced into the serverless function bundle (and would 404 at runtime on Vercel).
const nextConfig: NextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL("..", import.meta.url)),
};

export default nextConfig;

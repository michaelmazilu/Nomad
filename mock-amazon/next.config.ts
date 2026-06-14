import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Minimal config. The storefront is fully static/client-side: no rewrites,
// no API routes, no image-optimization domains (placeholder art is local SVG/emoji).
// `outputFileTracingRoot` pins this app as its own root so it isn't confused with
// the parent Nomad monorepo's lockfile during builds.
const nextConfig: NextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
};

export default nextConfig;

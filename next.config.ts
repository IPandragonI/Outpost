import type { NextConfig } from "next";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { withSerwist } from "@serwist/turbopack";
import pkg from "./package.json" with { type: "json" };
import { ENGINE_FLAVORS } from "./src/features/engine/flavors";

// The Stockfish builds are plain worker scripts plus their .wasm, loaded with
// `new Worker("/engines/…")`. They are copied from the npm package here rather than
// committed, so upgrading the `stockfish` dependency is enough to ship a new engine,
// however Next is started (`pnpm dev`, an IDE run configuration, `next build`…).
const require = createRequire(import.meta.url);
const stockfishDir = join(dirname(require.resolve("stockfish/package.json")), "bin");
const enginesDir = join(process.cwd(), "public", "engines");
mkdirSync(enginesDir, { recursive: true });
for (const flavor of Object.values(ENGINE_FLAVORS)) {
  for (const file of [flavor.script, flavor.wasm]) {
    const from = join(stockfishDir, file);
    const to = join(enginesDir, file);
    if (!existsSync(to) || statSync(to).size !== statSync(from).size) copyFileSync(from, to);
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Cross-origin isolation enables SharedArrayBuffer, which the multi-threaded Stockfish
  // build needs. Hosts that cannot send these headers still work: the engine service
  // falls back to the single-threaded build when `crossOriginIsolated` is false.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);

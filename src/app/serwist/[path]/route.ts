import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// Versions the precached pages: a new commit refreshes them.
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

/** Every route is precached so the whole app works offline after the first visit. */
const APP_ROUTES = [
  "/",
  "/games",
  "/analysis",
  "/openings",
  "/trainer",
  "/learn",
  "/settings",
  "/about",
];

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/app/sw.ts",
    additionalPrecacheEntries: APP_ROUTES.map((url) => ({ url, revision })),
    // The engine (several MB) and opening book are cached on first use instead
    // (see the runtime rule in sw.ts), so installing the app stays light.
    globIgnores: ["public/engines/**", "public/data/**"],
    useNativeEsbuild: true,
  },
);

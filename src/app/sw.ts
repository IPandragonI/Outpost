/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Replaced at build time by the precache manifest (static assets, public files, routes).
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A new version waits until the user accepts it (see UpdatePrompt): taking over open
  // pages at once would remove the code chunks they still load from the cache.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Engine builds and the opening book are versioned by file name: cache them for good
    // once downloaded, so analysis works offline.
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin &&
        (url.pathname.startsWith("/engines/") || url.pathname.startsWith("/data/")),
      handler: new CacheFirst({
        cacheName: "outpost-assets",
        plugins: [new ExpirationPlugin({ maxEntries: 16 })],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

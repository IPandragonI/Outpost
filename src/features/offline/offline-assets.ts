import { ENGINE_FLAVORS, type EngineFlavor } from "@/features/engine/flavors";
import { OPENING_BOOK_URL } from "@/features/openings/book-format";

export interface OfflineAsset {
  id: string;
  label: string;
  urls: string[];
  /** Approximate download size, shown before downloading. */
  sizeLabel: string;
}

/** Large files cached on first use rather than at install (see sw.ts). */
export function offlineAssets(flavor: EngineFlavor): OfflineAsset[] {
  const engine = ENGINE_FLAVORS[flavor];
  return [
    {
      id: "engine",
      label: `Stockfish engine (${engine.threaded ? "multi-threaded" : "single-threaded"})`,
      urls: [`/engines/${engine.script}`, `/engines/${engine.wasm}`],
      sizeLabel: "about 1.8 MB",
    },
    {
      id: "book",
      label: "Opening book (3,800 named lines)",
      urls: [OPENING_BOOK_URL],
      sizeLabel: "about 140 KB compressed",
    },
  ];
}

export function serviceWorkerActive(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.serviceWorker?.controller);
}

/** Whether every file of the asset is in the browser's caches. */
export async function isCached(asset: OfflineAsset): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  const hits = await Promise.all(asset.urls.map((url) => caches.match(url)));
  return hits.every(Boolean);
}

/** Downloads the files through the service worker, which keeps them for offline use. */
export async function downloadAsset(asset: OfflineAsset): Promise<void> {
  for (const url of asset.urls) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    await response.arrayBuffer();
  }
}

/** Asks the browser not to evict the app's data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

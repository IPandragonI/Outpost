"use client";

import { EngineService, type EngineConfig, type EngineEnvironment } from "./engine-service";
import { ENGINE_FLAVORS, type EngineFlavor } from "./flavors";
import type { EngineTransport } from "./uci-engine";

/** Stockfish.js builds are worker scripts that speak UCI over postMessage. */
function workerTransport(flavor: EngineFlavor): EngineTransport {
  const worker = new Worker(`/engines/${ENGINE_FLAVORS[flavor].script}`);
  return {
    post: (command) => worker.postMessage(command),
    listen: (handler) => {
      worker.addEventListener("message", (event: MessageEvent) => {
        if (typeof event.data === "string") handler(event.data);
      });
    },
    onError: (handler) => {
      worker.addEventListener("error", (event: ErrorEvent) => {
        event.preventDefault();
        handler(new Error(event.message || "the engine worker failed to load"));
      });
      worker.addEventListener("messageerror", () =>
        handler(new Error("unreadable engine message")),
      );
    },
    terminate: () => worker.terminate(),
  };
}

export function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaMobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
    ?.mobile;
  return uaMobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Conservative defaults: the threaded build only on cross-origin isolated pages with
 * enough cores, leaving one core to the page, at most two threads on phones; a small
 * hash table on low-memory devices. Helper engines for whole-game analysis use the cores
 * left beyond the primary engine's threads, at most three (one on phones), and none on
 * devices with little memory.
 */
export function detectEngineConfig(): EngineConfig {
  const cores = navigator.hardwareConcurrency || 2;
  const mobile = isLikelyMobile();
  const memoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const threadedAvailable =
    typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated === true && cores >= 3;
  const threads = threadedAvailable ? Math.max(1, Math.min(cores - 1, mobile ? 2 : 4)) : 1;
  return {
    flavor: threads > 1 ? "lite-threaded" : "lite-single",
    threads,
    hashMb: mobile || memoryGb <= 2 ? 16 : memoryGb <= 4 ? 32 : 64,
    helpers: memoryGb <= 2 ? 0 : Math.min(mobile ? 1 : 3, Math.max(0, cores - threads)),
  };
}

const browserEnvironment: EngineEnvironment = {
  createTransport: workerTransport,
  detectConfig: detectEngineConfig,
};

let service: EngineService | null = null;

/** The app-wide engine, created on first use (never during server rendering). */
export function getEngineService(): EngineService {
  service ??= new EngineService(browserEnvironment);
  return service;
}

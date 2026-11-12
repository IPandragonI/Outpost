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

/** What the engine configuration depends on. */
export interface DeviceInfo {
  cores: number;
  mobile: boolean;
  /** Reported memory in GB (browsers cap it at 8). */
  memoryGb: number;
  /** The page is cross-origin isolated (SharedArrayBuffer available). */
  isolated: boolean;
}

/**
 * Conservative defaults: the threaded build for the position on the board only on
 * cross-origin isolated pages with enough cores, leaving one core to the page, at most two
 * threads on phones; a small hash table on low-memory devices. Whole-game analysis runs on
 * helper engines, one position each: as many as there are cores beyond one, within a
 * memory budget (none on devices with little memory, one on phones). The primary engine
 * stays free for the board while they work.
 */
export function chooseEngineConfig(device: DeviceInfo): EngineConfig {
  const { cores, mobile, memoryGb, isolated } = device;
  const threads = isolated && cores >= 3 ? Math.max(1, Math.min(cores - 1, mobile ? 2 : 4)) : 1;
  const byMemory = memoryGb <= 2 ? 0 : mobile ? 1 : memoryGb <= 4 ? 2 : 6;
  return {
    flavor: threads > 1 ? "lite-threaded" : "lite-single",
    threads,
    hashMb: mobile || memoryGb <= 2 ? 16 : memoryGb <= 4 ? 32 : 64,
    helpers: Math.min(Math.max(0, cores - 1), byMemory),
  };
}

export function detectEngineConfig(): EngineConfig {
  return chooseEngineConfig({
    cores: navigator.hardwareConcurrency || 2,
    mobile: isLikelyMobile(),
    memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4,
    isolated: typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated === true,
  });
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

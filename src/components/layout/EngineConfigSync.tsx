"use client";

import { useEffect, useRef } from "react";
import { getEngineService } from "@/features/engine/browser-engine";
import type { EngineConfig } from "@/features/engine/engine-service";
import { useSettings } from "@/features/settings/settings-store";

/**
 * Applies the engine resource settings (threads, hash size) to the engine service. The
 * engine restarts only when they actually change; "Auto" keeps the device defaults.
 */
export function EngineConfigSync() {
  const hydrated = useSettings((s) => s.hydrated);
  const threads = useSettings((s) => s.engineThreads);
  const hashMb = useSettings((s) => s.engineHashMb);
  const applied = useRef("{}");

  useEffect(() => {
    if (!hydrated) return;
    const override: Partial<EngineConfig> = {};
    if (threads !== null) {
      override.threads = threads;
      override.flavor = threads > 1 && self.crossOriginIsolated ? "lite-threaded" : "lite-single";
      if (override.flavor === "lite-single") override.threads = 1;
    }
    if (hashMb !== null) override.hashMb = hashMb;
    const key = JSON.stringify(override);
    if (key === applied.current) return;
    applied.current = key;
    getEngineService().configure(override);
  }, [hydrated, threads, hashMb]);

  return null;
}

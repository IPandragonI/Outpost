"use client";

import { useCallback } from "react";
import { useSettings } from "@/features/settings/settings-store";
import { playSound, soundForSan, type MoveSound } from "@/lib/sound";

/** Plays move sounds when enabled in the settings. */
export function useMoveSound() {
  const enabled = useSettings((s) => s.sound);
  const volume = useSettings((s) => s.soundVolume);
  return useCallback(
    (sound: MoveSound | { san: string }) => {
      if (!enabled) return;
      playSound(typeof sound === "string" ? sound : soundForSan(sound.san), volume);
    },
    [enabled, volume],
  );
}

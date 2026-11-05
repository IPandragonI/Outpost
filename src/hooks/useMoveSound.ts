"use client";

import { useCallback } from "react";
import { useSettings } from "@/features/settings/settings-store";
import { playSound, soundForSan, type MoveSound } from "@/lib/sound";

/** What to play: a named sound, or a move (its SAN and, optionally, the position after it). */
export type SoundRequest = MoveSound | { san: string; fen?: string };

/** Plays move sounds when enabled in the settings. */
export function useMoveSound() {
  const enabled = useSettings((s) => s.sound);
  const volume = useSettings((s) => s.soundVolume);
  return useCallback(
    (sound: SoundRequest) => {
      if (!enabled) return;
      playSound(typeof sound === "string" ? sound : soundForSan(sound.san, sound.fen), volume);
    },
    [enabled, volume],
  );
}

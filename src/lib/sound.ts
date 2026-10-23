"use client";

/**
 * Move sounds, synthesized with the Web Audio API: no audio files to download or license,
 * and they work offline. Short percussive tones, quiet by design.
 */

export type MoveSound = "move" | "capture" | "castle" | "check" | "mate" | "error";

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  context ??= new AudioContext();
  // Browsers start audio suspended until a user gesture; moves come from gestures.
  if (context.state === "suspended") void context.resume();
  return context;
}

/** One short "knock": a pitched tone that drops quickly, like wood on wood. */
function knock(ctx: AudioContext, at: number, freq: number, volume: number, length = 0.09) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, at + length);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** The sound for a move, from its SAN. */
export function soundForSan(san: string): MoveSound {
  if (san.includes("#")) return "mate";
  if (san.includes("+")) return "check";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("x")) return "capture";
  return "move";
}

export function playSound(sound: MoveSound, volume: number) {
  const ctx = audio();
  if (!ctx || volume <= 0) return;
  const v = Math.min(1, volume) * 0.35;
  const t = ctx.currentTime + 0.005;
  switch (sound) {
    case "move":
      knock(ctx, t, 520, v);
      break;
    case "capture":
      knock(ctx, t, 300, v * 1.2, 0.12);
      knock(ctx, t + 0.03, 620, v * 0.6);
      break;
    case "castle":
      knock(ctx, t, 520, v);
      knock(ctx, t + 0.09, 470, v);
      break;
    case "check":
      knock(ctx, t, 660, v);
      knock(ctx, t + 0.08, 880, v * 0.9);
      break;
    case "mate":
      knock(ctx, t, 523, v, 0.25);
      knock(ctx, t + 0.12, 659, v, 0.25);
      knock(ctx, t + 0.24, 784, v, 0.35);
      break;
    case "error":
      knock(ctx, t, 220, v, 0.18);
      break;
  }
}

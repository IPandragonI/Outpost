"use client";

/**
 * Move sounds: short WAV samples from /sounds (see public/sounds/README.md), decoded once
 * into Web Audio buffers so playback starts without latency.
 *
 * - Nothing plays before the first user gesture (browsers refuse, and creating the audio
 *   context earlier only produces warnings).
 * - One voice at a time: a new sound cuts the previous one, so quick navigation never piles
 *   sounds up.
 */

import { gameEndOf } from "@/lib/chess/position";

export type MoveSound = "move" | "capture" | "castle" | "check" | "promote" | "illegal" | "end";

const FILES: Record<MoveSound, string> = {
  move: "move",
  capture: "capture",
  castle: "castle",
  check: "check",
  promote: "promote",
  illegal: "illegal",
  end: "game-end",
};

let context: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
let voice: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
const buffers = new Map<MoveSound, AudioBuffer>();
const loading = new Map<MoveSound, Promise<AudioBuffer | null>>();

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume().catch(() => {});
  return context;
}

function load(sound: MoveSound): Promise<AudioBuffer | null> {
  const known = buffers.get(sound);
  if (known) return Promise.resolve(known);
  let pending = loading.get(sound);
  if (!pending) {
    const ctx = audio();
    pending = ctx
      ? fetch(`/sounds/${FILES[sound]}.wav`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((data) => ctx.decodeAudioData(data))
          .then((buffer) => {
            buffers.set(sound, buffer);
            return buffer;
          })
          .catch(() => {
            loading.delete(sound);
            return null;
          })
      : Promise.resolve(null);
    loading.set(sound, pending);
  }
  return pending;
}

/** Decodes every sound in the background so the first move already plays instantly. */
function preload() {
  for (const sound of Object.keys(FILES) as MoveSound[]) void load(sound);
}

const GESTURES = ["pointerdown", "keydown", "touchend"] as const;

/**
 * Browsers only allow audio after a user gesture: the first pointer or key press unlocks
 * playback and warms up the samples.
 */
function unlock() {
  if (unlocked) return;
  unlocked = true;
  audio();
  preload();
  for (const type of GESTURES) window.removeEventListener(type, unlock, true);
}
if (typeof window !== "undefined") {
  for (const type of GESTURES) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
}

/** Whether a gesture has been seen, so sounds may play. */
export function soundsUnlocked(): boolean {
  return unlocked;
}

/** Stops the sound being played, with a few milliseconds of fade to avoid a click. */
function cutVoice(ctx: AudioContext) {
  if (!voice) return;
  const { source, gain } = voice;
  voice = null;
  try {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.008);
    source.stop(ctx.currentTime + 0.01);
  } catch {
    // Already stopped.
  }
}

/** The sound for a move, from its SAN (and the position after it, to catch a draw). */
export function soundForSan(san: string, fenAfter?: string): MoveSound {
  if (san.includes("#")) return "end";
  if (fenAfter && gameEndOf(fenAfter)) return "end";
  if (san.includes("=")) return "promote";
  if (san.includes("+")) return "check";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("x")) return "capture";
  return "move";
}

export function playSound(sound: MoveSound, volume: number) {
  if (!unlocked || volume <= 0) return;
  const ctx = audio();
  if (!ctx || !master) return;
  const out = master;
  const start = (decoded: AudioBuffer) => {
    cutVoice(ctx);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = decoded;
    gain.gain.value = Math.min(1, Math.max(0, volume));
    source.connect(gain).connect(out);
    source.onended = () => {
      if (voice?.source === source) voice = null;
    };
    voice = { source, gain };
    source.start();
  };
  const buffer = buffers.get(sound);
  if (buffer) {
    start(buffer);
    return;
  }
  // Not decoded yet (very first sound): play it as soon as it is, unless it has become stale.
  const requestedAt = performance.now();
  void load(sound).then((decoded) => {
    if (decoded && performance.now() - requestedAt < 600) start(decoded);
  });
}

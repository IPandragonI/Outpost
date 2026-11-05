// Generates the move sounds in public/sounds/*.wav.
//
// The sounds are synthesized from scratch (filtered noise for the "knock" of a piece on a
// wooden board, plus short decaying tones for check, promotion and game end), so they are
// original work released under CC0 1.0: no third-party or proprietary recording is used.
// They aim at the familiar feel of a polished chess app (soft wooden tap, heavier capture,
// bright ping on check) without copying any particular product's audio.
//
//   pnpm sounds

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RATE = 44100;
const OUT = join(import.meta.dirname, "..", "public", "sounds");

/** Small deterministic PRNG so the generated files are reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

const buffer = (seconds) => new Float32Array(Math.ceil(seconds * RATE));

/** Adds a wooden knock at `at` seconds: a noise transient plus a pitched body that sags. */
function knock(out, at, { freq = 190, body = 0.8, click = 0.9, decay = 0.045, gain = 1, seed = 1 }) {
  const rand = rng(seed);
  const start = Math.floor(at * RATE);
  let low = 0;
  let phase = 0;
  for (let i = 0; start + i < out.length; i++) {
    const t = i / RATE;
    // Transient: noise through a one-pole low-pass, gone within a few milliseconds.
    low += 0.35 * (rand() * 2 - low);
    const transient = low * Math.exp(-t / 0.004) * click;
    // Body: a sine whose pitch falls 35% while it fades, like a hollow tap.
    const f = freq * (1 - 0.35 * (1 - Math.exp(-t / 0.03)));
    phase += (2 * Math.PI * f) / RATE;
    const tone = Math.sin(phase) * Math.exp(-t / decay) * body;
    const attack = Math.min(1, i / (0.0006 * RATE));
    out[start + i] += (transient + tone) * attack * gain;
  }
}

/** Adds a soft bell-like tone (two partials) with a fast attack and exponential decay. */
function tone(out, at, freq, { length = 0.3, gain = 0.5, decay = 0.09 } = {}) {
  const start = Math.floor(at * RATE);
  for (let i = 0; i < length * RATE && start + i < out.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / decay);
    const s = Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(2 * Math.PI * freq * 2.01 * t);
    out[start + i] += s * env * gain;
  }
}

function wav(samples, peak = 0.85) {
  let max = 0;
  for (const v of samples) max = Math.max(max, Math.abs(v));
  const scale = max > 0 ? peak / max : 1;
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(1, 22); // mono
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples.length * 2, 40);
  // A 12 ms fade-out removes any click at the end of the file.
  const fade = Math.floor(0.012 * RATE);
  samples.forEach((v, i) => {
    const tail = Math.min(1, (samples.length - i) / fade);
    const q = Math.max(-1, Math.min(1, v * scale * tail));
    data.writeInt16LE(Math.round(q * 32767), 44 + i * 2);
  });
  return data;
}

const sounds = {
  move() {
    const out = buffer(0.14);
    knock(out, 0, { freq: 200, seed: 11 });
    return out;
  },
  capture() {
    const out = buffer(0.2);
    knock(out, 0, { freq: 150, body: 1, click: 1.2, decay: 0.07, seed: 23 });
    knock(out, 0.012, { freq: 330, body: 0.35, click: 0.6, decay: 0.03, gain: 0.7, seed: 24 });
    return out;
  },
  castle() {
    const out = buffer(0.3);
    knock(out, 0, { freq: 175, seed: 31 });
    knock(out, 0.11, { freq: 210, seed: 32, gain: 0.95 });
    return out;
  },
  check() {
    const out = buffer(0.5);
    knock(out, 0, { freq: 200, seed: 41 });
    tone(out, 0.05, 880, { gain: 0.32, decay: 0.12, length: 0.42 });
    tone(out, 0.05, 1320, { gain: 0.14, decay: 0.09, length: 0.3 });
    return out;
  },
  promote() {
    const out = buffer(0.55);
    knock(out, 0, { freq: 210, seed: 51 });
    tone(out, 0.07, 660, { gain: 0.28, decay: 0.07, length: 0.2 });
    tone(out, 0.15, 880, { gain: 0.28, decay: 0.07, length: 0.2 });
    tone(out, 0.23, 1175, { gain: 0.3, decay: 0.12, length: 0.32 });
    return out;
  },
  illegal() {
    const out = buffer(0.26);
    knock(out, 0, { freq: 95, body: 1, click: 0.5, decay: 0.05, seed: 61 });
    knock(out, 0.09, { freq: 85, body: 1, click: 0.4, decay: 0.05, gain: 0.85, seed: 62 });
    return out;
  },
  "game-end"() {
    const out = buffer(1.1);
    knock(out, 0, { freq: 190, seed: 71 });
    tone(out, 0.09, 523.25, { gain: 0.3, decay: 0.25, length: 0.9 });
    tone(out, 0.09, 659.25, { gain: 0.24, decay: 0.25, length: 0.9 });
    tone(out, 0.09, 783.99, { gain: 0.22, decay: 0.3, length: 0.95 });
    return out;
  },
};

mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(sounds)) {
  const file = join(OUT, `${name}.wav`);
  const data = wav(make());
  writeFileSync(file, data);
  console.log(`${name}.wav  ${(data.length / 1024).toFixed(1)} KB`);
}

/** Stockfish.js builds shipped in `public/engines` (see next.config.ts). */
export const ENGINE_FLAVORS = {
  /** NNUE "lite" net, multi-threaded: needs a cross-origin isolated page. */
  "lite-threaded": {
    script: "stockfish-19-lite.js",
    wasm: "stockfish-19-lite.wasm",
    threaded: true,
  },
  /** Same net, single thread: runs anywhere WebAssembly does. */
  "lite-single": {
    script: "stockfish-19-lite-single.js",
    wasm: "stockfish-19-lite-single.wasm",
    threaded: false,
  },
} as const;

export type EngineFlavor = keyof typeof ENGINE_FLAVORS;

export const ENGINE_NAME = "Stockfish 19 (lite NNUE)";

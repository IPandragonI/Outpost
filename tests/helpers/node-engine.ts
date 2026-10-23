import { createRequire } from "node:module";
import type { EngineTransport } from "@/features/engine/uci-engine";

const require = createRequire(import.meta.url);

interface NodeStockfish {
  listener?: (line: string) => void;
  processCommand(command: string): void;
  terminate?: () => void;
}

/**
 * The real Stockfish build the app ships (lite NNUE, single thread), run in Node through
 * the npm package, so engine tests check actual engine output rather than a mock.
 */
export function nodeEngineTransport(
  flavor: "lite-single" | "lite" = "lite-single",
): EngineTransport {
  const { findEngine } = require("stockfish") as { findEngine(flavor: string): string };
  const path = findEngine(flavor);
  // The build keeps its emscripten options in module scope and the first instance mutates
  // them, so each instance needs a fresh copy of the module (browser workers get one anyway).
  delete require.cache[path];
  const engine = (require(path) as () => NodeStockfish)();
  const listeners: ((line: string) => void)[] = [];
  engine.listener = (line: string) => {
    for (const listener of listeners) listener(line);
  };
  return {
    post: (command) => engine.processCommand(command),
    listen: (handler) => void listeners.push(handler),
    onError: () => {},
    terminate: () => engine.terminate?.(),
  };
}

/** A transport that never answers, to test initialization failures. */
export function silentTransport(): EngineTransport & { posted: string[]; terminated: boolean } {
  const transport = {
    posted: [] as string[],
    terminated: false,
    post: (command: string) => void transport.posted.push(command),
    listen: () => {},
    onError: () => {},
    terminate: () => {
      transport.terminated = true;
    },
  };
  return transport;
}

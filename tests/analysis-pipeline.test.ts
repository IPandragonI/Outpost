import { Chess } from "chess.js";
import { afterEach, describe, expect, it } from "vitest";
import { analyzePositions, BOOK_DEPTH, planLimits } from "@/features/analysis/game-analysis";
import { MemoryAnalysisCache } from "@/features/engine/analysis-cache";
import { cp } from "@/features/engine/evaluation";
import { EngineService, type EngineEnvironment } from "@/features/engine/engine-service";
import type { SearchLimits } from "@/features/engine/uci";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import { START_FEN } from "@/lib/chess/position";
import { nodeEngineTransport, silentTransport } from "./helpers/node-engine";

/** Twelve distinct real positions, along a Ruy Lopez. */
const FENS = (() => {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1"]) {
    chess.move(san);
    fens.push(chess.fen());
  }
  return fens;
})();

function fakeResult(fen: string, limits: SearchLimits): PositionAnalysis {
  return {
    fen,
    lines: [{ multipv: 1, score: cp(0), depth: limits.depth ?? 1, pv: ["e2e4"] }],
    score: cp(0),
    bestMove: "e2e4",
    depth: limits.depth ?? 1,
    timeMs: 1,
    limits,
    engine: "fake",
    complete: true,
  };
}

describe("analyzePositions", () => {
  it("runs up to `concurrency` searches at once and analyzes every position once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const searched: string[] = [];
    const results = await analyzePositions(
      FENS,
      async (fen, limits) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5 + Math.random() * 10));
        inFlight--;
        searched.push(fen);
        return fakeResult(fen, limits);
      },
      { limits: { depth: 16, multiPv: 2 }, engine: "fake", concurrency: 3 },
    );
    expect(maxInFlight).toBe(3);
    expect(searched.sort()).toEqual([...FENS].sort());
    expect(results.every((r, i) => r?.fen === FENS[i])).toBe(true);
  });

  it("uses per-position limits and reuses cached results", async () => {
    const cache = new MemoryAnalysisCache();
    await cache.put(fakeResult(FENS[0]!, { depth: 16, multiPv: 2 }));
    const asked: SearchLimits[] = [];
    const limits = FENS.map((_, i) =>
      i < 4 ? { depth: 10, multiPv: 1 } : { depth: 16, multiPv: 2 },
    );
    await analyzePositions(
      FENS,
      async (fen, l) => {
        asked.push(l);
        return fakeResult(fen, l);
      },
      { limits, engine: "fake", cache, concurrency: 2 },
    );
    // Position 0 came from the cache (a deeper result satisfies a shallower request).
    expect(asked).toHaveLength(FENS.length - 1);
    expect(asked.filter((l) => l.depth === 10)).toHaveLength(3);
  });

  it("stops when aborted, keeping what was analyzed", async () => {
    const controller = new AbortController();
    const seen: number[] = [];
    await analyzePositions(
      FENS,
      async (fen, l) => {
        if (seen.length === 4) controller.abort();
        return fakeResult(fen, l);
      },
      {
        limits: { depth: 16, multiPv: 2 },
        engine: "fake",
        signal: controller.signal,
        concurrency: 1,
        onPosition: (i) => seen.push(i),
      },
    );
    expect(seen.length).toBeLessThan(FENS.length);
  });
});

describe("planLimits", () => {
  const preset = { depth: 16, multiPv: 2 };

  it("searches a position shallowly only between two book moves", () => {
    // Moves 1–4 are book moves, move 5 leaves the book.
    const book = (k: number) => k >= 1 && k <= 4;
    const plan = planLimits(8, preset, book);
    expect(plan.map((l) => l.depth)).toEqual([
      BOOK_DEPTH, // start, before book move 1
      BOOK_DEPTH,
      BOOK_DEPTH,
      BOOK_DEPTH, // after book move 3, before book move 4
      16, // after the last book move, before the first judged move
      16,
      16,
      16,
    ]);
    expect(plan[0]!.multiPv).toBe(1);
  });

  it("keeps the full preset when the game is not in the book", () => {
    expect(planLimits(5, preset, () => false).every((l) => l.depth === 16)).toBe(true);
  });
});

describe("EngineService pool", () => {
  let service: EngineService | null = null;
  afterEach(() => {
    service?.dispose();
    service = null;
  });

  function env(helpers: number, created: string[], broken = false): EngineEnvironment {
    return {
      // Short only where a broken helper is simulated; under the load of the whole test
      // suite, a healthy engine can take more than a second to start.
      initTimeoutMs: broken ? 400 : 20_000,
      helperIdleMs: 5_000,
      detectConfig: () => ({ flavor: "lite-single", threads: 1, hashMb: 16, helpers }),
      createTransport: (flavor) => {
        created.push(flavor);
        // With `broken`, only the first engine (the primary) starts.
        return broken && created.length > 1 ? silentTransport() : nodeEngineTransport();
      },
    };
  }

  it("spreads background searches over the helper engines", async () => {
    const created: string[] = [];
    service = new EngineService(env(2, created));
    expect(service.parallelism).toBe(3);
    const fens = FENS.slice(0, 6);
    const results = await Promise.all(
      fens.map(
        (fen) =>
          service!.analyze(fen, { depth: 8, multiPv: 1 }, { priority: "background" }).promise,
      ),
    );
    expect(results.map((r) => r.fen)).toEqual(fens);
    expect(created).toHaveLength(3); // primary + two helpers
  });

  it("still serves the board first while helpers work", async () => {
    const created: string[] = [];
    service = new EngineService(env(1, created));
    const order: string[] = [];
    const background = FENS.slice(0, 4).map((fen, i) =>
      service!
        .analyze(fen, { movetimeMs: 400, multiPv: 1 }, { priority: "background" })
        .promise.then(() => order.push(`bg${i}`)),
    );
    await new Promise((r) => setTimeout(r, 100));
    const interactive = service
      .analyze(START_FEN, { depth: 6, multiPv: 1 })
      .promise.then(() => order.push("board"));
    await Promise.all([...background, interactive]);
    // The board search did not wait for the four background searches.
    expect(order.indexOf("board")).toBeLessThan(3);
  });

  it("falls back to the primary engine when helpers cannot start", async () => {
    const created: string[] = [];
    service = new EngineService(env(2, created, true));
    const fens = FENS.slice(0, 4);
    const results = await Promise.all(
      fens.map(
        (fen) =>
          service!.analyze(fen, { depth: 6, multiPv: 1 }, { priority: "background" }).promise,
      ),
    );
    expect(results.map((r) => r.fen)).toEqual(fens);
    expect(service.parallelism).toBe(1);
  });
});

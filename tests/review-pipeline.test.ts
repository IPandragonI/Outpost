import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { playedInTopLines, positionsToDeepen } from "@/features/analysis/deepening";
import {
  analyzeGame,
  EXACT_STRATEGY,
  type PipelineStrategy,
} from "@/features/analysis/review-pipeline";
import { cp, type Score } from "@/features/engine/evaluation";
import type { SearchLimits } from "@/features/engine/uci";
import type { PositionAnalysis } from "@/features/engine/uci-engine";

// 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6: six moves, seven positions.
const MOVES = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"];
const fens: string[] = [];
const chess = new Chess();
fens.push(chess.fen());
for (const uci of MOVES) {
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
  fens.push(chess.fen());
}

/** What the fake engine "finds": the best move and White's score in each position. */
const BEST: Record<number, [string, Score]> = {
  0: ["e2e4", cp(30)],
  1: ["e7e5", cp(30)],
  2: ["d2d4", cp(30)], // White plays Nf3 instead: it drops 230 cp
  3: ["b8c6", cp(-200)],
  4: ["f1b5", cp(-200)],
  5: ["a7a6", cp(-200)],
  6: ["b5a4", cp(-200)],
};

function analysis(index: number, limits: SearchLimits): PositionAnalysis {
  const [best, score] = BEST[index]!;
  const second = best === "e2e4" ? "d2d4" : index === 2 ? "b1c3" : "g1f3"; // never the move played at 2
  const white = index % 2 === 0;
  const worse = cp((score as { cp: number }).cp + (white ? -10 : 10));
  const lines = [{ multipv: 1, score, depth: limits.depth ?? 0, pv: [best] }];
  if (limits.multiPv > 1) {
    lines.push({ multipv: 2, score: worse, depth: limits.depth ?? 0, pv: [second] });
  }
  return {
    fen: fens[index]!,
    lines,
    score,
    bestMove: best,
    depth: limits.depth ?? 0,
    timeMs: 1,
    limits,
    engine: "test",
    complete: true,
  };
}

function run(strategy: PipelineStrategy, extra: Partial<Parameters<typeof analyzeGame>[3]> = {}) {
  const calls: { index: number; limits: SearchLimits }[] = [];
  const progress: number[] = [];
  const plan = fens.map(() => ({ depth: 16, multiPv: 2 }));
  const promise = analyzeGame(
    fens,
    MOVES,
    async (fen, limits) => {
      const index = fens.indexOf(fen);
      calls.push({ index, limits });
      return analysis(index, limits);
    },
    {
      plan,
      strategy,
      engine: "test",
      onProgress: (done) => progress.push(done),
      ...extra,
    },
  );
  return { promise, calls, progress };
}

describe("positionsToDeepen", () => {
  it("flags the two positions around a costly move and nothing else", async () => {
    const scan = fens.map((_, i) => analysis(i, { depth: 12, multiPv: 2 }));
    expect(positionsToDeepen(fens, MOVES, scan)).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("flags every position whose analysis is missing", () => {
    expect(positionsToDeepen(fens.slice(0, 3), MOVES.slice(0, 2), [null, null, null])).toEqual([
      true,
      true,
      true,
    ]);
  });
});

describe("playedInTopLines", () => {
  it("is true only for the best two lines", () => {
    const before = analysis(2, { depth: 12, multiPv: 2 });
    expect(playedInTopLines(before, "d2d4")).toBe(true);
    expect(playedInTopLines(before, "b1c3")).toBe(true);
    expect(playedInTopLines(before, "g1f3")).toBe(false);
    expect(playedInTopLines(null, "b1c3")).toBe(true);
  });
});

describe("analyzeGame", () => {
  it("searches every position at the preset's depth with the exact strategy", async () => {
    const { promise, calls, progress } = run(EXACT_STRATEGY);
    const results = await promise;
    expect(results.every(Boolean)).toBe(true);
    expect(calls).toHaveLength(7);
    expect(calls.every((c) => c.limits.depth === 16)).toBe(true);
    expect(progress.at(-1)).toBe(7);
  });

  it("scans everything shallow, then deepens only the doubtful move's positions", async () => {
    const { promise, calls, progress } = run({
      scanDepth: 12,
      selectiveMultiPv: true,
      earlyStop: true,
    });
    const results = await promise;
    expect(results.every(Boolean)).toBe(true);
    const scan = calls.filter((c) => c.limits.depth === 12);
    const deep = calls.filter((c) => c.limits.depth === 16);
    expect(scan.map((c) => c.index).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(deep.map((c) => c.index).sort()).toEqual([2, 3]);
    // Position 2: the played move (Nf3) is not among the two best, one line is enough.
    // Position 3: the played move is the best one, the second line stays.
    expect(deep.find((c) => c.index === 2)!.limits.multiPv).toBe(1);
    expect(deep.find((c) => c.index === 3)!.limits.multiPv).toBe(2);
    expect(deep.every((c) => c.limits.earlyStop === true)).toBe(true);
    // The deepened positions replace their scan results.
    expect(results[2]!.depth).toBe(16);
    expect(results[0]!.depth).toBe(12);
    expect(progress.at(-1)).toBe(7);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });

  it("keeps the scan depth for book positions that are already shallow", async () => {
    const calls: SearchLimits[] = [];
    const plan = fens.map((_, i) =>
      i < 2 ? { depth: 10, multiPv: 1 } : { depth: 16, multiPv: 2 },
    );
    await analyzeGame(
      fens,
      MOVES,
      async (fen, limits) => {
        calls.push(limits);
        return analysis(fens.indexOf(fen), limits);
      },
      {
        plan,
        strategy: { scanDepth: 12, selectiveMultiPv: false, earlyStop: false },
        engine: "test",
      },
    );
    expect(calls.slice(0, 2)).toEqual([
      { depth: 10, multiPv: 1 },
      { depth: 10, multiPv: 1 },
    ]);
  });

  it("uses a remote evaluation when there is one and searches the rest", async () => {
    const remoteFor: number[] = [];
    const { promise, calls } = run(EXACT_STRATEGY, {
      remote: {
        get: async (fen, limits) => {
          const index = fens.indexOf(fen);
          if (index > 1) return null;
          remoteFor.push(index);
          return { ...analysis(index, limits), source: "cloud" as const, depth: 40 };
        },
      },
    });
    const results = await promise;
    expect(remoteFor.sort()).toEqual([0, 1]);
    expect(calls.map((c) => c.index).sort()).toEqual([2, 3, 4, 5, 6]);
    expect(results[0]!.source).toBe("cloud");
  });

  it("returns what it has when stopped", async () => {
    const controller = new AbortController();
    const calls: number[] = [];
    const results = await analyzeGame(
      fens,
      MOVES,
      async (fen, limits) => {
        const index = fens.indexOf(fen);
        calls.push(index);
        if (calls.length === 2) controller.abort();
        return analysis(index, limits);
      },
      {
        plan: fens.map(() => ({ depth: 16, multiPv: 2 })),
        strategy: EXACT_STRATEGY,
        engine: "test",
        signal: controller.signal,
      },
    );
    expect(results.some((r) => r === null)).toBe(true);
    expect(calls.length).toBeLessThan(7);
  });
});

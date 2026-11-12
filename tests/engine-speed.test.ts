import { afterEach, describe, expect, it } from "vitest";
import { analyzePositions } from "@/features/analysis/game-analysis";
import { chooseEngineConfig } from "@/features/engine/browser-engine";
import { satisfies } from "@/features/engine/analysis-cache";
import { EngineService, type EngineEnvironment } from "@/features/engine/engine-service";
import { cp, mate } from "@/features/engine/evaluation";
import {
  isSettled,
  UciEngine,
  type DepthResult,
  type PositionAnalysis,
} from "@/features/engine/uci-engine";
import { START_FEN } from "@/lib/chess/position";
import { nodeEngineTransport } from "./helpers/node-engine";

describe("chooseEngineConfig", () => {
  const desktop = { cores: 12, mobile: false, memoryGb: 8, isolated: true };

  it("uses the cores beyond one for helpers on a roomy desktop", () => {
    const config = chooseEngineConfig(desktop);
    expect(config).toMatchObject({ flavor: "lite-threaded", threads: 4, helpers: 6 });
  });

  it("limits helpers by memory and by cores", () => {
    expect(chooseEngineConfig({ ...desktop, memoryGb: 4 }).helpers).toBe(2);
    expect(chooseEngineConfig({ ...desktop, memoryGb: 2 }).helpers).toBe(0);
    expect(chooseEngineConfig({ ...desktop, cores: 4 }).helpers).toBe(3);
    expect(chooseEngineConfig({ ...desktop, mobile: true }).helpers).toBe(1);
  });

  it("falls back to the single-thread build without cross-origin isolation", () => {
    expect(chooseEngineConfig({ ...desktop, isolated: false })).toMatchObject({
      flavor: "lite-single",
      threads: 1,
    });
  });
});

describe("EngineService layout", () => {
  let service: EngineService | null = null;
  afterEach(() => {
    service?.dispose();
    service = null;
  });

  function env(helpers: number, flavors: string[], primaryBackground?: boolean): EngineEnvironment {
    return {
      initTimeoutMs: 20_000,
      detectConfig: () => ({
        flavor: "lite-threaded",
        threads: 1,
        hashMb: 16,
        helpers,
        ...(primaryBackground !== undefined ? { primaryBackground } : {}),
      }),
      createTransport: (flavor) => {
        flavors.push(flavor);
        return nodeEngineTransport();
      },
    };
  }

  it("counts the primary as a background engine only when there are no helpers", () => {
    expect(new EngineService(env(0, [])).parallelism).toBe(1);
    expect(new EngineService(env(3, [])).parallelism).toBe(3);
    expect(new EngineService(env(3, [], true)).parallelism).toBe(4);
  });

  it("warms up the primary and the helpers it is asked for, and no more than configured", async () => {
    const flavors: string[] = [];
    service = new EngineService(env(2, flavors));
    service.warmUp(5);
    await new Promise((r) => setTimeout(r, 1500));
    expect([...flavors].sort()).toEqual(["lite-single", "lite-single", "lite-threaded"]);
  });
});

describe("search shortcuts", () => {
  const run = (moves: string[], scores: number[]) =>
    new Map<number, DepthResult>(
      moves.map((m, i) => [12 + i, { depth: 12 + i, move: m, score: cp(scores[i]!) }]),
    );

  it("settles only after enough agreeing depths, from the minimum depth", () => {
    expect(isSettled(run(["a2a3", "a2a3"], [10, 12]), 13)).toBe(false);
    expect(isSettled(run(["a2a3", "a2a3", "a2a3"], [10, 12, 15]), 14)).toBe(true);
    // Too shallow: the latest depth is below the minimum.
    expect(isSettled(run(["a2a3", "a2a3", "a2a3"], [10, 12, 15]), 11)).toBe(false);
  });

  it("requires the same move and a steady score", () => {
    expect(isSettled(run(["a2a3", "b2b3", "a2a3"], [10, 12, 15]), 14)).toBe(false);
    expect(isSettled(run(["a2a3", "a2a3", "a2a3"], [10, 40, 15]), 14)).toBe(false);
  });

  it("treats a mate as settled only at the same distance", () => {
    const history = (moves: number[]) =>
      new Map<number, DepthResult>(
        moves.map((n, i) => [12 + i, { depth: 12 + i, move: "e1e8", score: mate(n, "w") }]),
      );
    expect(isSettled(history([3, 3, 3]), 14)).toBe(true);
    expect(isSettled(history([4, 3, 3]), 14)).toBe(false);
  });

  it("answers a forced move at a shallow depth but stands for the asked depth", async () => {
    const engine = await UciEngine.create(nodeEngineTransport(), { label: "test" });
    // White's king is attacked by a rook next to it: capturing it is the only legal move.
    const forced = "7k/8/8/8/8/8/6r1/7K w - - 0 1";
    const result = await engine.search(forced, { depth: 18, multiPv: 1 });
    engine.terminate();
    expect(result.shortcut).toBe("forced");
    expect(result.requestedDepth).toBe(18);
    expect(result.depth).toBeLessThanOrEqual(12);
    expect(satisfies(result, "test", { depth: 18, multiPv: 1 })).toBe(true);
    expect(satisfies(result, "test", { depth: 20, multiPv: 1 })).toBe(false);
  });
});

describe("analyzePositions", () => {
  it("searches a repeated position once", async () => {
    const searched: string[] = [];
    const analysis = (fen: string): PositionAnalysis => ({
      fen,
      lines: [{ multipv: 1, score: cp(0), depth: 8, pv: ["e2e4"] }],
      score: cp(0),
      bestMove: "e2e4",
      depth: 8,
      timeMs: 1,
      limits: { depth: 8, multiPv: 1 },
      engine: "test",
      complete: true,
    });
    const results = await analyzePositions(
      [START_FEN, START_FEN, START_FEN],
      async (fen) => {
        searched.push(fen);
        return analysis(fen);
      },
      { limits: { depth: 8, multiPv: 1 }, engine: "test" },
    );
    expect(searched).toHaveLength(1);
    expect(results.every(Boolean)).toBe(true);
  });
});

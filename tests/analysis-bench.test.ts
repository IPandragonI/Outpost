import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { describe, expect, it } from "vitest";
import { ANALYSIS_PRESETS, planLimits } from "@/features/analysis/game-analysis";
import {
  analyzeGame,
  EXACT_STRATEGY,
  type PipelineStrategy,
} from "@/features/analysis/review-pipeline";
import {
  reviewGame,
  type GameReview,
  type ReviewMove,
} from "@/features/classification/game-review";
import { chooseEngineConfig } from "@/features/engine/browser-engine";
import { EngineService, type EngineConfig } from "@/features/engine/engine-service";
import type { SearchLimits } from "@/features/engine/uci";
import { parsePgn } from "@/features/games/pgn";
import { mainline } from "@/features/games/variation-tree";
import type { OpeningBookFile } from "@/features/openings/book-format";
import { OpeningBook } from "@/features/openings/opening-book";
import { nodeEngineTransport, workerEngineTransport } from "./helpers/node-engine";

/**
 * Benchmark of the whole-game analysis with the real engine: `pnpm bench`. Skipped by
 * `pnpm test` (it takes several minutes).
 *
 * Each scenario analyzes the same game; the first is the reference. The reference is run
 * twice: multi-threaded and parallel searches are not deterministic, so two identical runs
 * already disagree on some verdicts, and that disagreement is the yardstick for the others.
 * A variant is "as good as the reference" when it agrees with it about as often as the
 * reference agrees with itself.
 */
const enabled = process.env.npm_lifecycle_event === "bench";

const book = new OpeningBook(
  JSON.parse(readFileSync("public/data/openings-v1.json", "utf-8")) as OpeningBookFile,
);

export interface Scenario {
  name: string;
  config: EngineConfig;
  /** Search limits of the preset used for non-book positions. */
  preset: SearchLimits;
  strategy?: PipelineStrategy;
}

interface RunResult {
  name: string;
  seconds: number;
  /** Total nodes searched: the engine's work, independent of how busy the machine was. */
  nodes: number;
  labels: string[];
  losses: number[];
  precision: { w: number | null; b: number | null };
}

async function runScenario(pgnFile: string, scenario: Scenario): Promise<RunResult> {
  const game = parsePgn(readFileSync(`tests/fixtures/${pgnFile}`, "utf-8")).games[0]!;
  const line = mainline(game.tree);
  const fens = line.map((n) => n.fen);
  const { lastBookIndex } = book.identify(fens);
  const isBookMove = (k: number) => k <= lastBookIndex && book.has(fens[k]!);
  const limits = planLimits(fens.length, scenario.preset, isBookMove);
  const service = new EngineService({
    detectConfig: () => scenario.config,
    createTransport: (flavor) =>
      flavor === "lite-threaded"
        ? nodeEngineTransport("lite")
        : workerEngineTransport("lite-single"),
  });
  // Start the engines before timing, as a page that has been open for a moment would.
  service.warmUp(scenario.config.helpers ?? 0);
  await service.analyze(fens[0]!, { depth: 1, multiPv: 1 }).promise;
  await new Promise((r) => setTimeout(r, 1500));
  const started = Date.now();
  let nodes = 0;
  const positions = await analyzeGame(
    fens,
    line.slice(1).map((n) => n.uci!),
    (fen, l, signal, lane) => {
      const handle = service.analyze(fen, l, { priority: "background", lane });
      signal.addEventListener("abort", handle.cancel);
      return handle.promise.then((analysis) => {
        nodes += analysis.nodes ?? 0;
        return analysis;
      });
    },
    {
      plan: limits,
      strategy: scenario.strategy ?? EXACT_STRATEGY,
      engine: service.engineId,
      concurrency: service.parallelism,
    },
  );
  const seconds = (Date.now() - started) / 1000;
  service.dispose();
  const moves: ReviewMove[] = line.slice(1).map((node, i) => ({
    fenBefore: line[i]!.fen,
    uci: node.uci!,
    san: node.san!,
    ply: node.ply,
    isBook: isBookMove(i + 1),
  }));
  const review: GameReview = reviewGame(moves, positions);
  return {
    name: scenario.name,
    seconds,
    nodes,
    labels: review.moves.map((m) => m.result.classification),
    losses: review.moves.map((m) => m.result.loss),
    precision: { w: review.white.precision, b: review.black.precision },
  };
}

function compare(reference: RunResult, other: RunResult): string {
  const same = reference.labels.filter((l, i) => l === other.labels[i]).length;
  const meanLoss =
    reference.losses.reduce((sum, l, i) => sum + Math.abs(l - (other.losses[i] ?? 0)), 0) /
    Math.max(1, reference.losses.length);
  const dp = (a: number | null, b: number | null) =>
    a === null || b === null ? "n/a" : Math.abs(a - b).toFixed(1);
  return (
    `${same}/${reference.labels.length} identical verdicts, ` +
    `mean |loss difference| ${(meanLoss * 100).toFixed(2)} points, ` +
    `precision difference W ${dp(reference.precision.w, other.precision.w)} / B ${dp(reference.precision.b, other.precision.b)}`
  );
}

const cores = cpus().length;
const standard = ANALYSIS_PRESETS.find((p) => p.id === "standard")!.limits;
const device = { cores, mobile: false, memoryGb: 8, isolated: true };

/** The layout before the speed-up work: a 4-thread primary that also takes background jobs. */
const legacy: Scenario = {
  name: "reference: 4-thread primary + 3 threaded helpers, all searching",
  config: {
    flavor: "lite-threaded",
    threads: 4,
    hashMb: 64,
    helpers: 3,
    primaryBackground: true,
    helperFlavor: "lite-threaded",
  },
  preset: standard,
};

/** What the app now picks for this machine: single-thread helpers, primary kept for the board. */
const layout: Scenario = {
  name: `layout: ${chooseEngineConfig(device).helpers} single-thread helpers`,
  config: chooseEngineConfig(device),
  preset: standard,
};

const game = process.env.BENCH_GAME ?? "immortal.pgn";
const lines: string[] = [];
function note(text: string) {
  lines.push(text);
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/analysis-bench.txt",
    lines.join(String.fromCharCode(10)) + String.fromCharCode(10),
  );
  console.log(text);
}

const mega = (n: number) => `${(n / 1e6).toFixed(1)}M nodes`;
const describeRun = (r: RunResult) => `${r.name}: ${r.seconds.toFixed(1)} s, ${mega(r.nodes)}`;

const fast = (name: string, strategy: PipelineStrategy): Scenario => ({
  name,
  config: layout.config,
  preset: standard,
  strategy,
});

describe.skipIf(!enabled)(`whole-game analysis speed and quality (${cores} cores)`, () => {
  it("layout: interleaved runs of the reference layout and the helper layout", async () => {
    note(`game: ${game}, preset: Standard (depth 16, MultiPV 2), ${cores} cores`);
    const runs = {
      legacy: [] as RunResult[],
      layout: [] as RunResult[],
    };
    // Interleaved, so a slow moment of the machine hits both layouts alike.
    for (let round = 0; round < 2; round++) {
      runs.legacy.push(await runScenario(game, legacy));
      note(describeRun(runs.legacy.at(-1)!));
      runs.layout.push(await runScenario(game, layout));
      note(describeRun(runs.layout.at(-1)!));
    }
    const best = (list: RunResult[]) => Math.min(...list.map((r) => r.seconds));
    note(`legacy self-agreement: ${compare(runs.legacy[0]!, runs.legacy[1]!)}`);
    note(`layout self-agreement: ${compare(runs.layout[0]!, runs.layout[1]!)}`);
    note(`layout vs legacy:       ${compare(runs.legacy[0]!, runs.layout[0]!)}`);
    note(
      `best time legacy ${best(runs.legacy).toFixed(1)} s, layout ${best(runs.layout).toFixed(1)} s: x${(best(runs.legacy) / best(runs.layout)).toFixed(2)}`,
    );
    expect(runs.layout.length).toBe(2);
  }, 3_000_000);

  it("quality against a deeper reference, and work saved by each strategy", async () => {
    // The yardstick: the same game searched at depth 20 (the Deep preset), which is closer to
    // the truth than any depth-16 method. Every variant is compared with it.
    const deep = ANALYSIS_PRESETS.find((p) => p.id === "deep")!.limits;
    const truth = await runScenario(game, {
      ...fast("truth (depth 20)", EXACT_STRATEGY),
      preset: deep,
    });
    note(describeRun(truth));
    const exact = await runScenario(game, fast("exact, helper layout (depth 16)", EXACT_STRATEGY));
    const reference = await runScenario(game, legacy);
    const report = (run: RunResult, base: RunResult) =>
      note(
        `${describeRun(run)} (${((run.nodes / base.nodes) * 100).toFixed(0)}% of the exact nodes, x${(base.seconds / run.seconds).toFixed(2)} time)   vs depth 20: ${compare(truth, run)}`,
      );
    report(reference, exact);
    report(exact, exact);
    const variants: Scenario[] = [
      fast("early stop", { ...EXACT_STRATEGY, earlyStop: true }),
      fast("adaptive depth (scan 12)", { ...EXACT_STRATEGY, scanDepth: 12 }),
      fast("adaptive depth + selective MultiPV", {
        ...EXACT_STRATEGY,
        scanDepth: 12,
        selectiveMultiPv: true,
      }),
      fast("adaptive + selective MultiPV + early stop", {
        scanDepth: 12,
        selectiveMultiPv: true,
        earlyStop: true,
      }),
    ];
    for (const variant of variants) report(await runScenario(game, variant), exact);
    expect(exact.nodes).toBeGreaterThan(0);
  }, 3_000_000);
});

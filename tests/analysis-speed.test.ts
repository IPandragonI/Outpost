import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzePositions, ANALYSIS_PRESETS, planLimits } from "@/features/analysis/game-analysis";
import { reviewGame, type ReviewMove } from "@/features/classification/game-review";
import { EngineService, type EngineConfig } from "@/features/engine/engine-service";
import type { SearchLimits } from "@/features/engine/uci";
import type { OpeningBookFile } from "@/features/openings/book-format";
import { OpeningBook } from "@/features/openings/opening-book";
import { parsePgn } from "@/features/games/pgn";
import { mainline } from "@/features/games/variation-tree";
import { nodeEngineTransport } from "./helpers/node-engine";

// Benchmark of the whole-game analysis, with the real engine: `pnpm bench`. Skipped by
// `pnpm test` (it takes a minute or two).
const enabled = process.env.npm_lifecycle_event === "bench";

const book = new OpeningBook(
  JSON.parse(readFileSync("public/data/openings-v1.json", "utf-8")) as OpeningBookFile,
);

async function timeReview(pgnFile: string, config: EngineConfig, useBookPlan: boolean) {
  const game = parsePgn(readFileSync(`tests/fixtures/${pgnFile}`, "utf-8")).games[0]!;
  const line = mainline(game.tree);
  const fens = line.map((n) => n.fen);
  const { lastBookIndex } = book.identify(fens);
  const isBookMove = (k: number) => k <= lastBookIndex && book.has(fens[k]!);
  const preset = ANALYSIS_PRESETS.find((p) => p.id === "standard")!.limits;
  const limits: SearchLimits[] = useBookPlan
    ? planLimits(fens.length, preset, isBookMove)
    : fens.map(() => preset);
  const service = new EngineService({
    detectConfig: () => config,
    createTransport: (flavor) =>
      nodeEngineTransport(flavor === "lite-threaded" ? "lite" : "lite-single"),
  });
  // Start the engines before timing, as a page that has been open for a moment would.
  await service.analyze(fens[0]!, { depth: 1, multiPv: 1 }).promise;
  const started = Date.now();
  const positions = await analyzePositions(
    fens,
    (fen, l, signal, lane) => {
      const handle = service.analyze(fen, l, { priority: "background", lane });
      signal.addEventListener("abort", handle.cancel);
      return handle.promise;
    },
    { limits, engine: service.engineId, concurrency: service.parallelism },
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
  const review = reviewGame(moves, positions);
  return { seconds, labels: review.moves.map((m) => m.result.classification) };
}

describe.skipIf(!enabled)("whole-game analysis speed (Standard preset, depth 16)", () => {
  it("is faster with helper engines and shallow book positions, with comparable verdicts", async () => {
    const sequential: EngineConfig = {
      flavor: "lite-threaded",
      threads: 4,
      hashMb: 64,
      helpers: 0,
    };
    const pool: EngineConfig = { ...sequential, helpers: 3 };
    const before = await timeReview("immortal.pgn", sequential, false);
    // The same setup again: multi-threaded search is not deterministic, so two identical
    // runs already disagree on some verdicts; that is the yardstick for the new one.
    const again = await timeReview("immortal.pgn", sequential, false);
    const after = await timeReview("immortal.pgn", pool, true);
    const agreement = (a: string[], b: string[]) => a.filter((l, i) => l === b[i]).length;
    const report = [
      `before (1 engine x 4 threads, sequential): ${before.seconds.toFixed(1)} s`,
      `before, second run:                        ${again.seconds.toFixed(1)} s`,
      `after (3 helpers in lanes + book plan):    ${after.seconds.toFixed(1)} s`,
      `speed-up: x${(before.seconds / after.seconds).toFixed(2)}`,
      `verdicts, before vs before again: ${agreement(before.labels, again.labels)} of ${before.labels.length} identical`,
      `verdicts, before vs after:        ${agreement(before.labels, after.labels)} of ${before.labels.length} identical`,
      `verdicts, again vs after:         ${agreement(again.labels, after.labels)} of ${before.labels.length} identical`,
      `before: ${before.labels.join(" ")}`,
      `again:  ${again.labels.join(" ")}`,
      `after:  ${after.labels.join(" ")}`,
    ].join("\n");
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/analysis-speed.txt", `${report}\n`);
    expect(after.seconds).toBeLessThan(before.seconds);
  }, 1_500_000);
});

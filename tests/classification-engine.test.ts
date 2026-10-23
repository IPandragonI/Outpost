import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzePositions } from "@/features/analysis/game-analysis";
import {
  reviewGame,
  type GameReview,
  type ReviewMove,
} from "@/features/classification/game-review";
import { MemoryAnalysisCache } from "@/features/engine/analysis-cache";
import { UciEngine } from "@/features/engine/uci-engine";
import type { OpeningBookFile } from "@/features/openings/book-format";
import { OpeningBook } from "@/features/openings/opening-book";
import { parsePgn } from "@/features/games/pgn";
import { mainline } from "@/features/games/variation-tree";
import { parseUci } from "@/lib/chess/position";
import { nodeEngineTransport } from "./helpers/node-engine";

// Reference games reviewed with the real engine. These pin down behaviour that does not
// depend on exact engine numbers: famous sacrifices, mates, obvious blunders.

const book = new OpeningBook(
  JSON.parse(readFileSync("public/data/openings-v1.json", "utf-8")) as OpeningBookFile,
);
let engine: UciEngine;

beforeAll(async () => {
  engine = await UciEngine.create(nodeEngineTransport(), { hashMb: 32 });
}, 60_000);
afterAll(() => engine?.terminate());

async function review(pgn: string, depth = 14): Promise<GameReview> {
  const game = parsePgn(pgn).games[0]!;
  const line = mainline(game.tree);
  const fens = line.map((n) => n.fen);
  const { lastBookIndex } = book.identify(fens);
  const moves: ReviewMove[] = line.slice(1).map((node, i) => ({
    fenBefore: line[i]!.fen,
    uci: node.uci!,
    san: node.san!,
    ply: node.ply,
    isBook: i + 1 <= lastBookIndex && book.has(node.fen),
  }));
  const positions = await analyzePositions(
    fens,
    (fen, limits, signal) => engine.search(fen, limits, undefined, signal),
    {
      limits: { depth, multiPv: 2 },
      engine: engine.name,
      cache: new MemoryAnalysisCache(),
    },
  );
  return reviewGame(moves, positions);
}

function verdicts(r: GameReview) {
  return r.moves.map((m) => `${m.ply}. ${m.san} ${m.result.classification}`);
}

describe("game review with Stockfish", () => {
  it("finds Morphy's queen sacrifice in the Opera Game", async () => {
    const r = await review(readFileSync("tests/fixtures/opera.pgn", "utf-8"));
    console.log(verdicts(r).join("\n"));
    const qb8 = r.moves.find((m) => m.san === "Qb8+")!;
    expect(qb8.result.isBestMove).toBe(true);
    expect(qb8.result.sacrifice?.piece).toBe("q");
    expect(qb8.result.classification).toBe("brilliant");
    const mate = r.moves.at(-1)!;
    expect(mate.san).toBe("Rd8#");
    expect(mate.result.classification).toMatch(/best|forced/);
    // The opening moves come from the theory dataset.
    expect(r.moves[0]!.result.classification).toBe("book");
    // Black lost a won-looking position quickly: it made errors, White's precision is higher.
    expect(
      r.black.counts.mistake + r.black.counts.blunder + r.black.counts.inaccuracy,
    ).toBeGreaterThan(0);
    expect(r.white.precision!).toBeGreaterThan(r.black.precision!);
    expect(r.pending).toBe(0);
  }, 180_000);

  it("calls the move allowing Scholar's mate a blunder", async () => {
    const r = await review("1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0");
    const nf6 = r.moves.find((m) => m.san === "Nf6")!;
    expect(nf6.result.classification).toBe("blunder");
    expect(nf6.result.flags).toContain("allows-mate");
    const best = new Chess(nf6.fenBefore).move(parseUci(nf6.result.bestMove!));
    expect(["Qe7", "Qf6", "g6"]).toContain(best.san);
    expect(r.moves.at(-1)!.result.classification).toMatch(/best|great/);
  }, 120_000);
});

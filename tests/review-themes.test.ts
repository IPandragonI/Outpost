import { describe, expect, it } from "vitest";
import { estimateRating, phasesOf, type ReviewMove } from "@/features/classification/game-review";
import { moveThemes } from "@/features/classification/themes";
import type { MoveClassification } from "@/features/classification/classify-move";
import { START_FEN } from "@/lib/chess/position";

function move(ply: number, fenBefore: string, isBook = false): ReviewMove {
  return { fenBefore, uci: "e2e4", san: "e4", ply, isBook };
}

describe("phasesOf", () => {
  it("keeps the opening for book and early moves, then goes to the middlegame", () => {
    const phases = phasesOf([move(1, START_FEN, true), move(21, START_FEN), move(22, START_FEN)]);
    expect(phases).toEqual(["opening", "middlegame", "middlegame"]);
  });

  it("switches to the endgame with six pieces or fewer, and never goes back", () => {
    const endgame = "4k3/pppp4/8/8/8/8/PPPP4/R3K2R w - - 0 40";
    const phases = phasesOf([move(40, endgame), move(41, START_FEN)]);
    expect(phases).toEqual(["endgame", "endgame"]);
  });
});

describe("estimateRating", () => {
  it("is null without enough judged moves", () => {
    expect(estimateRating(20, 5)).toBeNull();
    expect(estimateRating(null, 30)).toBeNull();
  });

  it("falls as the average centipawn loss grows, rounded to 50 and clamped", () => {
    const good = estimateRating(30, 30)!;
    const poor = estimateRating(120, 30)!;
    expect(good).toBeGreaterThan(poor);
    expect(good % 50).toBe(0);
    expect(estimateRating(0, 30)).toBe(3000);
    expect(estimateRating(900, 30)).toBe(400);
  });
});

describe("moveThemes", () => {
  const base = {
    classification: "blunder",
    isBestMove: false,
    flags: [],
    replyLine: [],
    bestMove: null,
    chanceBest: 0.5,
    chancePlayed: 0.3,
  } as unknown as MoveClassification;

  it("is empty for a good move", () => {
    expect(moveThemes({ ...base, classification: "best" }, START_FEN, "e2e4")).toEqual([]);
  });

  it("flags a missed fork: a knight check that also attacks a rook", () => {
    const fen = "r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1";
    const hits = moveThemes({ ...base, bestMove: "d5c7" } as MoveClassification, fen, "e1e2");
    expect(hits.find((h) => h.theme === "missed-fork")?.san).toBe("Nc7+");
  });

  it("flags a missed capture when the best move wins material", () => {
    // Black queen hangs on d5 to the pawn on e4; White plays a quiet move instead.
    const fen = "rnb1kbnr/pppp1ppp/8/3qp3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3";
    const hits = moveThemes(
      { ...base, bestMove: "e4d5", chanceBest: 0.9, chancePlayed: 0.5 } as MoveClassification,
      fen,
      "a2a3",
    );
    expect(hits.some((h) => h.theme === "missed-capture")).toBe(true);
  });
});

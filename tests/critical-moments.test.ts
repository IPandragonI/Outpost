import { describe, expect, it } from "vitest";
import { criticalMoments } from "@/features/classification/critical-moments";
import type { GameReview, ReviewedMove } from "@/features/classification/game-review";
import { START_FEN } from "@/lib/chess/position";

function move(ply: number, classification: string, loss = 0): ReviewedMove {
  return {
    fenBefore: ply % 2 === 1 ? START_FEN : START_FEN.replace(" w ", " b "),
    uci: "e2e4",
    san: `m${ply}`,
    ply,
    isBook: false,
    accuracy: 100,
    result: { classification, loss } as unknown as ReviewedMove["result"],
  };
}

function review(moves: ReviewedMove[], turningPoints: GameReview["turningPoints"] = []) {
  return { moves, turningPoints, pending: 0 } as unknown as GameReview;
}

describe("criticalMoments", () => {
  it("is empty for a clean game", () => {
    expect(criticalMoments(review([move(1, "best"), move(2, "good")]))).toEqual([]);
  });

  it("finds the first major mistake, the worst blunder and a missed win, in game order", () => {
    const moments = criticalMoments(
      review([
        move(1, "best"),
        move(2, "mistake", 0.15),
        move(3, "good"),
        move(4, "blunder", 0.3),
        move(5, "miss", 0.25),
        move(6, "blunder", 0.45),
      ]),
    );
    expect(moments.map((m) => [m.ply, m.kind])).toEqual([
      [2, "firstMistake"],
      [5, "missedWin"],
      [6, "biggestBlunder"],
    ]);
    expect(moments[0]!.color).toBe("b");
  });

  it("lists a move once and adds evaluation swings", () => {
    const moments = criticalMoments(
      review(
        [move(1, "best"), move(2, "blunder", 0.4), move(3, "good")],
        [
          { index: 1, ply: 2, from: 0.5, to: 0.1 },
          { index: 2, ply: 3, from: 0.1, to: 0.6 },
        ],
      ),
    );
    expect(moments.map((m) => [m.ply, m.kind])).toEqual([
      [2, "firstMistake"],
      [3, "swing"],
    ]);
    expect(moments[1]!.swing).toBeCloseTo(0.5);
  });

  it("caps the list but keeps the most important reasons", () => {
    const moves = [move(1, "mistake", 0.1), move(2, "blunder", 0.3), move(3, "brilliant")];
    const moments = criticalMoments(review(moves), 2);
    expect(moments.map((m) => m.kind)).toEqual(["firstMistake", "biggestBlunder"]);
  });
});

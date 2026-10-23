import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { classifyMove, type MoveInput } from "@/features/classification/classify-move";
import { gamePrecision, moveAccuracy, reviewGame } from "@/features/classification/game-review";
import { sacrificeOf, staticExchange } from "@/features/classification/material";
import { rulesFor } from "@/features/classification/classification-rules";
import { cp, mate, type Score } from "@/features/engine/evaluation";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import { parseUci } from "@/lib/chess/position";

/** A hand-built analysis: each threshold of the rules is tested on exact numbers. */
function analysis(fen: string, lines: [string, Score][], depth = 20): PositionAnalysis {
  return {
    fen,
    lines: lines.map(([uci, score], i) => ({ multipv: i + 1, score, depth, pv: [uci] })),
    score: lines[0]?.[1] ?? cp(0),
    bestMove: lines[0]?.[0] ?? null,
    depth,
    timeMs: 0,
    limits: { depth, multiPv: lines.length },
    engine: "test",
    complete: true,
  };
}

function afterFen(fen: string, uci: string): string {
  const chess = new Chess(fen);
  chess.move(parseUci(uci));
  return chess.fen();
}

/** White to move in the initial position; `played` scored `playedScore`, best is e2e4 at `best`. */
function whiteMove(
  played: string,
  best: Score,
  playedScore: Score,
  extra: Partial<MoveInput> = {},
) {
  const fen = new Chess().fen();
  const lines: [string, Score][] = [["e2e4", best]];
  if (played !== "e2e4") lines.push([played, playedScore]);
  return classifyMove({
    fenBefore: fen,
    uci: played,
    before: analysis(fen, lines),
    after: analysis(afterFen(fen, played), [["e7e5", playedScore]]),
    isBook: false,
    ...extra,
  });
}

describe("classification thresholds (expected points)", () => {
  it("labels the engine's move as best whatever the alternatives", () => {
    expect(whiteMove("e2e4", cp(30), cp(30)).classification).toBe("best");
  });

  it("grades small and large losses", () => {
    expect(whiteMove("d2d4", cp(30), cp(20)).classification).toBe("excellent");
    expect(whiteMove("g1f3", cp(30), cp(-20)).classification).toBe("good");
    expect(whiteMove("b1c3", cp(30), cp(-60)).classification).toBe("inaccuracy");
    expect(whiteMove("f2f3", cp(30), cp(-150)).classification).toBe("mistake");
    expect(whiteMove("g2g4", cp(30), cp(-400)).classification).toBe("blunder");
  });

  it("does not punish the same centipawn loss in an already decided position", () => {
    // 300 cp lost at +9 costs about 6 points of winning chances; at +0.3, about 26.
    const decided = whiteMove("d2d4", cp(900), cp(600));
    const balanced = whiteMove("d2d4", cp(30), cp(-270));
    expect(decided.cpLoss).toBe(balanced.cpLoss);
    expect(decided.classification).toBe("inaccuracy");
    expect(balanced.classification).toBe("blunder");
    expect(decided.loss * 3).toBeLessThan(balanced.loss);
  });

  it("measures losses from the mover's point of view for Black", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    // Scores are White POV: Black's best keeps +0.3, the played move gives +3.
    const result = classifyMove({
      fenBefore: fen,
      uci: "f7f6",
      before: analysis(fen, [
        ["e7e5", cp(30)],
        ["f7f6", cp(300)],
      ]),
      after: analysis(afterFen(fen, "f7f6"), [["d2d4", cp(300)]]),
      isBook: false,
    });
    expect(result.mover).toBe("b");
    expect(result.classification).toBe("blunder");
    expect(result.cpLoss).toBe(270);
    expect(result.chanceBest).toBeGreaterThan(result.chancePlayed);
  });

  it("flags moves that allow mate and moves that miss one", () => {
    const allows = whiteMove("f2f3", cp(20), mate(3, "b"));
    expect(allows.classification).toBe("blunder");
    expect(allows.flags).toContain("allows-mate");
    const misses = whiteMove("d2d4", mate(2, "w"), cp(250));
    expect(misses.flags).toContain("missed-mate");
    expect(misses.classification).toBe("blunder");
  });

  it("does not punish a slower but still forced mate", () => {
    const result = whiteMove("d2d4", mate(2, "w"), mate(5, "w"));
    expect(result.loss).toBe(0);
    expect(result.flags).toContain("slower-mate");
  });

  it("calls a lost winning chance after an opponent's error a miss, not a blunder", () => {
    const miss = whiteMove("d2d4", cp(500), cp(40), { opponentLoss: 0.25 });
    expect(miss.classification).toBe("miss");
    // Without an opponent's error before, the same drop is a plain mistake or blunder.
    expect(whiteMove("d2d4", cp(500), cp(40)).classification).toMatch(/mistake|blunder/);
    // Throwing the game away stays a blunder.
    expect(whiteMove("d2d4", cp(500), cp(-400), { opponentLoss: 0.25 }).classification).toBe(
      "blunder",
    );
  });

  it("marks forced and book moves", () => {
    const fen = "7k/8/8/8/8/8/6q1/7K w - - 0 1"; // Kxg2 is the only legal move.
    const forced = classifyMove({
      fenBefore: fen,
      uci: "h1g2",
      before: analysis(fen, [["h1g2", cp(0)]]),
      after: analysis(afterFen(fen, "h1g2"), [["h8g7", cp(0)]]),
      isBook: false,
    });
    expect(forced.classification).toBe("forced");
    expect(whiteMove("d2d4", cp(30), cp(10), { isBook: true }).classification).toBe("book");
  });

  it("awards great only to a non-obvious only move", () => {
    // Quiet only-move: every alternative loses a lot.
    const fen = new Chess().fen();
    const great = classifyMove({
      fenBefore: fen,
      uci: "g1f3",
      before: analysis(fen, [
        ["g1f3", cp(50)],
        ["e2e4", cp(-400)],
      ]),
      after: analysis(afterFen(fen, "g1f3"), [["d7d5", cp(50)]]),
      isBook: false,
    });
    expect(great.classification).toBe("great");
    expect(great.flags).toContain("only-move");
    // Too shallow to trust: no special label.
    const shallow = classifyMove({
      fenBefore: fen,
      uci: "g1f3",
      before: analysis(
        fen,
        [
          ["g1f3", cp(50)],
          ["e2e4", cp(-400)],
        ],
        8,
      ),
      after: analysis(afterFen(fen, "g1f3"), [["d7d5", cp(50)]], 8),
      isBook: false,
    });
    expect(shallow.classification).toBe("best");
    expect(shallow.flags).toContain("low-confidence");
  });

  it("does not call taking a hanging piece great", () => {
    // White's queen takes an undefended rook: the only good move, but an obvious one.
    const fen = "4k3/8/8/3r4/8/8/3Q4/4K3 w - - 0 1";
    const result = classifyMove({
      fenBefore: fen,
      uci: "d2d5",
      before: analysis(fen, [
        ["d2d5", cp(900)],
        ["e1e2", cp(400)],
      ]),
      after: analysis(afterFen(fen, "d2d5"), [["e8e7", cp(900)]]),
      isBook: false,
    });
    expect(result.classification).toBe("best");
  });
});

describe("material", () => {
  it("evaluates exchanges with the least valuable recapture", () => {
    // The knight on c6 does not defend d5: Rxd5 simply wins a pawn.
    const chess = new Chess("4k3/8/2n5/3p4/8/8/3R4/3QK3 w - - 0 1");
    const rxd5 = chess.moves({ verbose: true }).find((m) => m.san === "Rxd5")!;
    expect(staticExchange(chess.fen(), rxd5)).toBe(1);
    const defended = new Chess("4k3/8/4p3/3p4/8/8/3R4/3QK3 w - - 0 1");
    const rxd5b = defended.moves({ verbose: true }).find((m) => m.san === "Rxd5")!;
    // Rxd5 exd5 Qxd5: a rook for two pawns, 1 − 5 + 1 = −3.
    expect(staticExchange(defended.fen(), rxd5b)).toBe(-3);
  });

  it("detects a piece left en prise as a sacrifice", () => {
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
    const bxf7 = new Chess(fen).moves({ verbose: true }).find((m) => m.san === "Bxf7+")!;
    const sac = sacrificeOf(fen, bxf7);
    expect(sac?.amount).toBe(2); // bishop (3) for a pawn (1)
    const quiet = new Chess(fen).moves({ verbose: true }).find((m) => m.san === "d3")!;
    expect(sacrificeOf(fen, quiet)).toBeNull();
  });
});

describe("precision", () => {
  it("scores single moves on an exponential curve", () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 1);
    expect(moveAccuracy(0.1)).toBeGreaterThan(60);
    expect(moveAccuracy(0.1)).toBeLessThan(70);
    expect(moveAccuracy(1)).toBe(0);
  });

  it("combines arithmetic and harmonic means", () => {
    expect(gamePrecision([100, 100, 100])).toBeCloseTo(100);
    const oneBlunder = gamePrecision([...Array(39).fill(98), 10])!;
    expect(oneBlunder).toBeGreaterThan(80);
    expect(oneBlunder).toBeLessThan(96);
    expect(gamePrecision([])).toBeNull();
  });

  it("reviews a game, counting each player's moves and the pending ones", () => {
    const start = new Chess().fen();
    const afterE4 = afterFen(start, "e2e4");
    const afterF6 = afterFen(afterE4, "f7f6");
    const review = reviewGame(
      [
        { fenBefore: start, uci: "e2e4", san: "e4", ply: 1, isBook: true },
        { fenBefore: afterE4, uci: "f7f6", san: "f6", ply: 2, isBook: false },
        { fenBefore: afterF6, uci: "d2d4", san: "d4", ply: 3, isBook: false },
      ],
      [
        analysis(start, [["e2e4", cp(30)]]),
        analysis(afterE4, [
          ["e7e5", cp(30)],
          ["f7f6", cp(120)],
        ]),
        analysis(afterF6, [["d2d4", cp(120)]]),
        null,
      ],
    );
    expect(review.moves.map((m) => m.result.classification)).toEqual(["book", "inaccuracy"]);
    expect(review.pending).toBe(1);
    expect(review.white.counts.book).toBe(1);
    expect(review.black.counts.inaccuracy).toBe(1);
    expect(review.white.precision).toBeNull(); // book moves only
    expect(review.black.precision).toBeLessThan(90);
  });
});

describe("classification sensitivity", () => {
  const order = ["best", "excellent", "good", "inaccuracy", "mistake", "blunder"];
  const severity = (played: number, sensitivity: "lenient" | "standard" | "strict") => {
    const fen = new Chess().fen();
    const result = classifyMove(
      {
        fenBefore: fen,
        uci: "d2d4",
        before: analysis(fen, [
          ["e2e4", cp(30)],
          ["d2d4", cp(played)],
        ]),
        after: analysis(afterFen(fen, "d2d4"), [["e7e5", cp(played)]]),
        isBook: false,
      },
      rulesFor(sensitivity),
    );
    return order.indexOf(result.classification);
  };

  it("is stricter or more lenient on the same move, never inconsistent", () => {
    let differs = false;
    for (let played = 25; played >= -500; played -= 15) {
      const [lenient, standard, strict] = (["lenient", "standard", "strict"] as const).map((s) =>
        severity(played, s),
      );
      expect(lenient).toBeLessThanOrEqual(standard!);
      expect(standard).toBeLessThanOrEqual(strict!);
      if (lenient !== strict) differs = true;
    }
    expect(differs).toBe(true);
  });
});

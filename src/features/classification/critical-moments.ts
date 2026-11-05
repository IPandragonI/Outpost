import type { Color } from "@/lib/chess/position";
import { moverOf, type GameReview, type ReviewedMove } from "./game-review";

export type CriticalKind = "firstMistake" | "biggestBlunder" | "missedWin" | "brilliant" | "swing";

export interface CriticalMoment {
  kind: CriticalKind;
  /** Ply of the move (1 = White's first move). */
  ply: number;
  san: string;
  color: Color;
  /** Winning chances lost by the move (0–1), for mistakes. */
  loss: number;
  /** Change in White's winning chances across the move (signed, -1 to 1), for swings. */
  swing: number;
  /** The classification of the move, for its icon. */
  classification: ReviewedMove["result"]["classification"];
}

const MAJOR = new Set(["mistake", "blunder", "miss"]);

function byLoss(a: ReviewedMove, b: ReviewedMove) {
  return b.result.loss - a.result.loss;
}

function moment(kind: CriticalKind, move: ReviewedMove, swing = 0): CriticalMoment {
  return {
    kind,
    ply: move.ply,
    san: move.san,
    color: moverOf(move),
    loss: move.result.loss,
    swing,
    classification: move.result.classification,
  };
}

/**
 * The few moments of the game worth jumping to, from what has been analyzed so far:
 * the first major mistake, the worst blunder, the costliest missed win, the best find,
 * and the largest swings in the evaluation. A move is listed once, under the first reason
 * that applies. When more than `limit` apply, the earlier reasons win; the list is then
 * put in game order.
 */
export function criticalMoments(review: GameReview, limit = 6): CriticalMoment[] {
  const picked = new Map<number, CriticalMoment>();
  const add = (kind: CriticalKind, move: ReviewedMove | undefined, swing = 0) => {
    if (move && !picked.has(move.ply)) picked.set(move.ply, moment(kind, move, swing));
  };

  add(
    "firstMistake",
    review.moves.find((m) => MAJOR.has(m.result.classification)),
  );
  add(
    "biggestBlunder",
    review.moves.filter((m) => m.result.classification === "blunder").sort(byLoss)[0],
  );
  add("missedWin", review.moves.filter((m) => m.result.classification === "miss").sort(byLoss)[0]);
  add(
    "brilliant",
    review.moves.find(
      (m) => m.result.classification === "brilliant" || m.result.classification === "great",
    ),
  );

  const swings = [...review.turningPoints].sort(
    (a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from),
  );
  for (const tp of swings) {
    add(
      "swing",
      review.moves.find((m) => m.ply === tp.ply),
      tp.to - tp.from,
    );
  }

  return [...picked.values()].slice(0, limit).sort((a, b) => a.ply - b.ply);
}

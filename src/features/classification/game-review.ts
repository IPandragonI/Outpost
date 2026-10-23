import { Chess } from "chess.js";
import { parseUci, sideToMove, type Color } from "@/lib/chess/position";
import { whiteWinChance } from "@/features/engine/evaluation";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import {
  CLASSIFICATIONS,
  DEFAULT_RULES,
  isError,
  type Classification,
  type ClassificationRules,
} from "./classification-rules";
import { classifyMove, type MoveClassification } from "./classify-move";

export interface ReviewMove {
  /** Position before the move. */
  fenBefore: string;
  uci: string;
  san: string;
  ply: number;
  /** The resulting position is in the opening dataset. */
  isBook: boolean;
}

export interface ReviewedMove extends ReviewMove {
  result: MoveClassification;
  /** Precision of this move, 0–100 (see moveAccuracy). */
  accuracy: number;
}

export interface PlayerSummary {
  color: Color;
  counts: Record<Classification, number>;
  /** Application-specific precision score, 0–100 (see gamePrecision). */
  precision: number | null;
  /** Average centipawn loss over non-book, non-forced moves. */
  averageCpLoss: number | null;
  movesReviewed: number;
}

export interface TurningPoint {
  index: number;
  ply: number;
  /** White's winning chances before and after. */
  from: number;
  to: number;
}

export interface GameReview {
  moves: ReviewedMove[];
  white: PlayerSummary;
  black: PlayerSummary;
  turningPoints: TurningPoint[];
  /** Moves still waiting for analysis (missing positions). */
  pending: number;
}

/**
 * Per-move precision from the expected-points loss, on an exponential curve: 100 for the
 * best move, about 65 for a 10-point loss, about 42 for a 20-point loss. The constants
 * come from the curve lichess publishes for its accuracy metric
 * (103.1668·e^(−0.04354·loss%) − 3.1669); this is not Chess.com's accuracy formula.
 */
export function moveAccuracy(loss: number): number {
  const value = 103.1668 * Math.exp(-0.04354 * loss * 100) - 3.1669;
  return Math.max(0, Math.min(100, value));
}

/**
 * Game precision: the mean of the arithmetic and harmonic means of the per-move scores.
 * The harmonic mean weighs the few bad moves heavily, the arithmetic mean keeps a game
 * with one blunder among forty good moves from collapsing to the blunder's score.
 * Book and forced moves are left out: they say nothing about the player.
 */
export function gamePrecision(accuracies: readonly number[]): number | null {
  if (!accuracies.length) return null;
  const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  const harmonic = accuracies.length / accuracies.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
  return (mean + harmonic) / 2;
}

function emptyCounts(): Record<Classification, number> {
  return Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as Record<Classification, number>;
}

/**
 * Reviews a game's main line. `positions[i]` is the analysis of the position before
 * `moves[i]`, and `positions[moves.length]` the final position; missing analyses
 * (null) leave the moves around them unclassified and counted as pending.
 */
export function reviewGame(
  moves: readonly ReviewMove[],
  positions: readonly (PositionAnalysis | null)[],
  rules: ClassificationRules = DEFAULT_RULES,
): GameReview {
  const reviewed: ReviewedMove[] = [];
  let pending = 0;
  let previous: { loss: number; uci: string; fenBefore: string } | null = null;

  moves.forEach((move, i) => {
    const before = positions[i];
    const after = positions[i + 1];
    if (!before || !after) {
      pending++;
      previous = null;
      return;
    }
    let previousMove = null;
    if (previous) {
      try {
        previousMove = new Chess(previous.fenBefore).move(parseUci(previous.uci));
      } catch {
        previousMove = null;
      }
    }
    const result = classifyMove(
      {
        fenBefore: move.fenBefore,
        uci: move.uci,
        before,
        after,
        isBook: move.isBook,
        ...(previous ? { opponentLoss: previous.loss } : {}),
        previousMove,
      },
      rules,
    );
    reviewed.push({ ...move, result, accuracy: moveAccuracy(result.loss) });
    // Theory and forced moves are not errors that create a chance for the opponent (and
    // book positions are searched shallowly, see planLimits).
    const notJudged = result.classification === "book" || result.classification === "forced";
    previous = { loss: notJudged ? 0 : result.loss, uci: move.uci, fenBefore: move.fenBefore };
  });

  const summarize = (color: Color): PlayerSummary => {
    const own = reviewed.filter((m) => m.result.mover === color);
    const counts = emptyCounts();
    for (const m of own) counts[m.result.classification]++;
    const judged = own.filter(
      (m) => m.result.classification !== "book" && m.result.classification !== "forced",
    );
    return {
      color,
      counts,
      precision: gamePrecision(judged.map((m) => m.accuracy)),
      averageCpLoss: judged.length
        ? judged.reduce((sum, m) => sum + m.result.cpLoss, 0) / judged.length
        : null,
      movesReviewed: own.length,
    };
  };

  // Turning points: moves that swing White's chances by 20 points or more.
  const turningPoints: TurningPoint[] = [];
  moves.forEach((move, i) => {
    const before = positions[i];
    const after = positions[i + 1];
    if (!before || !after) return;
    const from = whiteWinChance(before.score);
    const to = whiteWinChance(after.score);
    if (Math.abs(to - from) >= 0.2) turningPoints.push({ index: i, ply: move.ply, from, to });
  });

  return { moves: reviewed, white: summarize("w"), black: summarize("b"), turningPoints, pending };
}

/** The most costly errors of the game, worst first. */
export function biggestErrors(review: GameReview, limit = 5): ReviewedMove[] {
  return review.moves
    .filter((m) => isError(m.result.classification))
    .sort((a, b) => b.result.loss - a.result.loss)
    .slice(0, limit);
}

export function moverOf(move: ReviewMove): Color {
  return sideToMove(move.fenBefore);
}

import {
  CLASSIFICATIONS,
  type Classification,
} from "@/features/classification/classification-rules";
import {
  PHASES,
  reviewGame,
  type Phase,
  type PlayerSummary,
  type ReviewMove,
} from "@/features/classification/game-review";
import { themeSummary, type Theme } from "@/features/classification/themes";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import type { OpeningBook } from "@/features/openings/opening-book";

/** What the profile keeps of one player's side of an analyzed game. */
export interface PlayerGameStats {
  /** Precision, 0–100 (see gamePrecision), null without judged moves. */
  precision: number | null;
  averageCpLoss: number | null;
  /** Rough level suggested by the average centipawn loss (see estimateRating). */
  estimatedRating: number | null;
  /** Moves of this player that were reviewed. */
  moves: number;
  counts: Record<Classification, number>;
  phases: Record<Phase, { precision: number | null; moves: number }>;
  themes: Partial<Record<Theme, number>>;
}

/**
 * A compact digest of a game's review, stored with the game so the profile can be built
 * without reading every position again. Both sides are kept: which one is "me" depends on
 * the saved username, which can change.
 */
export interface GameSummary {
  version: 1;
  white: PlayerGameStats;
  black: PlayerGameStats;
}

export const SUMMARY_VERSION = 1;

interface LineNode {
  fen: string;
  uci: string | null;
  san: string | null;
  ply: number;
}

function playerStats(
  summary: PlayerSummary,
  themes: Partial<Record<Theme, number>>,
): PlayerGameStats {
  return {
    precision: summary.precision,
    averageCpLoss: summary.averageCpLoss,
    estimatedRating: summary.estimatedRating,
    moves: summary.movesReviewed,
    counts: Object.fromEntries(CLASSIFICATIONS.map((c) => [c, summary.counts[c]])) as Record<
      Classification,
      number
    >,
    phases: Object.fromEntries(PHASES.map((p) => [p, { ...summary.phases[p] }])) as Record<
      Phase,
      { precision: number | null; moves: number }
    >,
    themes,
  };
}

/**
 * Reviews a game from its stored analyses and digests it. `line` is the main line from the
 * start position (node 0) and `positions[i]` the analysis of `line[i]`; null when any
 * analysis is missing (the game is not fully analyzed). The book rule is the one of the
 * game review (see useGameReview).
 */
export function buildSummary(
  line: readonly LineNode[],
  positions: readonly (PositionAnalysis | null)[],
  book: Pick<OpeningBook, "has" | "identify"> | null,
): GameSummary | null {
  if (line.length < 2 || positions.length !== line.length || positions.some((p) => !p)) {
    return null;
  }
  const lastBookIndex = book ? book.identify(line.map((n) => n.fen)).lastBookIndex : -1;
  const moves: ReviewMove[] = line.slice(1).map((node, i) => ({
    fenBefore: line[i]!.fen,
    uci: node.uci!,
    san: node.san!,
    ply: node.ply,
    isBook: Boolean(book?.has(node.fen)) && i + 1 <= lastBookIndex,
  }));
  const review = reviewGame(moves, positions);
  const themes = themeSummary(review);
  return {
    version: SUMMARY_VERSION,
    white: playerStats(review.white, themes.w),
    black: playerStats(review.black, themes.b),
  };
}

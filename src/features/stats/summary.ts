import {
  CLASSIFICATIONS,
  type Classification,
} from "@/features/classification/classification-rules";
import {
  PHASES,
  reviewGame,
  type Phase,
  type PlayerSummary,
  type ReviewedMove,
  type ReviewMove,
} from "@/features/classification/game-review";
import type { AliveStats } from "@/features/classification/rating-model";
import { themeSummary, type Theme } from "@/features/classification/themes";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import type { OpeningBook } from "@/features/openings/opening-book";

/** How a player went about a game, from the moves alone (no engine needed). */
export interface StyleFeatures {
  /** The player's moves in the game. */
  moves: number;
  captures: number;
  checks: number;
  pawnMoves: number;
  /** The queen moved within the first ten moves. */
  queenEarly: boolean;
  /** Number of the move that castled, null if the player never did. */
  castleMove: number | null;
  /** Moves still in the opening book. */
  bookMoves: number;
  /** The player reached the endgame. */
  endgame: boolean;
}

/** How the player's moves went when the clock was low (needs the clock of each move). */
export interface TimePressure {
  /** Moves with a clock reading. */
  measured: number;
  /** Of those, played with little time left. */
  low: number;
  /** Inaccuracies and worse, among the low-clock moves and among the others. */
  lowErrors: number;
  normalErrors: number;
}

/** What the profile keeps of one player's side of an analyzed game. */
export interface PlayerGameStats {
  /** Precision, 0–100 (see gamePrecision), null without judged moves. */
  precision: number | null;
  averageCpLoss: number | null;
  /** Rough level suggested by the open-position moves (see rating-model), rounded to 50. */
  estimatedRating: number | null;
  /** Moves of this player that were reviewed. */
  moves: number;
  /** The moves played while the position was still open, which a level is read from. */
  alive: AliveStats;
  counts: Record<Classification, number>;
  phases: Record<Phase, { precision: number | null; moves: number }>;
  themes: Partial<Record<Theme, number>>;
  style: StyleFeatures;
  timePressure: TimePressure | null;
  /** Swings of 20 points or more in the whole game (the same for both sides). */
  turningPoints: number;
}

/**
 * A compact digest of a game's review, stored with the game so the profile can be built
 * without reading every position again. Both sides are kept: which one is "me" depends on
 * the saved username, which can change.
 */
export interface GameSummary {
  version: 2;
  white: PlayerGameStats;
  black: PlayerGameStats;
}

export const SUMMARY_VERSION = 2;

interface LineNode {
  fen: string;
  uci: string | null;
  san: string | null;
  ply: number;
  /** Remaining clock in seconds after the move, when the PGN has it. */
  clock?: number | undefined;
}

export interface SummaryExtras {
  /** The PGN `TimeControl` header ("600", "180+2"), to tell what a low clock is. */
  timeControl?: string | undefined;
}

/** Seconds left under which a move counts as played under time pressure; 0: no clocks. */
export function lowClockSeconds(timeControl: string | undefined): number {
  if (timeControl?.includes("/")) return 0;
  const base = Number(/^(\d+)/.exec(timeControl ?? "")?.[1]);
  return Number.isFinite(base) && base > 0 ? Math.max(10, Math.round(base * 0.1)) : 15;
}

const ERRORS = new Set(["inaccuracy", "mistake", "miss", "blunder"]);

function styleOf(own: readonly ReviewedMove[]): StyleFeatures {
  const first = own.findIndex((m) => m.san.startsWith("O-O"));
  return {
    moves: own.length,
    captures: own.filter((m) => m.san.includes("x")).length,
    checks: own.filter((m) => /[+#]/.test(m.san)).length,
    pawnMoves: own.filter((m) => /^[a-h]/.test(m.san)).length,
    queenEarly: own.slice(0, 10).some((m) => m.san.startsWith("Q")),
    castleMove: first === -1 ? null : first + 1,
    bookMoves: own.filter((m) => m.isBook).length,
    endgame: own.some((m) => m.phase === "endgame"),
  };
}

function timePressureOf(
  own: readonly ReviewedMove[],
  clockOf: (ply: number) => number | undefined,
  lowSeconds: number,
): TimePressure | null {
  if (lowSeconds <= 0) return null;
  const timed = own.flatMap((m) => {
    const clock = clockOf(m.ply);
    return clock === undefined
      ? []
      : [{ low: clock <= lowSeconds, error: ERRORS.has(m.result.classification) }];
  });
  if (timed.length < 10) return null;
  return {
    measured: timed.length,
    low: timed.filter((t) => t.low).length,
    lowErrors: timed.filter((t) => t.low && t.error).length,
    normalErrors: timed.filter((t) => !t.low && t.error).length,
  };
}

function playerStats(
  summary: PlayerSummary,
  themes: Partial<Record<Theme, number>>,
  own: readonly ReviewedMove[],
  turningPoints: number,
  clockOf: (ply: number) => number | undefined,
  lowSeconds: number,
): PlayerGameStats {
  return {
    precision: summary.precision,
    averageCpLoss: summary.averageCpLoss,
    estimatedRating: summary.estimatedRating,
    moves: summary.movesReviewed,
    alive: { ...summary.alive },
    counts: Object.fromEntries(CLASSIFICATIONS.map((c) => [c, summary.counts[c]])) as Record<
      Classification,
      number
    >,
    phases: Object.fromEntries(PHASES.map((p) => [p, { ...summary.phases[p] }])) as Record<
      Phase,
      { precision: number | null; moves: number }
    >,
    themes,
    style: styleOf(own),
    timePressure: timePressureOf(own, clockOf, lowSeconds),
    turningPoints,
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
  extras: SummaryExtras = {},
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
  const rootPly = line[0]!.ply;
  const clockOf = (ply: number) => line[ply - rootPly]?.clock;
  const lowSeconds = lowClockSeconds(extras.timeControl);
  const side = (color: "w" | "b") =>
    playerStats(
      color === "w" ? review.white : review.black,
      themes[color],
      review.moves.filter((m) => m.result.mover === color),
      review.turningPoints.length,
      clockOf,
      lowSeconds,
    );
  return { version: SUMMARY_VERSION, white: side("w"), black: side("b") };
}

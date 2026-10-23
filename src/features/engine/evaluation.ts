import type { Color } from "@/lib/chess/position";
import type { Translate } from "@/lib/i18n/translate";

/**
 * An engine evaluation, always stored from White's point of view.
 *
 * Mates carry their winner explicitly instead of a signed move count: "mate 0" (the side
 * to move is already checkmated) has no sign, and keeping the winner apart removes any
 * doubt about whose point of view a number is in.
 */
export type Score = { kind: "cp"; cp: number } | { kind: "mate"; moves: number; winner: Color };

export const opposite = (color: Color): Color => (color === "w" ? "b" : "w");

/**
 * Converts a UCI `score cp|mate N`, which is given from the side to move's point of view,
 * to a White point-of-view Score.
 */
export function fromUci(kind: "cp" | "mate", value: number, turn: Color): Score {
  if (kind === "cp") return { kind: "cp", cp: turn === "w" ? value : -value };
  // mate N > 0: the side to move mates in N; N < 0 or N = 0: the side to move is mated.
  return { kind: "mate", moves: Math.abs(value), winner: value > 0 ? turn : opposite(turn) };
}

export function cp(value: number): Score {
  return { kind: "cp", cp: value };
}

export function mate(moves: number, winner: Color): Score {
  return { kind: "mate", moves, winner };
}

/**
 * Logistic conversion from centipawns to White's winning chances, the curve fitted by
 * lichess on rated games (Win% = 50 + 50 · (2 / (1 + e^(−0.00368208·cp)) − 1)). Scores
 * beyond ±1000 cp are clamped: the curve is flat there anyway, and engine scores that
 * large are noisy.
 */
const WIN_CURVE = 0.00368208;
const CP_CLAMP = 1000;

/** White's expected score in [0, 1]: 1 when White wins, 0 when Black wins. */
export function whiteWinChance(score: Score): number {
  if (score.kind === "mate") return score.winner === "w" ? 1 : 0;
  const clamped = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, score.cp));
  return 1 / (1 + Math.exp(-WIN_CURVE * clamped));
}

/** Expected score in [0, 1] for `color`. */
export function winChanceFor(score: Score, color: Color): number {
  const white = whiteWinChance(score);
  return color === "w" ? white : 1 - white;
}

/**
 * A single number for ordering scores from `color`'s point of view: mates beat any
 * centipawn score, and a shorter mate beats a longer one.
 */
export function scoreValueFor(score: Score, color: Color): number {
  if (score.kind === "cp") return color === "w" ? score.cp : -score.cp;
  const magnitude = 100_000 - score.moves * 100;
  return score.winner === color ? magnitude : -magnitude;
}

/** Centipawns from `color`'s point of view; mates count as ±`mateCp`. */
export function centipawnsFor(score: Score, color: Color, mateCp = 10_000): number {
  if (score.kind === "cp") return color === "w" ? score.cp : -score.cp;
  return score.winner === color ? mateCp : -mateCp;
}

/** "+1.25", "−0.40", "0.00", "#3" (White mates), "−#2" (Black mates), "1-0" once mated. */
export function formatScore(score: Score): string {
  if (score.kind === "mate") {
    if (score.moves === 0) return score.winner === "w" ? "1-0" : "0-1";
    return `${score.winner === "w" ? "" : "−"}#${score.moves}`;
  }
  const pawns = score.cp / 100;
  if (Math.abs(pawns) < 0.005) return "0.00";
  return `${pawns > 0 ? "+" : "−"}${Math.abs(pawns).toFixed(2)}`;
}

/** Short spoken form for screen readers. */
export function describeScore(score: Score, t: Translate): string {
  if (score.kind === "mate") {
    const white = score.winner === "w";
    if (score.moves === 0) return t(white ? "score.whiteMated" : "score.blackMated");
    return t(white ? "score.whiteMates" : "score.blackMates", { n: score.moves });
  }
  if (Math.abs(score.cp) < 15) return t("score.equal");
  const pawns = Math.abs(score.cp / 100).toFixed(1);
  return t(score.cp > 0 ? "score.whiteBetter" : "score.blackBetter", { pawns });
}

/**
 * Evaluation bar / graph value in [−1, 1] (White positive), on the winning-chances scale
 * so that +8 and +15 look alike while +0.5 and +1.5 do not.
 */
export function barValue(score: Score): number {
  return whiteWinChance(score) * 2 - 1;
}

export function scoresEqual(a: Score, b: Score): boolean {
  if (a.kind === "cp" && b.kind === "cp") return a.cp === b.cp;
  if (a.kind === "mate" && b.kind === "mate") return a.moves === b.moves && a.winner === b.winner;
  return false;
}

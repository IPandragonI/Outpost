import { Chess, type Move } from "chess.js";
import { parseUci, sideToMove, type Color } from "@/lib/chess/position";
import {
  centipawnsFor,
  opposite,
  scoreValueFor,
  winChanceFor,
  type Score,
} from "@/features/engine/evaluation";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import {
  DEFAULT_RULES,
  type Classification,
  type ClassificationRules,
} from "./classification-rules";
import { isObviousCapture, sacrificeOf, type Sacrifice } from "./material";

export interface MoveInput {
  /** Position the move was played in. */
  fenBefore: string;
  uci: string;
  /** Engine analysis of `fenBefore`; MultiPV ≥ 2 enables the "great" and "brilliant" checks. */
  before: PositionAnalysis;
  /** Engine analysis of the position after the move. */
  after: PositionAnalysis;
  /** The resulting position is in the opening dataset. */
  isBook: boolean;
  /** Expected points the opponent's previous move lost, when it was classified. */
  opponentLoss?: number;
  /** The opponent's previous move, to recognize recaptures. */
  previousMove?: Pick<Move, "to" | "captured"> | null;
}

export type MoveFlag =
  /** The move allows a forced mate that the best move did not. */
  | "allows-mate"
  /** A forced mate was available and is no longer. */
  | "missed-mate"
  /** Still mating, but more slowly than the best move. */
  | "slower-mate"
  /** All other moves are clearly worse. */
  | "only-move"
  /** The move leaves material en prise. */
  | "sacrifice"
  /** The searches were shallow: treat the verdict with caution. */
  | "low-confidence";

export interface MoveClassification {
  classification: Classification;
  mover: Color;
  /** White point of view, like every Score. */
  bestScore: Score;
  playedScore: Score;
  /** Mover's winning chances (0–1) with the best move, and after the played move. */
  chanceBest: number;
  chancePlayed: number;
  /** Expected points lost by the move: chanceBest − chancePlayed, never negative. */
  loss: number;
  /** Centipawns lost from the mover's point of view, scores clamped to ±1000. */
  cpLoss: number;
  bestMove: string | null;
  /** Best line from `fenBefore`, in UCI, starting with the best move. */
  bestLine: string[];
  /** The engine's reply line after the played move, in UCI. */
  replyLine: string[];
  isBestMove: boolean;
  /** Mover's chances with the strongest alternative to the played move, if searched. */
  alternativeChance?: number;
  sacrifice?: Sacrifice;
  flags: MoveFlag[];
  /** Depth of the shallower of the two searches. */
  depth: number;
}

function clampCp(score: Score, color: Color): number {
  return Math.max(-1000, Math.min(1000, centipawnsFor(score, color, 1000)));
}

function isMateFor(score: Score, color: Color): boolean {
  return score.kind === "mate" && score.winner === color;
}

function legalMove(fen: string, uci: string): Move {
  try {
    return new Chess(fen).move(parseUci(uci));
  } catch {
    throw new Error(`Illegal move ${uci} in ${fen}`);
  }
}

/**
 * Classifies one move from the analyses of the positions before and after it.
 * Pure: the same inputs always give the same verdict. See docs/CLASSIFICATION.md.
 */
export function classifyMove(
  input: MoveInput,
  rules: ClassificationRules = DEFAULT_RULES,
): MoveClassification {
  const { fenBefore, uci, before, after } = input;
  const mover = sideToMove(fenBefore);
  const move = legalMove(fenBefore, uci);
  const legalMoves = new Chess(fenBefore).moves().length;

  const bestLine = before.lines[0]?.pv ?? (before.bestMove ? [before.bestMove] : []);
  const bestMove = before.bestMove ?? bestLine[0] ?? null;
  const bestScore = before.lines[0]?.score ?? before.score;

  // Prefer the played move's score from the same search as the best move (MultiPV), so
  // both numbers come from one search; otherwise use the search of the resulting position.
  const isBestMove = bestMove === uci;
  const sameSearch = before.lines.find((l) => l.pv[0] === uci);
  const playedScore = isBestMove ? bestScore : (sameSearch?.score ?? after.score);

  const chanceBest = winChanceFor(bestScore, mover);
  const chancePlayed = winChanceFor(playedScore, mover);
  const playedAtLeastAsGood = scoreValueFor(playedScore, mover) >= scoreValueFor(bestScore, mover);
  const loss = isBestMove || playedAtLeastAsGood ? 0 : Math.max(0, chanceBest - chancePlayed);
  const cpLoss = Math.max(0, clampCp(bestScore, mover) - clampCp(playedScore, mover));

  const alternatives = before.lines.filter((l) => l.pv[0] !== uci);
  const alternativeChance = alternatives.length
    ? Math.max(...alternatives.map((l) => winChanceFor(l.score, mover)))
    : undefined;

  const depth = Math.min(before.depth, after.lines.length ? after.depth : before.depth);
  const flags: MoveFlag[] = [];
  if (depth < rules.minConfidentDepth) flags.push("low-confidence");
  if (isMateFor(playedScore, opposite(mover)) && !isMateFor(bestScore, opposite(mover))) {
    flags.push("allows-mate");
  }
  if (isMateFor(bestScore, mover) && !isMateFor(playedScore, mover)) flags.push("missed-mate");
  if (
    isMateFor(bestScore, mover) &&
    isMateFor(playedScore, mover) &&
    playedScore.kind === "mate" &&
    bestScore.kind === "mate" &&
    playedScore.moves > bestScore.moves + 1
  ) {
    flags.push("slower-mate");
  }

  const result = (
    classification: Classification,
    extra: Partial<MoveClassification> = {},
  ): MoveClassification => ({
    classification,
    mover,
    bestScore,
    playedScore,
    chanceBest,
    chancePlayed,
    loss,
    cpLoss,
    bestMove,
    bestLine,
    replyLine: after.lines[0]?.pv ?? [],
    isBestMove: isBestMove || playedAtLeastAsGood,
    ...(alternativeChance !== undefined ? { alternativeChance } : {}),
    flags,
    depth,
    ...extra,
  });

  if (legalMoves === 1) return result("forced");
  if (input.isBook) return result("book");

  let base: Classification;
  if (isBestMove || playedAtLeastAsGood) base = "best";
  else if (loss <= rules.excellent) base = "excellent";
  else if (loss <= rules.good) base = "good";
  else if (loss <= rules.inaccuracy) base = "inaccuracy";
  else if (loss <= rules.mistake) base = "mistake";
  else base = "blunder";

  // Miss: the opponent's error offered a winning continuation; the move let it go
  // without throwing the game away (that would stay a blunder).
  if (
    (base === "mistake" || base === "blunder") &&
    (input.opponentLoss ?? 0) >= rules.missMinOpponentLoss &&
    chanceBest >= Math.max(rules.missMinBestChance, rules.winningChance) &&
    chancePlayed >= rules.missMinPlayedChance
  ) {
    return result("miss");
  }

  if (base !== "best" && base !== "excellent") return result(base);
  const deepEnough = before.depth >= rules.minSpecialDepth && after.depth >= rules.minSpecialDepth;
  if (!deepEnough && after.lines.length) return result(base);

  // Brilliant: a sound sacrifice that was needed (no alternative keeps a crushing position).
  const sacrifice = sacrificeOf(fenBefore, move);
  if (sacrifice) flags.push("sacrifice");
  if (
    sacrifice &&
    sacrifice.amount >= rules.brilliantMinSacrifice &&
    chancePlayed >= rules.brilliantMinChance &&
    (alternativeChance === undefined || alternativeChance < rules.brilliantMaxAlternativeChance)
  ) {
    return result("brilliant", { sacrifice });
  }

  // Great: the only move that keeps the outcome (a win, or a game that is not lost):
  // every alternative falls into a worse band. Taking material that was there for the
  // taking and delivering mate are excluded: they are best, but not hard to find.
  const band = (chance: number) =>
    chance >= rules.winningChance ? 2 : chance > rules.losingChance ? 1 : 0;
  if (
    base === "best" &&
    alternativeChance !== undefined &&
    chanceBest - alternativeChance >= rules.greatGap &&
    band(alternativeChance) < band(chanceBest) &&
    chanceBest >= rules.greatMinChance &&
    legalMoves >= 3 &&
    !move.san.endsWith("#") &&
    !isObviousCapture(fenBefore, move, input.previousMove)
  ) {
    flags.push("only-move");
    return result("great", sacrifice ? { sacrifice } : {});
  }

  return result(base, sacrifice ? { sacrifice } : {});
}

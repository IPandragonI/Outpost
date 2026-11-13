import type { ChessComHistory, HistoryGame } from "@/features/chesscom/history";
import { PHASES } from "@/features/classification/game-review";
import { MIN_ALIVE_MOVES, rawRating } from "@/features/classification/rating-model";
import type { Outcome, ProfileGame } from "./profile";
import type { PlayerGameStats } from "./summary";

/**
 * The player's estimated level.
 *
 * Two sources of evidence that can disagree:
 *  - what the analyzed moves look like (rating-model): informative about trends and about
 *    how the player plays, but a rule of thumb whose absolute scale can be off;
 *  - the player's actual Chess.com rating and results over all their games: an anchor that
 *    the scale of the moves cannot drift away from.
 * They are combined like two measurements with their uncertainty (a precision-weighted
 * mean): the rating anchors the estimate, and the moves move it by as much as their
 * evidence deserves. Without Chess.com data, the moves speak alone, and the result says it
 * is not anchored.
 *
 * A second problem is selection: the games that get analyzed are often the won ones (or the
 * lost ones), not a fair sample. When the full history is known, each analyzed game is
 * weighted so that the mix of wins, draws and losses matches the player's real record.
 */

export interface SelectionReport {
  analyzed: { games: number; win: number; draw: number; loss: number; score: number | null };
  overall: { games: number; win: number; draw: number; loss: number; score: number | null };
  /** Outcomes the player really has that no analyzed game shows. */
  missing: Outcome[];
  /** The analyzed games are clearly not a fair sample of the player's results. */
  biased: boolean;
}

export interface Anchor {
  rating: number;
  /** Where the rating comes from: the player's Chess.com stats, their latest games, or game headers. */
  source: "profile" | "games" | "headers";
  timeClass: string | null;
  /** Performance rating over the latest rated games (opponents' average plus the score). */
  performance: number | null;
  /** Rated games the anchor rests on. */
  games: number;
  /** Uncertainty of the anchor, in rating points. */
  sigma: number;
}

export interface LevelEstimate {
  estimate: number | null;
  /** An 80 % range around the estimate. */
  low: number | null;
  high: number | null;
  /** Analyzed games the moves' evidence rests on. */
  games: number;
  /** Points gained (positive) or lost over the latest 5 games, null under 10 games. */
  trend: number | null;
  provisional: boolean;
  method: "anchored" | "moves" | "none";
  /** What the moves alone suggest, before anchoring. */
  moves: number | null;
  anchor: Anchor | null;
  reliability: "low" | "medium" | "high";
  selection: SelectionReport | null;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round10 = (value: number) => Math.round(value / 10) * 10;
const DAY = 86_400;

/**
 * Points taken off a level read from the moves: the phases are very uneven (a strong opening
 * does not make up for a collapsing endgame), or a lot of moves were played in time trouble.
 */
export function penaltyOf(stats: PlayerGameStats): number {
  let penalty = 0;
  const phases = PHASES.flatMap((p) => {
    const { precision, moves } = stats.phases[p];
    return precision !== null && moves >= 4 ? [precision] : [];
  });
  if (phases.length >= 2) {
    const spread = Math.max(...phases) - Math.min(...phases);
    if (spread > 15) penalty += Math.min(40, (spread - 15) * 2);
  }
  const pressure = stats.timePressure;
  if (pressure && pressure.measured >= 10 && pressure.low / pressure.measured >= 0.25) {
    penalty += 30;
  }
  return penalty;
}

/** The level one side's play in one game suggests (see rating-model), less its penalties. */
export function gameRating(stats: PlayerGameStats): number | null {
  const raw = rawRating(stats.alive);
  return raw === null ? null : clamp(round10(raw - penaltyOf(stats)), 300, 2900);
}

/**
 * The level the moves of several games suggest together. Short games give few moves played
 * in open positions, too few to say anything alone, so their moves are pooled (each game
 * weighted, and counted by its own moves) before the rating is read. Also gives the number of
 * games that contributed, and how much evidence that is.
 */
export function pooledRating(
  games: readonly ProfileGame[],
  weights: readonly number[],
): { rating: number | null; games: number; evidence: number } {
  let moves = 0;
  let rawMoves = 0;
  let acpl = 0;
  let precision = 0;
  let mistakes = 0;
  let blunders = 0;
  let penalty = 0;
  let contributing = 0;
  let evidence = 0;
  games.forEach((g, i) => {
    const a = g.stats.alive;
    if (!a.moves || a.acpl === null || a.precision === null) return;
    const w = weights[i]!;
    contributing++;
    rawMoves += a.moves;
    moves += w * a.moves;
    acpl += w * a.moves * a.acpl;
    precision += w * a.moves * a.precision;
    mistakes += w * a.mistakes;
    blunders += w * a.blunders;
    penalty += w * a.moves * penaltyOf(g.stats);
    evidence += a.moves / (a.moves + 20);
  });
  if (!moves || rawMoves < MIN_ALIVE_MOVES) return { rating: null, games: contributing, evidence };
  const raw = rawRating({
    moves,
    acpl: acpl / moves,
    precision: precision / moves,
    mistakes,
    blunders,
  });
  return {
    rating: raw === null ? null : clamp(round10(raw - penalty / moves), 300, 2900),
    games: contributing,
    evidence,
  };
}

/** The value below which `q` of the total weight lies. */
export function weightedQuantile(
  values: readonly number[],
  weights: readonly number[],
  q: number,
): number | null {
  if (!values.length) return null;
  const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
  const total = order.reduce((sum, i) => sum + weights[i]!, 0);
  let seen = 0;
  for (const i of order) {
    seen += weights[i]!;
    if (seen >= q * total) return values[i]!;
  }
  return values[order[order.length - 1]!]!;
}

function recordOf(outcomes: readonly (Outcome | null)[]) {
  const count = { win: 0, draw: 0, loss: 0 };
  for (const o of outcomes) if (o) count[o]++;
  const games = count.win + count.draw + count.loss;
  return {
    games,
    ...count,
    score: games ? (count.win + count.draw / 2) / games : null,
  };
}

/** The record over the latest year of rated games (or all of them), or null without enough. */
export function overallRecord(history: ChessComHistory | null, now: number) {
  if (!history) return null;
  const rated = history.games.filter((g) => g.rated);
  const lastYear = rated.filter((g) => now / 1000 - g.end <= 365 * DAY);
  const pool = lastYear.length >= 20 ? lastYear : rated;
  return pool.length >= 20 ? recordOf(pool.map((g) => g.result)) : null;
}

/**
 * Weights that make the analyzed games' wins, draws and losses as frequent as in the
 * player's whole record (inverse-probability weighting on the result), plus a report on how
 * representative they are. Outcomes missing from the analyzed games cannot be corrected: the
 * report says so, and the estimate becomes less certain.
 */
export function selectionWeights(
  games: readonly ProfileGame[],
  overall: ReturnType<typeof overallRecord>,
): { weights: number[]; report: SelectionReport | null } {
  const analyzed = recordOf(games.map((g) => g.outcome));
  if (!overall || analyzed.games === 0) {
    return { weights: games.map(() => 1), report: null };
  }
  const share = (n: number, total: number) => (total ? n / total : 0);
  const factor = (outcome: Outcome) => {
    const have = share(analyzed[outcome], analyzed.games);
    return have === 0 ? 1 : Math.min(4, share(overall[outcome], overall.games) / have);
  };
  const raw = games.map((g) => (g.outcome ? factor(g.outcome) : 1));
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  const missing = (["win", "draw", "loss"] as const).filter(
    (o) => analyzed[o] === 0 && share(overall[o], overall.games) >= 0.05,
  );
  const biased =
    missing.length > 0 ||
    (analyzed.games >= 5 &&
      analyzed.score !== null &&
      overall.score !== null &&
      Math.abs(analyzed.score - overall.score) >= 0.2);
  return {
    weights: raw.map((w) => w / mean),
    report: { analyzed, overall, missing, biased },
  };
}

function mostFrequent(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  for (const [value, n] of counts) if (n > (counts.get(best ?? "") ?? 0)) best = value;
  return best;
}

/** The performance rating: opponents' average plus the rating gap the score corresponds to. */
export function performanceRating(games: readonly HistoryGame[]): number | null {
  const withOpponent = games.filter((g) => g.opp !== null);
  if (withOpponent.length < 15) return null;
  const score =
    withOpponent.reduce((s, g) => s + (g.result === "win" ? 1 : g.result === "draw" ? 0.5 : 0), 0) /
    withOpponent.length;
  const p = clamp(score, 0.03, 0.97);
  const opponents = withOpponent.reduce((s, g) => s + g.opp!, 0) / withOpponent.length;
  return Math.round(opponents + 400 * Math.log10(p / (1 - p)));
}

/**
 * The rating the estimate is anchored to: the Chess.com rating of the time class played
 * most lately, or failing that the rating of the latest games, or the ratings written in
 * the analyzed games' headers.
 */
export function findAnchor(
  history: ChessComHistory | null,
  games: readonly ProfileGame[],
  now: number,
): Anchor | null {
  if (history) {
    const rated = history.games.filter((g) => g.rated);
    const recent = rated.filter((g) => now / 1000 - g.end <= 180 * DAY);
    const pool = recent.length >= 10 ? recent : rated.slice(-60);
    const timeClass = mostFrequent(pool.map((g) => g.timeClass));
    if (timeClass) {
      const ofClass = pool.filter((g) => g.timeClass === timeClass);
      const latest = [...ofClass].reverse().find((g) => g.own !== null)?.own ?? null;
      const current = history.ratings[timeClass]?.current ?? null;
      const performance = performanceRating(ofClass.slice(-100));
      const rating = current ?? latest ?? performance;
      if (rating !== null) {
        return {
          rating,
          source: current !== null ? "profile" : "games",
          timeClass,
          performance,
          games: ofClass.length,
          sigma: ofClass.length >= 30 ? 100 : ofClass.length >= 10 ? 140 : 200,
        };
      }
    }
  }
  const headers = [...games]
    .sort((a, b) => b.date - a.date)
    .map((g) => g.ownRating)
    .filter((r): r is number => r !== null)
    .slice(0, 10);
  if (headers.length) {
    return {
      rating: Math.round(headers.reduce((a, b) => a + b, 0) / headers.length),
      source: "headers",
      timeClass: null,
      performance: null,
      games: headers.length,
      sigma: 180,
    };
  }
  return null;
}

/** Median of the latest 5 estimates against the 5 before, in points; null under 10 games. */
function trendOf(games: readonly ProfileGame[]): number | null {
  const ratings = [...games]
    .sort((a, b) => b.date - a.date)
    .map((g) => gameRating(g.stats))
    .filter((r): r is number => r !== null);
  if (ratings.length < 10) return null;
  const equal = [1, 1, 1, 1, 1];
  const recent = weightedQuantile(ratings.slice(0, 5), equal, 0.5)!;
  const before = weightedQuantile(ratings.slice(5, 10), equal, 0.5)!;
  return round10(recent - before);
}

/** The systematic uncertainty of the moves' scale itself, on top of the sampling noise. */
const MODEL_SIGMA = 250;
const SAMPLING_SIGMA = 380;

/**
 * Combines the analyzed games and the Chess.com history into one estimate. See the notes at
 * the top of this file for the reasoning.
 */
export function estimateLevel(
  games: readonly ProfileGame[],
  history: ChessComHistory | null,
  now = Date.now(),
): LevelEstimate {
  const { weights, report } = selectionWeights(games, overallRecord(history, now));
  const pooled = pooledRating(games, weights);
  const moves = pooled.rating;
  const sigmaMoves =
    moves === null
      ? Infinity
      : Math.sqrt(
          SAMPLING_SIGMA ** 2 / Math.max(1, Math.min(20, pooled.evidence)) + MODEL_SIGMA ** 2,
        ) * (report?.biased ? 1.35 : 1);

  const anchor = findAnchor(history, games, now);
  let estimate: number | null = null;
  let sigma = Infinity;
  let method: LevelEstimate["method"] = "none";
  if (anchor && moves !== null) {
    const wAnchor = 1 / anchor.sigma ** 2;
    const wMoves = 1 / sigmaMoves ** 2;
    estimate = (anchor.rating * wAnchor + moves * wMoves) / (wAnchor + wMoves);
    sigma = Math.sqrt(1 / (wAnchor + wMoves));
    method = "anchored";
  } else if (anchor) {
    estimate = anchor.rating;
    sigma = anchor.sigma;
    method = "anchored";
  } else if (moves !== null) {
    estimate = moves;
    sigma = sigmaMoves;
    method = "moves";
  }

  const reliability: LevelEstimate["reliability"] =
    method === "anchored" && sigma <= 110
      ? "high"
      : method === "anchored" || pooled.games >= 15
        ? "medium"
        : "low";
  return {
    estimate: estimate === null ? null : round10(estimate),
    low: estimate === null ? null : round10(estimate - 1.28 * sigma),
    high: estimate === null ? null : round10(estimate + 1.28 * sigma),
    games: pooled.games,
    trend: trendOf(games),
    provisional: method === "moves" && pooled.games < 5,
    method,
    moves: moves === null ? null : round10(moves),
    anchor,
    reliability,
    selection: report,
  };
}

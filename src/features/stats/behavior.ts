import type { ChessComHistory, HistoryGame } from "@/features/chesscom/history";

/**
 * How the player behaves over all their Chess.com games, not only the analyzed ones: what
 * happens right after a loss, and at which time of the day they do best. These need many
 * games to mean anything, so each reading has a minimum.
 */

export type DayPart = "night" | "morning" | "afternoon" | "evening";

export interface Score {
  games: number;
  score: number;
}

export interface Behavior {
  games: number;
  /** The score over all these games. */
  baseline: number | null;
  /** The score in a game played soon after a loss or after a win. */
  afterLoss: Score | null;
  afterWin: Score | null;
  /** The player scores clearly worse right after a loss. */
  tilt: boolean;
  dayParts: (Score & { part: DayPart })[];
  best: DayPart | null;
  worst: DayPart | null;
}

/** Two games within this gap belong to the same sitting. */
const SESSION_GAP_SECONDS = 30 * 60;

const points = (g: HistoryGame) => (g.result === "win" ? 1 : g.result === "draw" ? 0.5 : 0);

function scoreOf(games: readonly HistoryGame[]): Score | null {
  if (!games.length) return null;
  return { games: games.length, score: games.reduce((s, g) => s + points(g), 0) / games.length };
}

/** Night 0–6 h, morning 6–12 h, afternoon 12–18 h, evening 18–24 h, in the viewer's time zone. */
export function dayPartOf(endSeconds: number): DayPart {
  const hour = new Date(endSeconds * 1000).getHours();
  return hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

const MIN_SERIES = 15;
const MIN_PART = 10;

export function behaviorOf(history: ChessComHistory | null): Behavior | null {
  if (!history || history.games.length < 30) return null;
  const games = [...history.games].sort((a, b) => a.end - b.end);
  const baseline = scoreOf(games)!.score;

  const afterLoss: HistoryGame[] = [];
  const afterWin: HistoryGame[] = [];
  for (let i = 1; i < games.length; i++) {
    const previous = games[i - 1]!;
    if (games[i]!.end - previous.end > SESSION_GAP_SECONDS) continue;
    if (previous.result === "loss") afterLoss.push(games[i]!);
    else if (previous.result === "win") afterWin.push(games[i]!);
  }
  const lossScore = afterLoss.length >= MIN_SERIES ? scoreOf(afterLoss) : null;
  const winScore = afterWin.length >= MIN_SERIES ? scoreOf(afterWin) : null;

  const parts: DayPart[] = ["night", "morning", "afternoon", "evening"];
  const dayParts = parts.flatMap((part) => {
    const inPart = scoreOf(games.filter((g) => dayPartOf(g.end) === part));
    return inPart && inPart.games >= MIN_PART ? [{ part, ...inPart }] : [];
  });
  const sorted = [...dayParts].sort((a, b) => b.score - a.score);
  const spread = sorted.length >= 2 ? sorted[0]!.score - sorted[sorted.length - 1]!.score : 0;

  return {
    games: games.length,
    baseline,
    afterLoss: lossScore,
    afterWin: winScore,
    tilt: lossScore !== null && baseline - lossScore.score >= 0.1,
    dayParts,
    best: spread >= 0.1 ? sorted[0]!.part : null,
    worst: spread >= 0.1 ? sorted[sorted.length - 1]!.part : null,
  };
}

export interface HistorySummary {
  games: number;
  win: number;
  draw: number;
  loss: number;
  /** Date of the oldest game read, in milliseconds. */
  since: number | null;
  complete: boolean;
  fetchedAt: number;
  byClass: {
    timeClass: string;
    games: number;
    score: number;
    current: number | null;
    best: number | null;
  }[];
}

/** What was read: how many games, the record, and the rating of each time class. */
export function summarizeHistory(history: ChessComHistory): HistorySummary {
  const classes = new Map<string, HistoryGame[]>();
  for (const g of history.games) classes.set(g.timeClass, [...(classes.get(g.timeClass) ?? []), g]);
  const count = (outcome: HistoryGame["result"]) =>
    history.games.filter((g) => g.result === outcome).length;
  return {
    games: history.games.length,
    win: count("win"),
    draw: count("draw"),
    loss: count("loss"),
    since: history.games.length ? history.games[0]!.end * 1000 : null,
    complete: history.complete,
    fetchedAt: history.fetchedAt,
    byClass: [...classes.entries()]
      .map(([timeClass, list]) => ({
        timeClass,
        games: list.length,
        score: scoreOf(list)!.score,
        current: history.ratings[timeClass]?.current ?? null,
        best: history.ratings[timeClass]?.best ?? null,
      }))
      .sort((a, b) => b.games - a.games),
  };
}

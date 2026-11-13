import {
  CLASSIFICATIONS,
  type Classification,
} from "@/features/classification/classification-rules";
import { PHASES, type Phase } from "@/features/classification/game-review";
import type { Theme } from "@/features/classification/themes";
import type { PlayerGameStats } from "./summary";

export type Outcome = "win" | "loss" | "draw";
export type TimeClass = "bullet" | "blitz" | "rapid" | "classical" | "daily" | "unknown";
export type Side = "w" | "b";

/** One analyzed game, seen from the player whose profile this is. */
export interface ProfileGame {
  id: string;
  /** Milliseconds since the epoch: the game's date, or when it was imported. */
  date: number;
  side: Side;
  /** Null for an unfinished or unknown result. */
  outcome: Outcome | null;
  /** The player's rating in the game's headers (Chess.com, Lichess…). */
  ownRating: number | null;
  timeClass: TimeClass;
  /** Opening family ("Sicilian Defense"), empty when unknown. */
  opening: string;
  stats: PlayerGameStats;
  opponent: PlayerGameStats;
}

export interface Tally {
  games: number;
  win: number;
  loss: number;
  draw: number;
  /** Average precision of the player over these games. */
  precision: number | null;
}

export interface OpeningRow extends Tally {
  name: string;
  /** Average precision during the opening phase only. */
  openingPrecision: number | null;
}

export interface Insight {
  kind: "strong" | "weak";
  /** Selects the sentence; `vars` fill it (see the `coach.insight.*` messages). */
  id: string;
  vars: Record<string, string | number>;
}

export interface Profile {
  games: number;
  /** Games with a finished result. */
  record: Tally;
  byColor: Record<Side, Tally>;
  byTimeClass: (Tally & { timeClass: TimeClass })[];
  precision: {
    overall: number | null;
    byPhase: Record<Phase, number | null>;
    /** Games with a value for the phase, to know how much to trust it. */
    phaseGames: Record<Phase, number>;
    whenWinning: number | null;
    whenLosing: number | null;
  };
  /** Counts of each classification per 100 of the player's moves. */
  per100: Record<Classification, number>;
  themes: { theme: Theme; total: number; perGame: number }[];
  level: {
    /** Median of the estimates of the latest games, null without any. */
    estimate: number | null;
    /** Quartiles of those estimates. */
    low: number | null;
    high: number | null;
    games: number;
    /** Points gained (positive) or lost over the latest 5 games, null under 10 games. */
    trend: number | null;
    provisional: boolean;
  };
  actualRating: { recent: number | null; delta: number | null };
  openings: Record<Side, OpeningRow[]>;
  /** Oldest first, at most the latest 40 games. */
  series: { date: number; precision: number | null; estimate: number | null }[];
  insights: Insight[];
}

// ---------------------------------------------------------------------------------------
// Reading a game's headers

/**
 * Chess.com's time classes from a PGN `TimeControl` ("600", "180+2", "1/86400"): by the
 * estimated duration (base plus 40 moves of increment): under 3 minutes bullet, under 10
 * blitz, under an hour rapid, longer classical; "1/…" is daily (correspondence).
 */
export function timeClassOf(control: string | undefined): TimeClass {
  if (!control || control === "-" || control === "?") return "unknown";
  if (control.includes("/")) return "daily";
  const match = /^(\d+)(?:\+(\d+))?$/.exec(control.trim());
  if (!match) return "unknown";
  const estimated = Number(match[1]) + 40 * Number(match[2] ?? 0);
  if (estimated < 180) return "bullet";
  if (estimated < 600) return "blitz";
  if (estimated < 3600) return "rapid";
  return "classical";
}

/** "Sicilian Defense: Najdorf Variation" → "Sicilian Defense". */
export function openingFamily(name: string): string {
  return name.split(":")[0]!.trim();
}

/** A PGN date ("2024.05.12", parts may be "??") in milliseconds, or `fallback`. */
export function dateOf(header: string | undefined, fallback: number): number {
  const match = /^(\d{4})\.(\d{2}|\?\?)\.(\d{2}|\?\?)$/.exec(header ?? "");
  if (!match) return fallback;
  const month = match[2] === "??" ? 1 : Number(match[2]);
  const day = match[3] === "??" ? 1 : Number(match[3]);
  const time = Date.UTC(Number(match[1]), month - 1, day);
  return Number.isNaN(time) ? fallback : time;
}

export function outcomeOf(result: string, side: Side): Outcome | null {
  if (result === "1/2-1/2") return "draw";
  if (result === "1-0") return side === "w" ? "win" : "loss";
  if (result === "0-1") return side === "b" ? "win" : "loss";
  return null;
}

// ---------------------------------------------------------------------------------------
// Aggregation

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

function mean(values: readonly (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  return real.length ? sum(real) / real.length : null;
}

/** Linear-interpolated quantile of sorted-or-not numbers, `q` in [0, 1]. */
export function quantile(values: readonly number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return sorted[below]! + (sorted[above]! - sorted[below]!) * (position - below);
}

/** Expected score in [0, 1]: a win counts 1, a draw one half. */
export function scoreOf(tally: Pick<Tally, "win" | "draw" | "loss">): number | null {
  const played = tally.win + tally.draw + tally.loss;
  return played ? (tally.win + tally.draw / 2) / played : null;
}

function tally(games: readonly ProfileGame[]): Tally {
  const result: Tally = {
    games: games.length,
    win: 0,
    loss: 0,
    draw: 0,
    precision: mean(games.map((g) => g.stats.precision)),
  };
  for (const g of games) if (g.outcome) result[g.outcome]++;
  return result;
}

const MIN_GAMES = 3;
const LEVEL_WINDOW = 20;

function levelOf(games: readonly ProfileGame[]): Profile["level"] {
  // Newest first.
  const estimates = [...games]
    .sort((a, b) => b.date - a.date)
    .map((g) => g.stats.estimatedRating)
    .filter((v): v is number => v !== null);
  const recent = estimates.slice(0, LEVEL_WINDOW);
  const estimate = quantile(recent, 0.5);
  const trend =
    estimates.length >= 10
      ? Math.round(
          (quantile(estimates.slice(0, 5), 0.5)! - quantile(estimates.slice(5, 10), 0.5)!) / 10,
        ) * 10
      : null;
  return {
    estimate: estimate === null ? null : Math.round(estimate / 10) * 10,
    low: quantile(recent, 0.25) === null ? null : Math.round(quantile(recent, 0.25)! / 10) * 10,
    high: quantile(recent, 0.75) === null ? null : Math.round(quantile(recent, 0.75)! / 10) * 10,
    games: recent.length,
    trend,
    provisional: recent.length < 5,
  };
}

function openingRows(games: readonly ProfileGame[]): OpeningRow[] {
  const groups = new Map<string, ProfileGame[]>();
  for (const g of games) {
    if (!g.opening) continue;
    groups.set(g.opening, [...(groups.get(g.opening) ?? []), g]);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({
      name,
      ...tally(list),
      openingPrecision: mean(list.map((g) => g.stats.phases.opening.precision)),
    }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}

function insightsOf(profile: Omit<Profile, "insights">): Insight[] {
  const out: Insight[] = [];

  // Phases: only the ones with enough games to mean something.
  const phases = PHASES.filter(
    (p) => profile.precision.phaseGames[p] >= MIN_GAMES && profile.precision.byPhase[p] !== null,
  );
  if (phases.length >= 2) {
    const value = (p: Phase) => profile.precision.byPhase[p]!;
    const weakest = phases.reduce((a, b) => (value(b) < value(a) ? b : a));
    const strongest = phases.reduce((a, b) => (value(b) > value(a) ? b : a));
    if (value(strongest) - value(weakest) >= 3) {
      out.push({
        kind: "weak",
        id: "weakPhase",
        vars: { phase: weakest, value: value(weakest).toFixed(1) },
      });
      out.push({
        kind: "strong",
        id: "strongPhase",
        vars: { phase: strongest, value: value(strongest).toFixed(1) },
      });
    }
  }

  const top = profile.themes[0];
  if (top && top.total >= MIN_GAMES && top.perGame >= 0.3) {
    out.push({
      kind: "weak",
      id: "weakTheme",
      vars: { theme: top.theme, rate: top.perGame.toFixed(1) },
    });
  }

  const white = scoreOf(profile.byColor.w);
  const black = scoreOf(profile.byColor.b);
  if (
    white !== null &&
    black !== null &&
    profile.byColor.w.games >= MIN_GAMES &&
    profile.byColor.b.games >= MIN_GAMES &&
    Math.abs(white - black) >= 0.15
  ) {
    const worse: Side = white < black ? "w" : "b";
    out.push({
      kind: "weak",
      id: "weakColor",
      vars: {
        color: worse,
        a: Math.round(Math.min(white, black) * 100),
        b: Math.round(Math.max(white, black) * 100),
      },
    });
  }

  const classes = profile.byTimeClass.filter(
    (c) => c.timeClass !== "unknown" && c.games >= MIN_GAMES && scoreOf(c) !== null,
  );
  if (classes.length >= 2) {
    const best = classes.reduce((a, b) => (scoreOf(b)! > scoreOf(a)! ? b : a));
    const worst = classes.reduce((a, b) => (scoreOf(b)! < scoreOf(a)! ? b : a));
    if (scoreOf(best)! - scoreOf(worst)! >= 0.15) {
      out.push({
        kind: "strong",
        id: "bestTime",
        vars: { tc: best.timeClass, score: Math.round(scoreOf(best)! * 100), games: best.games },
      });
      out.push({
        kind: "weak",
        id: "worstTime",
        vars: { tc: worst.timeClass, score: Math.round(scoreOf(worst)! * 100), games: worst.games },
      });
    }
  }

  const openings = [...profile.openings.w, ...profile.openings.b].filter(
    (o) => o.games >= MIN_GAMES && scoreOf(o) !== null,
  );
  if (openings.length >= 2) {
    const best = openings.reduce((a, b) => (scoreOf(b)! > scoreOf(a)! ? b : a));
    const worst = openings.reduce((a, b) => (scoreOf(b)! < scoreOf(a)! ? b : a));
    if (scoreOf(best)! - scoreOf(worst)! >= 0.15) {
      out.push({
        kind: "strong",
        id: "bestOpening",
        vars: { name: best.name, score: Math.round(scoreOf(best)! * 100), games: best.games },
      });
      out.push({
        kind: "weak",
        id: "worstOpening",
        vars: { name: worst.name, score: Math.round(scoreOf(worst)! * 100), games: worst.games },
      });
    }
  }

  const sharp = profile.per100.brilliant + profile.per100.great;
  if (sharp >= 1.5) out.push({ kind: "strong", id: "sharp", vars: { n: sharp.toFixed(1) } });
  const blunders = profile.per100.blunder + profile.per100.miss;
  if (blunders >= 2.5) out.push({ kind: "weak", id: "blunders", vars: { n: blunders.toFixed(1) } });
  else if (blunders <= 0.8 && profile.games >= MIN_GAMES) {
    out.push({ kind: "strong", id: "solid", vars: { n: blunders.toFixed(1) } });
  }
  return out;
}

/** The profile of a player from their analyzed games. */
export function buildProfile(games: readonly ProfileGame[]): Profile {
  const finished = games.filter((g) => g.outcome !== null);
  const moves = sum(games.map((g) => g.stats.moves));
  const per100 = Object.fromEntries(
    CLASSIFICATIONS.map((c) => [
      c,
      moves ? (sum(games.map((g) => g.stats.counts[c])) / moves) * 100 : 0,
    ]),
  ) as Record<Classification, number>;

  const themeTotals = new Map<Theme, number>();
  for (const g of games) {
    for (const [theme, n] of Object.entries(g.stats.themes) as [Theme, number][]) {
      themeTotals.set(theme, (themeTotals.get(theme) ?? 0) + n);
    }
  }
  const themes = [...themeTotals.entries()]
    .map(([theme, total]) => ({ theme, total, perGame: games.length ? total / games.length : 0 }))
    .sort((a, b) => b.total - a.total);

  const byPhase = Object.fromEntries(
    PHASES.map((p) => [p, mean(games.map((g) => g.stats.phases[p].precision))]),
  ) as Record<Phase, number | null>;
  const phaseGames = Object.fromEntries(
    PHASES.map((p) => [p, games.filter((g) => g.stats.phases[p].precision !== null).length]),
  ) as Record<Phase, number>;

  const timeClasses = [...new Set(games.map((g) => g.timeClass))];
  const chronological = [...games].sort((a, b) => a.date - b.date);
  const latestRatings = [...games]
    .sort((a, b) => b.date - a.date)
    .map((g) => g.ownRating)
    .filter((r): r is number => r !== null)
    .slice(0, 10);
  const level = levelOf(games);
  const recent = latestRatings.length
    ? Math.round(sum(latestRatings) / latestRatings.length)
    : null;

  const partial: Omit<Profile, "insights"> = {
    games: games.length,
    record: tally(finished),
    byColor: {
      w: tally(games.filter((g) => g.side === "w")),
      b: tally(games.filter((g) => g.side === "b")),
    },
    byTimeClass: timeClasses
      .map((timeClass) => ({ timeClass, ...tally(games.filter((g) => g.timeClass === timeClass)) }))
      .sort((a, b) => b.games - a.games),
    precision: {
      overall: mean(games.map((g) => g.stats.precision)),
      byPhase,
      phaseGames,
      whenWinning: mean(games.filter((g) => g.outcome === "win").map((g) => g.stats.precision)),
      whenLosing: mean(games.filter((g) => g.outcome === "loss").map((g) => g.stats.precision)),
    },
    per100,
    themes,
    level,
    actualRating: {
      recent,
      delta: recent !== null && level.estimate !== null ? level.estimate - recent : null,
    },
    openings: {
      w: openingRows(games.filter((g) => g.side === "w")),
      b: openingRows(games.filter((g) => g.side === "b")),
    },
    series: chronological.slice(-40).map((g) => ({
      date: g.date,
      precision: g.stats.precision,
      estimate: g.stats.estimatedRating,
    })),
  };
  return { ...partial, insights: insightsOf(partial) };
}

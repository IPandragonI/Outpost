import type { ProfileGame } from "./profile";

/**
 * The player's style, read from how their analyzed games were played. Each style is a score
 * from 0 to 100 built from a few measures compared with what is typical (the constants below
 * are rough norms of club games, not fitted values): the reading says which tendencies stand
 * out, not that a player "is" one thing.
 */

export type StyleId = "tactical" | "positional" | "chaotic" | "endgame" | "theory";
export type PlayStyle = StyleId | "balanced";

export interface Trait {
  /** Selects the sentence (see the `coach.trait.*` messages). */
  id: string;
  tone: "good" | "bad" | "neutral";
  vars: Record<string, string | number>;
}

export interface StyleMetrics {
  capturesPer100: number;
  checksPer100: number;
  /** Moves per game of the player. */
  avgMoves: number;
  turningPoints: number;
  bookMoves: number;
  endgameShare: number;
  /** Brilliant and great moves, per 100 moves. */
  sharpPer100: number;
  /** Blunders and missed chances per 100 moves played in open positions. */
  blundersPer100: number;
  queenEarlyShare: number;
  earlyCastleShare: number;
  noCastleShare: number;
}

export interface StyleProfile {
  games: number;
  primary: PlayStyle;
  secondary: StyleId | null;
  /** 0–100 for each style. */
  scores: Record<StyleId, number>;
  metrics: StyleMetrics;
  traits: Trait[];
}

const MIN_GAMES = 3;
const z = (value: number, mean: number, sd: number) => (value - mean) / sd;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const per100 = (n: number, total: number) => (total ? (n / total) * 100 : 0);

function metricsOf(games: readonly ProfileGame[]): StyleMetrics {
  const stats = games.map((g) => g.stats);
  const moves = sum(stats.map((s) => s.style.moves));
  const alive = sum(stats.map((s) => s.alive.moves));
  const share = (test: (g: ProfileGame) => boolean) =>
    games.filter(test).length / Math.max(1, games.length);
  return {
    capturesPer100: per100(sum(stats.map((s) => s.style.captures)), moves),
    checksPer100: per100(sum(stats.map((s) => s.style.checks)), moves),
    avgMoves: moves / Math.max(1, games.length),
    turningPoints: sum(stats.map((s) => s.turningPoints)) / Math.max(1, games.length),
    bookMoves: sum(stats.map((s) => s.style.bookMoves)) / Math.max(1, games.length),
    endgameShare: share((g) => g.stats.style.endgame),
    sharpPer100: per100(
      sum(stats.map((s) => s.counts.brilliant + s.counts.great)),
      sum(stats.map((s) => s.moves)),
    ),
    blundersPer100: per100(sum(stats.map((s) => s.alive.blunders)), alive),
    queenEarlyShare: share((g) => g.stats.style.queenEarly),
    earlyCastleShare: share(
      (g) => g.stats.style.castleMove !== null && g.stats.style.castleMove <= 10,
    ),
    noCastleShare: share((g) => g.stats.style.castleMove === null),
  };
}

function mean(values: readonly (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  return real.length ? sum(real) / real.length : null;
}

function traitsOf(games: readonly ProfileGame[], m: StyleMetrics): Trait[] {
  const traits: Trait[] = [];

  // Does the player fade, or finish strong?
  const opening = mean(games.map((g) => g.stats.phases.opening.precision));
  const endgame = mean(games.map((g) => g.stats.phases.endgame.precision));
  const endgameGames = games.filter((g) => g.stats.phases.endgame.precision !== null).length;
  if (opening !== null && endgame !== null && endgameGames >= MIN_GAMES) {
    if (opening - endgame >= 12) {
      traits.push({ id: "fades", tone: "bad", vars: { gap: Math.round(opening - endgame) } });
    } else if (endgame - opening >= 5) {
      traits.push({
        id: "finishesStrong",
        tone: "good",
        vars: { gap: Math.round(endgame - opening) },
      });
    }
  }

  // Time pressure, when the games carry clocks.
  const pressure = games.flatMap((g) => (g.stats.timePressure ? [g.stats.timePressure] : []));
  const measured = sum(pressure.map((p) => p.measured));
  if (measured >= 40) {
    const low = sum(pressure.map((p) => p.low));
    const lowShare = low / measured;
    const lowRate = low ? sum(pressure.map((p) => p.lowErrors)) / low : 0;
    const normal = measured - low;
    const normalRate = normal ? sum(pressure.map((p) => p.normalErrors)) / normal : 0;
    if (lowShare >= 0.2) {
      traits.push({ id: "timeScramble", tone: "bad", vars: { share: Math.round(lowShare * 100) } });
    }
    if (low >= 15 && normalRate > 0) {
      const ratio = lowRate / normalRate;
      if (ratio >= 1.6) {
        traits.push({ id: "pressureErrors", tone: "bad", vars: { ratio: ratio.toFixed(1) } });
      } else if (ratio <= 1.2) {
        traits.push({ id: "calmUnderPressure", tone: "good", vars: {} });
      }
    }
  }

  if (m.earlyCastleShare >= 0.8) {
    traits.push({
      id: "castlesEarly",
      tone: "good",
      vars: { share: Math.round(m.earlyCastleShare * 100) },
    });
  }
  if (m.noCastleShare >= 0.3) {
    traits.push({
      id: "kingInCentre",
      tone: "bad",
      vars: { share: Math.round(m.noCastleShare * 100) },
    });
  }
  if (m.queenEarlyShare >= 0.4) {
    traits.push({
      id: "earlyQueen",
      tone: "neutral",
      vars: { share: Math.round(m.queenEarlyShare * 100) },
    });
  }
  return traits;
}

/** The player's style, or null without enough analyzed games to say anything. */
export function styleOf(games: readonly ProfileGame[]): StyleProfile | null {
  if (games.length < MIN_GAMES) return null;
  const m = metricsOf(games);
  const endgameEdge =
    (mean(games.map((g) => g.stats.phases.endgame.precision)) ?? 0) -
    (mean(games.map((g) => g.stats.precision)) ?? 0);

  const raw: Record<StyleId, number> = {
    tactical:
      z(m.capturesPer100, 22, 6) +
      z(m.checksPer100, 6, 3) +
      0.7 * z(m.sharpPer100, 1, 1.2) -
      0.4 * z(m.avgMoves, 38, 10),
    positional:
      -z(m.capturesPer100, 22, 6) -
      0.6 * z(m.checksPer100, 6, 3) +
      0.6 * z(m.avgMoves, 38, 10) -
      0.7 * z(m.turningPoints, 1.5, 1.2),
    chaotic:
      z(m.turningPoints, 1.5, 1.2) +
      0.8 * z(m.blundersPer100, 4, 3) +
      0.3 * z(m.capturesPer100, 22, 6),
    endgame: z(m.endgameShare, 0.55, 0.25) + endgameEdge / 12 + 0.3 * z(m.avgMoves, 38, 10),
    theory: z(m.bookMoves, 5.5, 2.5),
  };
  const scores = Object.fromEntries(
    (Object.keys(raw) as StyleId[]).map((id) => [id, Math.round(clamp(50 + 18 * raw[id], 0, 100))]),
  ) as Record<StyleId, number>;
  const ranked = (Object.keys(scores) as StyleId[]).sort((a, b) => scores[b] - scores[a]);
  const top = ranked[0]!;
  const primary: PlayStyle = scores[top] >= 58 ? top : "balanced";
  const second = ranked[1]!;
  return {
    games: games.length,
    primary,
    secondary: primary !== "balanced" && scores[second] >= 56 ? second : null,
    scores,
    metrics: m,
    traits: traitsOf(games, m),
  };
}

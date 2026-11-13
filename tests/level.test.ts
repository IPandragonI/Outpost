import { describe, expect, it } from "vitest";
import type { ChessComHistory, HistoryGame } from "@/features/chesscom/history";
import { CLASSIFICATIONS } from "@/features/classification/classification-rules";
import {
  estimateLevel,
  gameRating,
  overallRecord,
  pooledRating,
  performanceRating,
  selectionWeights,
  weightedQuantile,
} from "@/features/stats/level";
import type { Outcome, ProfileGame } from "@/features/stats/profile";
import type { PlayerGameStats } from "@/features/stats/summary";

const NOW = 1_700_000_000_000;

function stats(over: Partial<PlayerGameStats> = {}): PlayerGameStats {
  return {
    precision: 75,
    averageCpLoss: 62,
    estimatedRating: 1500,
    moves: 60,
    alive: { moves: 60, acpl: 62, precision: 75, mistakes: 2, blunders: 2 },
    counts: Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as PlayerGameStats["counts"],
    phases: {
      opening: { precision: 78, moves: 10 },
      middlegame: { precision: 75, moves: 30 },
      endgame: { precision: 72, moves: 12 },
    },
    themes: {},
    style: {
      moves: 40,
      captures: 9,
      checks: 2,
      pawnMoves: 14,
      queenEarly: false,
      castleMove: 8,
      bookMoves: 5,
      endgame: true,
    },
    timePressure: null,
    turningPoints: 1,
    ...over,
  };
}

let counter = 0;
function game(outcome: Outcome | null, over: Partial<ProfileGame> = {}): ProfileGame {
  counter++;
  return {
    id: `g${counter}`,
    date: NOW - counter * 86_400_000,
    side: "w",
    outcome,
    ownRating: null,
    timeClass: "blitz",
    opening: "",
    stats: stats(),
    opponent: stats(),
    ...over,
  };
}

function history(
  results: Outcome[],
  {
    own = 600,
    opp = 600,
    current = own,
  }: { own?: number; opp?: number; current?: number | null } = {},
): ChessComHistory {
  const games: HistoryGame[] = results.map((result, i) => ({
    end: NOW / 1000 - (results.length - i) * 3600,
    timeClass: "blitz",
    rated: true,
    color: "w",
    result,
    own,
    opp,
  }));
  return {
    version: 1,
    username: "player",
    fetchedAt: NOW,
    games,
    ratings: current === null ? {} : { blitz: { current, best: current + 50 } },
    complete: true,
  };
}

const mixed = (n: number): Outcome[] =>
  Array.from({ length: n }, (_, i) => (i % 3 === 0 ? "win" : i % 3 === 1 ? "loss" : "draw"));

describe("gameRating", () => {
  it("lowers the level of a game with very uneven phases", () => {
    const even = gameRating(stats())!;
    const uneven = gameRating(
      stats({
        phases: {
          opening: { precision: 90, moves: 10 },
          middlegame: { precision: 75, moves: 30 },
          endgame: { precision: 50, moves: 12 },
        },
      }),
    )!;
    expect(uneven).toBeLessThan(even);
    expect(even - uneven).toBeLessThanOrEqual(40);
  });

  it("lowers the level of a game played largely in time trouble", () => {
    const calm = gameRating(stats())!;
    const hurried = gameRating(
      stats({ timePressure: { measured: 40, low: 16, lowErrors: 8, normalErrors: 4 } }),
    )!;
    expect(calm - hurried).toBe(30);
  });

  it("is null without enough moves in open positions", () => {
    const few = { moves: 3, acpl: 10, precision: 90, mistakes: 0, blunders: 0 };
    expect(gameRating(stats({ alive: few }))).toBeNull();
  });
});

describe("pooledRating", () => {
  const short = { moves: 4, acpl: 62, precision: 75, mistakes: 0, blunders: 0 };

  it("reads a level from short games that say nothing alone", () => {
    const shortGames = Array.from({ length: 4 }, () =>
      game("win", { stats: stats({ alive: short }) }),
    );
    expect(gameRating(shortGames[0]!.stats)).toBeNull();
    const pooled = pooledRating(shortGames, [1, 1, 1, 1]);
    expect(pooled.games).toBe(4);
    expect(pooled.rating).not.toBeNull();
  });

  it("gives nothing when all the games together are still too short", () => {
    const one = [game("win", { stats: stats({ alive: short }) })];
    expect(pooledRating(one, [1]).rating).toBeNull();
  });

  it("weights games: a heavily weighted blunder-ridden game pulls the level down", () => {
    const sound = game("win", { stats: stats() });
    const weak = game("loss", {
      stats: stats({ alive: { moves: 60, acpl: 160, precision: 53, mistakes: 8, blunders: 6 } }),
    });
    const even = pooledRating([sound, weak], [1, 1]).rating!;
    const lossHeavy = pooledRating([sound, weak], [0.2, 1.8]).rating!;
    expect(lossHeavy).toBeLessThan(even);
  });
});

describe("helpers", () => {
  it("takes a weighted quantile", () => {
    expect(weightedQuantile([10, 20, 30], [1, 1, 1], 0.5)).toBe(20);
    expect(weightedQuantile([10, 20, 30], [1, 1, 10], 0.5)).toBe(30);
    expect(weightedQuantile([], [], 0.5)).toBeNull();
  });

  it("computes a performance rating from opponents and score", () => {
    const even = history(
      Array.from({ length: 30 }, (_, i) => (i % 2 ? "win" : "loss")),
      { opp: 900 },
    );
    expect(performanceRating(even.games)).toBe(900);
    expect(performanceRating(even.games.slice(0, 5))).toBeNull();
    const winning = history(
      Array.from({ length: 20 }, () => "win" as Outcome),
      { opp: 900 },
    );
    expect(performanceRating(winning.games)!).toBeGreaterThan(1200);
  });

  it("needs enough rated games for an overall record", () => {
    expect(overallRecord(history(mixed(10)), NOW)).toBeNull();
    expect(overallRecord(history(mixed(30)), NOW)).toMatchObject({ games: 30, win: 10, loss: 10 });
    expect(overallRecord(null, NOW)).toBeNull();
  });
});

describe("selection bias", () => {
  it("weights a sample made of wins back to the real record", () => {
    const wins = Array.from({ length: 6 }, () => game("win"));
    const losses = [game("loss"), game("loss")];
    const overall = overallRecord(history(mixed(30)), NOW);
    const { weights, report } = selectionWeights([...wins, ...losses], overall);
    // Wins are over-represented in the sample (75 % against a third): they weigh less.
    expect(weights[0]!).toBeLessThan(weights[6]!);
    expect(weights.reduce((a, b) => a + b, 0) / weights.length).toBeCloseTo(1, 5);
    expect(report?.biased).toBe(true);
    expect(report?.missing).toContain("draw");
  });

  it("reports outcomes that cannot be corrected because none was analyzed", () => {
    const { report } = selectionWeights(
      Array.from({ length: 6 }, () => game("win")),
      overallRecord(history(mixed(30)), NOW),
    );
    expect([...(report?.missing ?? [])].sort()).toEqual(["draw", "loss"]);
    expect(report?.analyzed.score).toBe(1);
  });

  it("does nothing without a full history", () => {
    const { weights, report } = selectionWeights([game("win"), game("loss")], null);
    expect(weights).toEqual([1, 1]);
    expect(report).toBeNull();
  });

  it("is not biased when the analyzed games look like the whole record", () => {
    const sample = mixed(9).map((o) => game(o));
    const { report } = selectionWeights(sample, overallRecord(history(mixed(30)), NOW));
    expect(report?.biased).toBe(false);
  });
});

describe("estimateLevel", () => {
  it("anchors a 600-rated player whose moves read as ~1500 near their real level", () => {
    // The moves look like a club player's (the old estimate's failure), but the Chess.com
    // rating is 600 over many games: the estimate must not follow the moves up to 1500.
    const analyzed = Array.from({ length: 6 }, () => game("win"));
    const level = estimateLevel(analyzed, history(mixed(60)), NOW);
    expect(level.moves).toBeGreaterThan(1300);
    expect(level.method).toBe("anchored");
    expect(level.anchor).toMatchObject({ source: "profile", rating: 600, timeClass: "blitz" });
    expect(level.estimate!).toBeLessThan(800);
    expect(level.estimate!).toBeGreaterThanOrEqual(600);
    expect(level.reliability).toBe("high");
    expect(level.selection?.biased).toBe(true);
    expect(level.low!).toBeLessThan(level.estimate!);
    expect(level.high!).toBeGreaterThan(level.estimate!);
  });

  it("lets the moves speak alone, unanchored, without Chess.com data", () => {
    const level = estimateLevel(
      Array.from({ length: 6 }, () => game("win")),
      null,
      NOW,
    );
    expect(level.method).toBe("moves");
    expect(level.anchor).toBeNull();
    expect(level.estimate).toBe(level.moves);
    expect(level.reliability).not.toBe("high");
  });

  it("moves the estimate a little when the moves differ from the rating", () => {
    const better = { moves: 80, acpl: 40, precision: 82, mistakes: 1, blunders: 0 };
    const analyzed = Array.from({ length: 10 }, () =>
      game("win", { stats: stats({ alive: better }) }),
    );
    const level = estimateLevel(analyzed, history(mixed(60), { own: 1000 }), NOW);
    expect(level.estimate!).toBeGreaterThan(1000);
    expect(level.estimate!).toBeLessThan(1500);
  });

  it("falls back on the anchor alone when no move can be read", () => {
    const empty = { moves: 0, acpl: null, precision: null, mistakes: 0, blunders: 0 };
    const level = estimateLevel(
      [game("win", { stats: stats({ alive: empty }) })],
      history(mixed(60)),
      NOW,
    );
    expect(level.moves).toBeNull();
    expect(level.estimate).toBe(600);
    expect(level.method).toBe("anchored");
  });

  it("uses the rating of the latest games when the stats are missing", () => {
    const level = estimateLevel([], history(mixed(60), { own: 750, current: null }), NOW);
    expect(level.anchor).toMatchObject({ source: "games", rating: 750 });
    expect(level.estimate).toBe(750);
  });

  it("has nothing to say without games or history", () => {
    const level = estimateLevel([], null, NOW);
    expect(level).toMatchObject({ estimate: null, method: "none", anchor: null });
  });
});

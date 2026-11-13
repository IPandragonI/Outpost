import { describe, expect, it } from "vitest";
import { CLASSIFICATIONS } from "@/features/classification/classification-rules";
import {
  buildProfile,
  dateOf,
  openingFamily,
  outcomeOf,
  quantile,
  scoreOf,
  timeClassOf,
  type Outcome,
  type ProfileGame,
  type Side,
  type TimeClass,
} from "@/features/stats/profile";
import type { PlayerGameStats } from "@/features/stats/summary";

function stats(over: Partial<PlayerGameStats> = {}): PlayerGameStats {
  return {
    precision: 80,
    averageCpLoss: 30,
    estimatedRating: 1500,
    moves: 40,
    counts: Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as PlayerGameStats["counts"],
    phases: {
      opening: { precision: 90, moves: 10 },
      middlegame: { precision: 80, moves: 20 },
      endgame: { precision: 70, moves: 10 },
    },
    themes: {},
    ...over,
  };
}

let counter = 0;
function game(over: Partial<ProfileGame> & { outcome?: Outcome | null } = {}): ProfileGame {
  counter++;
  return {
    id: `g${counter}`,
    date: 1_700_000_000_000 + counter * 86_400_000,
    side: "w" as Side,
    outcome: "win",
    ownRating: null,
    timeClass: "blitz" as TimeClass,
    opening: "",
    stats: stats(),
    opponent: stats(),
    ...over,
  };
}

describe("reading headers", () => {
  it("classifies time controls like Chess.com", () => {
    expect(timeClassOf("60")).toBe("bullet");
    expect(timeClassOf("180")).toBe("blitz");
    expect(timeClassOf("180+2")).toBe("blitz"); // 180 + 80
    expect(timeClassOf("600")).toBe("rapid");
    expect(timeClassOf("900+10")).toBe("rapid");
    expect(timeClassOf("7200")).toBe("classical");
    expect(timeClassOf("1/86400")).toBe("daily");
    expect(timeClassOf("-")).toBe("unknown");
    expect(timeClassOf(undefined)).toBe("unknown");
  });

  it("names an opening by its family", () => {
    expect(openingFamily("Sicilian Defense: Najdorf Variation")).toBe("Sicilian Defense");
    expect(openingFamily("Italian Game")).toBe("Italian Game");
  });

  it("reads PGN dates, partial ones included", () => {
    expect(dateOf("2024.05.12", 0)).toBe(Date.UTC(2024, 4, 12));
    expect(dateOf("2024.??.??", 0)).toBe(Date.UTC(2024, 0, 1));
    expect(dateOf("????.??.??", 7)).toBe(7);
    expect(dateOf(undefined, 9)).toBe(9);
  });

  it("gives the result from a side's point of view", () => {
    expect(outcomeOf("1-0", "w")).toBe("win");
    expect(outcomeOf("1-0", "b")).toBe("loss");
    expect(outcomeOf("0-1", "b")).toBe("win");
    expect(outcomeOf("1/2-1/2", "b")).toBe("draw");
    expect(outcomeOf("*", "w")).toBeNull();
  });
});

describe("quantile and score", () => {
  it("interpolates quantiles", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([10, 20, 30], 0.5)).toBe(20);
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([10, 20, 30, 40], 0.25)).toBe(17.5);
  });

  it("counts a draw as half a point", () => {
    expect(scoreOf({ win: 2, draw: 2, loss: 0 })).toBe(0.75);
    expect(scoreOf({ win: 0, draw: 0, loss: 0 })).toBeNull();
  });
});

describe("buildProfile", () => {
  it("counts results overall and by colour, ignoring unfinished games in the record", () => {
    const profile = buildProfile([
      game({ outcome: "win", side: "w" }),
      game({ outcome: "loss", side: "b" }),
      game({ outcome: "draw", side: "w" }),
      game({ outcome: null, side: "b" }),
    ]);
    expect(profile.games).toBe(4);
    expect(profile.record).toMatchObject({ games: 3, win: 1, loss: 1, draw: 1 });
    expect(profile.byColor.w).toMatchObject({ games: 2, win: 1, draw: 1 });
    expect(profile.byColor.b).toMatchObject({ games: 2, loss: 1 });
  });

  it("averages precision overall, by phase and by outcome", () => {
    const profile = buildProfile([
      game({ outcome: "win", stats: stats({ precision: 90 }) }),
      game({ outcome: "loss", stats: stats({ precision: 70 }) }),
    ]);
    expect(profile.precision.overall).toBe(80);
    expect(profile.precision.whenWinning).toBe(90);
    expect(profile.precision.whenLosing).toBe(70);
    expect(profile.precision.byPhase).toEqual({ opening: 90, middlegame: 80, endgame: 70 });
  });

  it("gives counts per 100 moves", () => {
    const counts = { ...stats().counts, blunder: 2, brilliant: 1 };
    const profile = buildProfile([game({ stats: stats({ counts, moves: 50 }) })]);
    expect(profile.per100.blunder).toBe(4);
    expect(profile.per100.brilliant).toBe(2);
  });

  it("estimates the level from the median of the latest games, with a trend", () => {
    const rated = (rating: number | null) =>
      game({ stats: stats({ estimatedRating: rating }), ownRating: 1400 });
    // Ten older games at 1400, then five recent ones at 1600: the trend is the difference.
    const games = [
      ...Array.from({ length: 10 }, () => rated(1400)),
      ...Array.from({ length: 5 }, () => rated(1600)),
    ];
    const profile = buildProfile(games);
    expect(profile.level.games).toBe(15);
    expect(profile.level.estimate).toBe(1400);
    expect(profile.level.trend).toBe(200);
    expect(profile.level.provisional).toBe(false);
    expect(profile.actualRating.recent).toBe(1400);
    expect(profile.actualRating.delta).toBe(0);
  });

  it("is provisional with few games and has no trend", () => {
    const profile = buildProfile([game(), game()]);
    expect(profile.level.provisional).toBe(true);
    expect(profile.level.trend).toBeNull();
  });

  it("has no level without estimates", () => {
    const profile = buildProfile([game({ stats: stats({ estimatedRating: null }) })]);
    expect(profile.level.estimate).toBeNull();
    expect(profile.actualRating.delta).toBeNull();
  });

  it("groups openings by colour and sorts them by games", () => {
    const profile = buildProfile([
      game({ side: "w", opening: "Italian Game" }),
      game({ side: "w", opening: "Italian Game", outcome: "loss" }),
      game({ side: "w", opening: "Ruy Lopez" }),
      game({ side: "b", opening: "Sicilian Defense" }),
      game({ side: "b", opening: "" }),
    ]);
    expect(profile.openings.w.map((o) => [o.name, o.games])).toEqual([
      ["Italian Game", 2],
      ["Ruy Lopez", 1],
    ]);
    expect(profile.openings.w[0]).toMatchObject({ win: 1, loss: 1, openingPrecision: 90 });
    expect(profile.openings.b.map((o) => o.name)).toEqual(["Sicilian Defense"]);
  });

  it("keeps the latest 40 games, oldest first, in the series", () => {
    const profile = buildProfile(Array.from({ length: 50 }, () => game()));
    expect(profile.series).toHaveLength(40);
    expect(profile.series[0]!.date).toBeLessThan(profile.series[39]!.date);
  });

  it("totals recurring mistakes, most frequent first", () => {
    const profile = buildProfile([
      game({ stats: stats({ themes: { hanging: 2, "missed-fork": 1 } }) }),
      game({ stats: stats({ themes: { hanging: 1 } }) }),
    ]);
    expect(profile.themes.map((t) => [t.theme, t.total])).toEqual([
      ["hanging", 3],
      ["missed-fork", 1],
    ]);
    expect(profile.themes[0]!.perGame).toBe(1.5);
  });
});

describe("insights", () => {
  it("names the weakest and strongest phase and the top mistake", () => {
    const weakEndgame = stats({
      themes: { hanging: 1 },
      phases: {
        opening: { precision: 92, moves: 10 },
        middlegame: { precision: 80, moves: 20 },
        endgame: { precision: 60, moves: 10 },
      },
    });
    const profile = buildProfile([
      game({ stats: weakEndgame }),
      game({ stats: weakEndgame }),
      game({ stats: weakEndgame }),
    ]);
    const ids = profile.insights.map((i) => i.id);
    expect(ids).toContain("weakPhase");
    expect(ids).toContain("strongPhase");
    expect(profile.insights.find((i) => i.id === "weakPhase")!.vars.phase).toBe("endgame");
    expect(profile.insights.find((i) => i.id === "strongPhase")!.vars.phase).toBe("opening");
    expect(ids).toContain("weakTheme");
  });

  it("flags a colour that scores much worse, once there are enough games", () => {
    const white = Array.from({ length: 4 }, () => game({ side: "w", outcome: "win" }));
    const black = Array.from({ length: 4 }, () => game({ side: "b", outcome: "loss" }));
    const insight = buildProfile([...white, ...black]).insights.find((i) => i.id === "weakColor");
    expect(insight?.vars.color).toBe("b");
    const few = buildProfile([game({ side: "w" }), game({ side: "b", outcome: "loss" })]);
    expect(few.insights.map((i) => i.id)).not.toContain("weakColor");
  });

  it("compares time controls and openings with enough games", () => {
    const wins = Array.from({ length: 3 }, () =>
      game({ timeClass: "rapid", outcome: "win", opening: "Italian Game" }),
    );
    const losses = Array.from({ length: 3 }, () =>
      game({ timeClass: "bullet", outcome: "loss", opening: "Scandinavian Defense" }),
    );
    const ids = buildProfile([...wins, ...losses]).insights.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining(["bestTime", "worstTime", "bestOpening", "worstOpening"]),
    );
  });

  it("reads brilliant moves and blunders as strengths and weaknesses", () => {
    const counts = { ...stats().counts, brilliant: 1, great: 1 };
    const sharp = buildProfile([game({ stats: stats({ counts, moves: 100 }) })]);
    expect(sharp.insights.map((i) => i.id)).toContain("sharp");
    const bad = { ...stats().counts, blunder: 3 };
    const blunders = buildProfile([game({ stats: stats({ counts: bad, moves: 100 }) })]);
    expect(blunders.insights.map((i) => i.id)).toContain("blunders");
  });
});

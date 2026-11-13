import { describe, expect, it } from "vitest";
import { CLASSIFICATIONS } from "@/features/classification/classification-rules";
import type { ProfileGame } from "@/features/stats/profile";
import { styleOf } from "@/features/stats/style";
import type { PlayerGameStats } from "@/features/stats/summary";

function stats(over: Partial<PlayerGameStats> = {}): PlayerGameStats {
  return {
    precision: 75,
    averageCpLoss: 60,
    estimatedRating: 1500,
    moves: 40,
    alive: { moves: 30, acpl: 60, precision: 75, mistakes: 1, blunders: 1 },
    counts: Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as PlayerGameStats["counts"],
    phases: {
      opening: { precision: 78, moves: 10 },
      middlegame: { precision: 75, moves: 20 },
      endgame: { precision: 74, moves: 10 },
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
    turningPoints: 1.5,
    ...over,
  };
}

function games(n: number, over: Partial<PlayerGameStats> = {}): ProfileGame[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `g${i}`,
    date: i,
    side: "w" as const,
    outcome: "win" as const,
    ownRating: null,
    timeClass: "blitz" as const,
    opening: "",
    stats: stats(over),
    opponent: stats(),
  }));
}

const features = (over: Partial<PlayerGameStats["style"]>) => ({ ...stats().style, ...over });

describe("styleOf", () => {
  it("needs a few games", () => {
    expect(styleOf(games(2))).toBeNull();
    expect(styleOf(games(3))).not.toBeNull();
  });

  it("reads many captures, checks and brilliant moves in short games as tactical", () => {
    const counts = { ...stats().counts, brilliant: 1, great: 1 };
    const style = styleOf(
      games(5, {
        style: features({ moves: 25, captures: 10, checks: 5 }),
        moves: 25,
        counts,
        turningPoints: 1,
      }),
    )!;
    expect(style.primary).toBe("tactical");
    expect(style.scores.tactical).toBeGreaterThan(style.scores.positional);
  });

  it("reads long, quiet games with few captures and checks as positional", () => {
    const style = styleOf(
      games(5, {
        style: features({ moves: 55, captures: 5, checks: 0 }),
        moves: 55,
        turningPoints: 0,
      }),
    )!;
    expect(style.primary).toBe("positional");
  });

  it("reads wild swings and many blunders as chaotic", () => {
    const style = styleOf(
      games(5, {
        turningPoints: 4,
        alive: { moves: 30, acpl: 140, precision: 55, mistakes: 4, blunders: 6 },
        style: features({ captures: 11, checks: 4 }),
      }),
    )!;
    expect(style.primary).toBe("chaotic");
  });

  it("reads games that reach the endgame with a strong endgame as endgame-minded", () => {
    const style = styleOf(
      games(5, {
        precision: 70,
        phases: {
          opening: { precision: 68, moves: 10 },
          middlegame: { precision: 68, moves: 20 },
          endgame: { precision: 90, moves: 15 },
        },
        style: features({ moves: 55, endgame: true, captures: 9, checks: 2 }),
      }),
    )!;
    expect(style.scores.endgame).toBeGreaterThanOrEqual(58);
  });

  it("says balanced when nothing stands out", () => {
    // Typical games: only about half of them reach the endgame.
    const typical = games(6).map((g, i) => ({
      ...g,
      stats: { ...g.stats, style: { ...g.stats.style, endgame: i % 2 === 0 } },
    }));
    const style = styleOf(typical)!;
    expect(style.primary).toBe("balanced");
    expect(style.secondary).toBeNull();
  });

  it("finds traits: fading, early castling, a king left in the centre, time trouble", () => {
    const fading = styleOf(
      games(4, {
        phases: {
          opening: { precision: 92, moves: 10 },
          middlegame: { precision: 78, moves: 20 },
          endgame: { precision: 60, moves: 10 },
        },
      }),
    )!;
    expect(fading.traits.map((t) => t.id)).toContain("fades");
    expect(fading.traits.map((t) => t.id)).toContain("castlesEarly");

    const centre = styleOf(games(4, { style: features({ castleMove: null }) }))!;
    expect(centre.traits.map((t) => t.id)).toContain("kingInCentre");

    const hurried = styleOf(
      games(4, { timePressure: { measured: 40, low: 16, lowErrors: 12, normalErrors: 4 } }),
    )!;
    const ids = hurried.traits.map((t) => t.id);
    expect(ids).toContain("timeScramble");
    expect(ids).toContain("pressureErrors");

    const calm = styleOf(
      games(4, { timePressure: { measured: 40, low: 8, lowErrors: 1, normalErrors: 8 } }),
    )!;
    expect(calm.traits.map((t) => t.id)).toContain("calmUnderPressure");
  });
});

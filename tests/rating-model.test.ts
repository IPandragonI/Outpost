import { describe, expect, it } from "vitest";
import {
  MIN_ALIVE_MOVES,
  rawRating,
  ratingFromMetric,
  type AliveStats,
} from "@/features/classification/rating-model";

const alive = (over: Partial<AliveStats> = {}): AliveStats => ({
  moves: 30,
  acpl: 62,
  precision: 75,
  mistakes: 1,
  blunders: 1,
  ...over,
});

describe("ratingFromMetric", () => {
  const falling = [
    [600, 170],
    [1000, 105],
    [1500, 62],
  ] as const;
  const rising = [
    [600, 52],
    [1000, 64],
    [1500, 75],
  ] as const;

  it("interpolates between anchors, whichever way the metric goes", () => {
    expect(ratingFromMetric(falling, 105)).toBe(1000);
    expect(ratingFromMetric(falling, 137.5)).toBeCloseTo(800, 5);
    expect(ratingFromMetric(rising, 58)).toBeCloseTo(800, 5);
  });

  it("clamps outside the anchors", () => {
    expect(ratingFromMetric(falling, 300)).toBe(600);
    expect(ratingFromMetric(falling, 10)).toBe(1500);
    expect(ratingFromMetric(rising, 30)).toBe(600);
    expect(ratingFromMetric(rising, 99)).toBe(1500);
  });
});

describe("rawRating", () => {
  it("needs enough moves played in open positions", () => {
    expect(rawRating(alive({ moves: MIN_ALIVE_MOVES - 1 }))).toBeNull();
    expect(rawRating(alive({ acpl: null }))).toBeNull();
    expect(rawRating(alive({ moves: MIN_ALIVE_MOVES }))).not.toBeNull();
  });

  it("reads a clean game as a strong player and a blunder-ridden one as a weak player", () => {
    const strong = rawRating(alive({ acpl: 25, precision: 87, mistakes: 0, blunders: 0 }))!;
    const weak = rawRating(alive({ acpl: 170, precision: 52, mistakes: 6, blunders: 3 }))!;
    expect(strong).toBeGreaterThan(2000);
    expect(weak).toBeLessThan(750);
  });

  it("puts the profile of a 600 player near 600, not near 1500", () => {
    // Open-position moves of a beginner: a serious error every fourth move, a blunder every
    // ninth, an average loss of 160 cp. The old estimate read the same game as ~1500 because
    // the decided positions after the blunders diluted the average.
    const beginner = rawRating(alive({ acpl: 160, precision: 53, mistakes: 4, blunders: 3 }))!;
    expect(beginner).toBeGreaterThan(450);
    expect(beginner).toBeLessThan(750);
  });

  it("puts a typical 1500 profile near 1500", () => {
    const club = rawRating(
      alive({ moves: 100, acpl: 62, precision: 75, mistakes: 3, blunders: 3 }),
    )!;
    expect(club).toBeGreaterThan(1350);
    expect(club).toBeLessThan(1650);
  });

  it("falls as errors pile up, everything else equal", () => {
    const rate = (blunders: number) => rawRating(alive({ blunders }))!;
    expect(rate(0)).toBeGreaterThan(rate(2));
    expect(rate(2)).toBeGreaterThan(rate(6));
  });

  it("rounds to 10", () => {
    expect(rawRating(alive())! % 10).toBe(0);
  });
});

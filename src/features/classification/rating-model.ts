/**
 * A rough playing level from how a game was played. It is a rule of thumb, not a rating:
 * it only says which level of player usually makes errors at this rate.
 *
 * Why "alive" moves only. Both the centipawn loss and the precision are measured on a scale
 * that saturates: once a position is clearly won or lost, a further blunder costs next to
 * nothing. Games between weaker players are often decided early and then played on for
 * thirty moves in a decided position, which made the old estimate (an exponential of the
 * average centipawn loss over every move) read far too high: a 600-rated player came out
 * around 1500. Here only the moves played in positions that were still open (the mover's
 * winning chances between 10 % and 90 % with the best move) count, which are the moves that
 * tell players apart, and the rate of serious errors weighs more than the average loss.
 *
 * The anchors below are indicative steps of how often players of each level lose material
 * or the game: they are not fitted on a licensed dataset. That is why the profile anchors
 * the result to the player's actual rating whenever it is known (see features/stats/level).
 */

export interface AliveStats {
  /** Judged moves played in positions that were still undecided. */
  moves: number;
  /** Average centipawn loss over those moves. */
  acpl: number | null;
  /** Precision over those moves, 0–100. */
  precision: number | null;
  /** Moves classified as mistakes. */
  mistakes: number;
  /** Blunders and missed chances. */
  blunders: number;
}

/** A position is open while the mover's winning chances (with the best move) are inside. */
export const ALIVE_MIN_CHANCE = 0.1;
export const ALIVE_MAX_CHANCE = 0.9;
/** Fewer open-position moves say too little about a level. */
export const MIN_ALIVE_MOVES = 6;

type Anchors = readonly (readonly [rating: number, value: number])[];

/** Average centipawn loss per move, by level. */
const ACPL: Anchors = [
  [400, 230],
  [600, 170],
  [800, 130],
  [1000, 105],
  [1200, 85],
  [1500, 62],
  [1800, 45],
  [2100, 32],
  [2400, 22],
  [2700, 14],
];

/** Mistakes, blunders and missed chances together, per 100 moves. */
const SERIOUS_PER_100: Anchors = [
  [400, 28],
  [600, 20],
  [800, 15],
  [1000, 12],
  [1200, 9.5],
  [1500, 6.5],
  [1800, 4.5],
  [2100, 3],
  [2400, 2],
  [2700, 1.2],
];

/** Blunders and missed chances, per 100 moves. */
const BLUNDERS_PER_100: Anchors = [
  [400, 16],
  [600, 11],
  [800, 8.5],
  [1000, 6.5],
  [1200, 5],
  [1500, 3.2],
  [1800, 2],
  [2100, 1.2],
  [2400, 0.7],
  [2700, 0.35],
];

/** Game precision (see gamePrecision), by level. */
const PRECISION: Anchors = [
  [400, 45],
  [600, 52],
  [800, 58],
  [1000, 64],
  [1200, 69],
  [1500, 75],
  [1800, 80],
  [2100, 85],
  [2400, 89],
  [2700, 92],
];

/**
 * The level at which a metric takes `value`, by linear interpolation between anchors
 * (ordered by rating, the metric rising or falling with it) and clamped at both ends.
 */
export function ratingFromMetric(anchors: Anchors, value: number): number {
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  const falling = first[1] > last[1];
  if (falling ? value >= first[1] : value <= first[1]) return first[0];
  if (falling ? value <= last[1] : value >= last[1]) return last[0];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [r0, v0] = anchors[i]!;
    const [r1, v1] = anchors[i + 1]!;
    const inside = falling ? value <= v0 && value >= v1 : value >= v0 && value <= v1;
    if (inside) return r0 + ((r1 - r0) * (value - v0)) / (v1 - v0);
  }
  return last[0];
}

/**
 * The level suggested by one side's play in open positions, or null with too few such
 * moves. Four measures, each mapped to a level and averaged with weights: the rate of
 * serious errors (the most telling at every level), the average loss, the precision and the
 * rate of outright blunders. Rounded to 10.
 */
export function rawRating(alive: AliveStats): number | null {
  if (alive.moves < MIN_ALIVE_MOVES || alive.acpl === null || alive.precision === null) {
    return null;
  }
  const per100 = (n: number) => (n / alive.moves) * 100;
  const parts: [number, number][] = [
    [ratingFromMetric(SERIOUS_PER_100, per100(alive.mistakes + alive.blunders)), 0.35],
    [ratingFromMetric(ACPL, alive.acpl), 0.25],
    [ratingFromMetric(PRECISION, alive.precision), 0.25],
    [ratingFromMetric(BLUNDERS_PER_100, per100(alive.blunders)), 0.15],
  ];
  const weight = parts.reduce((sum, [, w]) => sum + w, 0);
  const rating = parts.reduce((sum, [r, w]) => sum + r * w, 0) / weight;
  return Math.round(rating / 10) * 10;
}

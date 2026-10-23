/**
 * Move categories and the thresholds that decide them. See docs/CLASSIFICATION.md for the
 * full methodology and its limits.
 *
 * Losses are measured in expected points (the mover's winning chances, 0 to 1, from the
 * logistic curve in evaluation.ts), not raw centipawns: dropping 150 cp from +0.3 is
 * serious, dropping 150 cp from +9 changes nothing.
 */

export const CLASSIFICATIONS = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "forced",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
] as const;

export type Classification = (typeof CLASSIFICATIONS)[number];

export interface ClassificationRules {
  /** Upper bounds of expected-points loss for each quality band. */
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  // Anything above `mistake` is a blunder.

  /**
   * Outcome bands on the mover's winning chances: at least `winningChance` is winning,
   * at most `losingChance` is losing, in between is balanced.
   */
  winningChance: number;
  losingChance: number;

  /** Great: the second-best move loses at least this much… */
  greatGap: number;
  /** …and drops the mover into a worse outcome band (the move keeps a win or saves a game). */
  greatMinChance: number;

  /** Brilliant: net material given up, in pawns. */
  brilliantMinSacrifice: number;
  /** Brilliant: winning chances after the move. */
  brilliantMinChance: number;
  /** Brilliant: not when another move also keeps a position this good ("winning anyway"). */
  brilliantMaxAlternativeChance: number;

  /** Miss: a winning continuation was available (best move's chances at least this). */
  missMinBestChance: number;
  /** Miss: the move let the advantage go without losing (chances after at least this). */
  missMinPlayedChance: number;
  /** Miss: the opponent's previous move gave the chance away (its loss at least this). */
  missMinOpponentLoss: number;

  /** Brilliant and great are only awarded when both searches reached this depth. */
  minSpecialDepth: number;
  /** Below this depth, a classification is flagged as low confidence. */
  minConfidentDepth: number;
}

export const DEFAULT_RULES: ClassificationRules = {
  excellent: 0.02,
  good: 0.05,
  inaccuracy: 0.1,
  mistake: 0.2,
  winningChance: 0.75,
  losingChance: 0.25,
  greatGap: 0.15,
  greatMinChance: 0.4,
  brilliantMinSacrifice: 2,
  brilliantMinChance: 0.45,
  brilliantMaxAlternativeChance: 0.9,
  missMinBestChance: 0.75,
  missMinPlayedChance: 0.3,
  missMinOpponentLoss: 0.1,
  minSpecialDepth: 12,
  minConfidentDepth: 10,
};

/**
 * Rules for a sensitivity setting: "strict" flags smaller losses (thresholds × 0.75),
 * "lenient" only larger ones (× 1.35). The special labels are unchanged.
 */
export function rulesFor(sensitivity: "lenient" | "standard" | "strict"): ClassificationRules {
  if (sensitivity === "standard") return DEFAULT_RULES;
  const k = sensitivity === "strict" ? 0.75 : 1.35;
  return {
    ...DEFAULT_RULES,
    excellent: DEFAULT_RULES.excellent * k,
    good: DEFAULT_RULES.good * k,
    inaccuracy: DEFAULT_RULES.inaccuracy * k,
    mistake: DEFAULT_RULES.mistake * k,
  };
}

/** Categories that are errors, worst last. */
export const ERROR_CLASSES: readonly Classification[] = [
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
];

export function isError(c: Classification): boolean {
  return ERROR_CLASSES.includes(c);
}

/**
 * Symbol of each classification. Names and descriptions are translated messages:
 * `cls.<name>` and `cls.<name>.desc` (see src/lib/i18n/messages.ts).
 */
export const CLASSIFICATION_INFO: Record<Classification, { symbol: string }> = {
  brilliant: { symbol: "!!" },
  great: { symbol: "!" },
  best: { symbol: "★" },
  excellent: { symbol: "✓" },
  good: { symbol: "○" },
  book: { symbol: "≡" },
  forced: { symbol: "→" },
  inaccuracy: { symbol: "?!" },
  mistake: { symbol: "?" },
  miss: { symbol: "✕" },
  blunder: { symbol: "??" },
};

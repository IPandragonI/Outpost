import { classifyMove } from "@/features/classification/classify-move";
import {
  DEFAULT_RULES,
  type ClassificationRules,
} from "@/features/classification/classification-rules";
import type { PositionAnalysis } from "@/features/engine/uci-engine";

/**
 * Which positions of a game need the full-depth search, given a quick scan of every
 * position (`positions[i]` is the scan of `fens[i]`, null when missing).
 *
 * A move deserves the deeper look when the scan shows something to verify: a loss of
 * expected points, a verdict other than plain good play (brilliant, great, errors), a
 * mate involved, or a runner-up move clearly worse than the best one (the signature of an
 * "only move"). Both positions around such a move are searched again. Every other move
 * keeps its scan result, which is as reliable as a deep one for settling that the move was
 * fine. A missing analysis is always searched.
 */
export function positionsToDeepen(
  fens: readonly string[],
  ucis: readonly string[],
  positions: readonly (PositionAnalysis | null)[],
  rules: ClassificationRules = DEFAULT_RULES,
): boolean[] {
  const deepen = fens.map(() => false);
  ucis.forEach((uci, i) => {
    const before = positions[i];
    const after = positions[i + 1];
    if (!before || !after) {
      deepen[i] = true;
      deepen[i + 1] = true;
      return;
    }
    let interesting = true;
    try {
      const result = classifyMove(
        { fenBefore: fens[i]!, uci, before, after, isBook: false },
        rules,
      );
      const plain =
        result.classification === "best" ||
        result.classification === "excellent" ||
        result.classification === "good" ||
        result.classification === "forced";
      const gap =
        result.alternativeChance !== undefined ? result.chanceBest - result.alternativeChance : 0;
      interesting =
        !plain || result.loss > 0.01 || result.flags.length > 0 || gap >= rules.greatGap * 0.5;
    } catch {
      interesting = true;
    }
    if (interesting) {
      deepen[i] = true;
      deepen[i + 1] = true;
    }
  });
  return deepen;
}

/**
 * Whether the played move is one of the engine's best `n` lines in a position. A second
 * line matters only then: a "great" or "brilliant" verdict needs the gap between the best
 * move and the next one, and a played move that is the runner-up is scored by that same
 * search. For any other move the score of the resulting position is used, so one line is
 * enough. Unknown (no analysis) counts as yes.
 */
export function playedInTopLines(
  before: PositionAnalysis | null | undefined,
  uci: string | undefined,
  n = 2,
): boolean {
  if (!before || !uci) return true;
  return before.lines.slice(0, n).some((line) => line.pv[0] === uci);
}

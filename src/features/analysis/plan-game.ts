import type { SearchLimits } from "@/features/engine/uci";
import { loadOpeningBook } from "@/hooks/useOpeningBook";
import { planLimits } from "./game-analysis";

/**
 * Search limits for each main-line position: book openings shallow (their moves are
 * labelled from theory), everything else at the preset depth. Without the opening book,
 * every position gets the preset.
 */
export async function planGame(
  fens: readonly string[],
  preset: SearchLimits,
): Promise<SearchLimits[]> {
  const book = await loadOpeningBook().catch(() => null);
  if (!book) return fens.map(() => preset);
  const { lastBookIndex } = book.identify(fens);
  // Same rule as the review (useGameReview): the move reaching position k is a book move.
  return planLimits(fens.length, preset, (k) => k <= lastBookIndex && book.has(fens[k]!));
}

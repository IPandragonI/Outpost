import type { AnalysisCache } from "@/features/engine/analysis-cache";
import type { SearchLimits } from "@/features/engine/uci";
import type { PositionAnalysis } from "@/features/engine/uci-engine";

/** `lane` identifies the sequence of positions a search belongs to (see analyzePositions). */
export type Searcher = (
  fen: string,
  limits: SearchLimits,
  signal: AbortSignal,
  lane: number,
) => Promise<PositionAnalysis>;

export interface AnalysisPreset {
  id: "quick" | "standard" | "deep";
  label: string;
  limits: SearchLimits;
  description: string;
}

/**
 * Whole-game analysis settings. MultiPV 2 is the minimum the classification needs (the
 * "only move" and "brilliant" checks compare the best move with the next one); more lines
 * slow every search down, so they are left to the interactive analysis of one position.
 */
export const ANALYSIS_PRESETS: AnalysisPreset[] = [
  {
    id: "quick",
    label: "Quick",
    limits: { depth: 12, multiPv: 2 },
    description: "Depth 12. A first look in seconds; special labels are rarer at this depth.",
  },
  {
    id: "standard",
    label: "Standard",
    limits: { depth: 16, multiPv: 2 },
    description: "Depth 16. A good balance for most games.",
  },
  {
    id: "deep",
    label: "Deep",
    limits: { depth: 20, multiPv: 2 },
    description: "Depth 20. Most reliable, several times slower, best on a computer.",
  },
];

export interface AnalyzePositionsOptions {
  /** Limits for every position, or per position (see planLimits). */
  limits: SearchLimits | readonly SearchLimits[];
  engine: string;
  cache?: AnalysisCache;
  signal?: AbortSignal;
  /** Searches in flight at once; match the engine pool's parallelism. Default 1. */
  concurrency?: number;
  /** Called for each position as soon as its analysis is known (not necessarily in order). */
  onPosition?: (index: number, analysis: PositionAnalysis, fromCache: boolean) => void;
}

/** Book openings get a short search: their moves are labelled from theory, not from scores. */
export const BOOK_DEPTH = 10;

/**
 * Search limits per position. A position is searched shallowly only when both moves
 * around it (the move that reached it and the move played from it) are book moves, since
 * the classification of book moves does not depend on scores; every position a judged move
 * starts from or leads to gets the full preset. `isBookMove(k)` says whether the move
 * reaching position k is a book move, with the same rule as the game review.
 */
export function planLimits(
  count: number,
  preset: SearchLimits,
  isBookMove: (k: number) => boolean,
): SearchLimits[] {
  const shallow: SearchLimits = {
    depth: Math.min(BOOK_DEPTH, preset.depth ?? BOOK_DEPTH),
    multiPv: 1,
  };
  return Array.from({ length: count }, (_, i) =>
    (i === 0 || isBookMove(i)) && i + 1 < count && isBookMove(i + 1) ? shallow : preset,
  );
}

/**
 * Analyzes positions, reusing cached results, with up to `concurrency` searches running at
 * once. The game is cut into `concurrency` consecutive stretches ("lanes"), each analyzed
 * in game order: consecutive positions share most of their search tree, so an engine that
 * keeps its lane reuses its hash table as when a game is analyzed move after move.
 * Stops at the first error or when `signal` is aborted; what was analyzed until then has
 * been reported through `onPosition` already.
 */
export async function analyzePositions(
  fens: readonly string[],
  search: Searcher,
  options: AnalyzePositionsOptions,
): Promise<(PositionAnalysis | null)[]> {
  const results: (PositionAnalysis | null)[] = fens.map(() => null);
  const signal = options.signal ?? new AbortController().signal;
  const limitsAt = (i: number): SearchLimits =>
    Array.isArray(options.limits)
      ? (options.limits as readonly SearchLimits[])[i]!
      : (options.limits as SearchLimits);
  let failure: unknown = null;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, fens.length));
  const laneSize = Math.ceil(fens.length / concurrency);

  const worker = async (lane: number) => {
    const end = Math.min(fens.length, (lane + 1) * laneSize);
    for (let i = lane * laneSize; i < end; i++) {
      if (signal.aborted || failure !== null) return;
      const fen = fens[i]!;
      const limits = limitsAt(i);
      try {
        const cached = await options.cache?.get(fen, options.engine, limits);
        if (cached) {
          results[i] = cached;
          options.onPosition?.(i, cached, true);
          continue;
        }
        const analysis = await search(fen, limits, signal, lane);
        if (signal.aborted && !analysis.complete) return;
        results[i] = analysis;
        if (analysis.complete) await options.cache?.put(analysis);
        options.onPosition?.(i, analysis, false);
      } catch (error) {
        failure ??= error;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, (_, lane) => worker(lane)));
  if (failure !== null && !signal.aborted) throw failure;
  return results;
}

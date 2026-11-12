import type { SearchLimits } from "@/features/engine/uci";
import type { AnalysisCache } from "@/features/engine/analysis-cache";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import { playedInTopLines, positionsToDeepen } from "./deepening";
import { analyzePositions, type Searcher } from "./game-analysis";

/**
 * How a whole game is analyzed, from the exact method (every position at the preset's
 * depth) to the fast one (see FAST_STRATEGY). Each option is measured against the exact
 * method by `pnpm bench`.
 */
export interface PipelineStrategy {
  /**
   * Adaptive depth: first scan every position at this depth (0: off), then search at the
   * preset's depth only the positions around moves worth verifying (see positionsToDeepen).
   */
  scanDepth: number;
  /**
   * In that second pass, keep the second line only where the played move is one of the two
   * best moves (the only case where a second line changes a verdict).
   */
  selectiveMultiPv: boolean;
  /** Stop a search before its depth once the best move and score have settled. */
  earlyStop: boolean;
}

export const EXACT_STRATEGY: PipelineStrategy = {
  scanDepth: 0,
  selectiveMultiPv: false,
  earlyStop: false,
};

/**
 * The strategy the app uses. The options that pass the benchmark (`pnpm bench`: verdicts as
 * stable as the exact method's own run-to-run noise, and clearly faster) are on; see
 * docs/CLASSIFICATION.md for the measurements.
 */
export const ANALYSIS_STRATEGY: PipelineStrategy = EXACT_STRATEGY;

/** A source of ready evaluations (a cloud service): answers null when it has none. */
export interface RemoteEvaluator {
  get(fen: string, limits: SearchLimits, signal: AbortSignal): Promise<PositionAnalysis | null>;
}

export interface PipelineOptions {
  /** Final limits per position (the book plan applied to the preset). */
  plan: readonly SearchLimits[];
  strategy: PipelineStrategy;
  engine: string;
  cache?: AnalysisCache;
  signal?: AbortSignal;
  concurrency?: number;
  /** Optional ready-made evaluations, tried before the engine. */
  remote?: RemoteEvaluator;
  /** Each time a position gets a result; `final` is false for scan results. */
  onPosition?: (index: number, analysis: PositionAnalysis, final: boolean) => void;
  /** Overall progress, in positions of the game. */
  onProgress?: (done: number, total: number) => void;
}

/** Share of the progress bar given to the scan, when there is one. */
const SCAN_SHARE = 0.35;

/**
 * Analyzes the main line of a game: `fens[i]` is position i and `ucis[i]` the move played
 * from it. Resolves with one analysis per position (null where the run was stopped before
 * reaching it); what was found before an abort has been reported through `onPosition`.
 */
export async function analyzeGame(
  fens: readonly string[],
  ucis: readonly string[],
  search: Searcher,
  options: PipelineOptions,
): Promise<(PositionAnalysis | null)[]> {
  const { plan, strategy } = options;
  const total = fens.length;
  const signal = options.signal ?? new AbortController().signal;
  const withRemote: Searcher = options.remote
    ? async (fen, limits, s, lane) =>
        (await options.remote!.get(fen, limits, s)) ?? search(fen, limits, s, lane)
    : search;
  const common = {
    engine: options.engine,
    ...(options.cache ? { cache: options.cache } : {}),
    signal,
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
  };
  const withEarlyStop = (limits: SearchLimits): SearchLimits =>
    strategy.earlyStop && limits.depth ? { ...limits, earlyStop: true } : limits;

  const scanning =
    strategy.scanDepth > 0 && plan.some((limits) => (limits.depth ?? 0) > strategy.scanDepth);

  if (!scanning) {
    let done = 0;
    return analyzePositions(fens, withRemote, {
      ...common,
      limits: plan.map(withEarlyStop),
      onPosition: (i, analysis) => {
        done++;
        options.onPosition?.(i, analysis, true);
        options.onProgress?.(done, total);
      },
    });
  }

  // Pass 1: every position, shallow.
  let scanned = 0;
  const scanLimits = plan.map((limits) =>
    (limits.depth ?? 0) > strategy.scanDepth ? { ...limits, depth: strategy.scanDepth } : limits,
  );
  const scan = await analyzePositions(fens, withRemote, {
    ...common,
    limits: scanLimits,
    onPosition: (i, analysis) => {
      scanned++;
      options.onPosition?.(i, analysis, false);
      options.onProgress?.(Math.round(total * SCAN_SHARE * (scanned / total)), total);
    },
  });
  const results = [...scan];
  if (signal.aborted || scan.some((analysis) => analysis === null)) return results;

  // Pass 2: the positions worth a closer look, at the preset's depth.
  const deepen = positionsToDeepen(fens, ucis, scan);
  const indices = fens.flatMap((_, i) => (deepen[i] ? [i] : []));
  let deepened = 0;
  const finalLimits = indices.map((i) => {
    const base = plan[i]!;
    const secondLine = !strategy.selectiveMultiPv || playedInTopLines(scan[i], ucis[i]);
    return withEarlyStop(secondLine ? base : { ...base, multiPv: 1 });
  });
  const deeper = await analyzePositions(
    indices.map((i) => fens[i]!),
    withRemote,
    {
      ...common,
      limits: finalLimits,
      onPosition: (k, analysis) => {
        deepened++;
        options.onPosition?.(indices[k]!, analysis, true);
        options.onProgress?.(
          Math.round(total * (SCAN_SHARE + (1 - SCAN_SHARE) * (deepened / indices.length))),
          total,
        );
      },
    },
  );
  indices.forEach((i, k) => {
    if (deeper[k]) results[i] = deeper[k]!;
  });
  if (!signal.aborted && indices.length === 0) options.onProgress?.(total, total);
  return results;
}

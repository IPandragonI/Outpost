import { Chess } from "chess.js";
import { cp, mate, type Score } from "./evaluation";
import type { SearchLimits } from "./uci";
import type { EngineLine, PositionAnalysis } from "./uci-engine";

/**
 * Ready-made evaluations from Lichess's cloud (https://lichess.org/api#tag/Analysis/operation/apiCloudEval):
 * deep Stockfish results for positions that were already analyzed, which covers most of the
 * opening. It is optional and off by default, because it sends the position (a FEN: pieces,
 * side to move, castling rights; no names, no game) to lichess.org.
 */

const ENDPOINT = "https://lichess.org/api/cloud-eval";

export const CLOUD_ENGINE_NAME = "Lichess cloud evaluation";

interface CloudPv {
  moves?: string;
  cp?: number;
  mate?: number;
}

interface CloudResponse {
  depth?: number;
  pvs?: CloudPv[];
}

function scoreOf(pv: CloudPv): Score | null {
  // Lichess gives scores from White's point of view, like this app does.
  if (typeof pv.mate === "number") {
    return mate(Math.abs(pv.mate), pv.mate > 0 ? "w" : "b");
  }
  if (typeof pv.cp === "number") return cp(pv.cp);
  return null;
}

/**
 * Turns a cloud answer into an analysis, or null when it cannot stand in for a search of
 * `limits`: too shallow, fewer lines than asked for (a "great" or "brilliant" verdict needs
 * the second one) or not a legal line for the position.
 */
export function parseCloudEval(
  fen: string,
  body: unknown,
  limits: SearchLimits,
): PositionAnalysis | null {
  const data = body as CloudResponse | null;
  if (!data || typeof data.depth !== "number" || !Array.isArray(data.pvs) || !data.pvs.length) {
    return null;
  }
  if (limits.depth && data.depth < limits.depth) return null;
  let legalMoves: number;
  try {
    legalMoves = new Chess(fen).moves().length;
  } catch {
    return null;
  }
  if (data.pvs.length < Math.min(limits.multiPv, legalMoves)) return null;

  const lines: EngineLine[] = [];
  for (const [i, pv] of data.pvs.slice(0, Math.max(limits.multiPv, 1)).entries()) {
    const score = scoreOf(pv);
    const moves = typeof pv.moves === "string" ? pv.moves.trim().split(/\s+/) : [];
    if (!score || !moves.length || !moves[0]) return null;
    lines.push({ multipv: i + 1, score, depth: data.depth, pv: moves });
  }
  // The first move of the best line must be legal here: a cheap guard against a mismatch.
  try {
    const first = lines[0]!.pv[0]!;
    new Chess(fen).move({
      from: first.slice(0, 2),
      to: first.slice(2, 4),
      ...(first.length > 4 ? { promotion: first[4] } : {}),
    });
  } catch {
    return null;
  }
  return {
    fen,
    lines,
    score: lines[0]!.score,
    bestMove: lines[0]!.pv[0]!,
    depth: data.depth,
    timeMs: 0,
    limits,
    engine: CLOUD_ENGINE_NAME,
    complete: true,
    source: "cloud",
  };
}

export interface CloudEvalOptions {
  fetcher?: typeof fetch;
  /** Only positions up to this full move number are asked for (the opening). */
  maxFullMove?: number;
  /** Stop asking after this many misses in a row (the game left known territory). */
  maxMisses?: number;
  /** Minimum time between two requests, to stay polite. */
  minIntervalMs?: number;
}

/**
 * A cloud evaluator for one analysis run. It asks only about opening positions, stops as
 * soon as the game leaves known territory (a few misses in a row), or when the service
 * refuses or cannot be reached; whatever happens, the caller falls back to the engine.
 */
export function createCloudEval(options: CloudEvalOptions = {}) {
  const fetcher = options.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const maxFullMove = options.maxFullMove ?? 14;
  const maxMisses = options.maxMisses ?? 3;
  const minInterval = options.minIntervalMs ?? 150;
  let misses = 0;
  let disabled = false;
  let queue: Promise<unknown> = Promise.resolve();
  let last = 0;

  const request = async (
    fen: string,
    limits: SearchLimits,
    signal: AbortSignal,
  ): Promise<PositionAnalysis | null> => {
    if (disabled || misses >= maxMisses) return null;
    const wait = last + minInterval - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (signal.aborted || disabled) return null;
    last = Date.now();
    try {
      const url = `${ENDPOINT}?fen=${encodeURIComponent(fen)}&multiPv=${Math.max(1, limits.multiPv)}`;
      const response = await fetcher(url, { signal, headers: { Accept: "application/json" } });
      if (response.status === 404) {
        misses++;
        return null;
      }
      if (!response.ok) {
        // Rate limit or a server problem: leave the service alone for this run.
        disabled = true;
        return null;
      }
      const parsed = parseCloudEval(fen, await response.json(), limits);
      if (parsed) misses = 0;
      else misses++;
      return parsed;
    } catch {
      if (!signal.aborted) disabled = true;
      return null;
    }
  };

  return {
    async get(fen: string, limits: SearchLimits, signal: AbortSignal) {
      const fullMove = Number(fen.split(" ")[5] ?? "0");
      if (disabled || misses >= maxMisses || fullMove > maxFullMove) return null;
      // One request at a time.
      const result = queue.then(() => request(fen, limits, signal));
      queue = result.catch(() => null);
      return result;
    },
  };
}

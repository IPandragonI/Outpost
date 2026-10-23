import { positionKey } from "@/lib/chess/position";
import type { SearchLimits } from "./uci";
import type { PositionAnalysis } from "./uci-engine";

/**
 * Engine results by position. The same position reached by another move order shares the
 * entry (the key ignores move counters). A stored result is reused only when it is
 * comparable to what is asked: same engine, complete, at least as deep, and with at least
 * as many principal variations. Results stay White point of view throughout.
 */
export interface AnalysisCache {
  get(fen: string, engine: string, limits: SearchLimits): Promise<PositionAnalysis | null>;
  put(analysis: PositionAnalysis): Promise<void>;
}

export function satisfies(stored: PositionAnalysis, engine: string, limits: SearchLimits): boolean {
  if (stored.engine !== engine || !stored.complete) return false;
  if (stored.lines.length === 0) return true; // finished game: nothing more to search
  if (stored.limits.multiPv < limits.multiPv) return false;
  if (limits.depth && stored.depth < limits.depth) return false;
  if (!limits.depth && limits.movetimeMs && (stored.limits.movetimeMs ?? 0) < limits.movetimeMs) {
    return stored.limits.depth !== undefined && stored.depth >= 20;
  }
  return true;
}

/** Re-targets a cached analysis to the FEN that asked for it (same position, other counters). */
export function forFen(stored: PositionAnalysis, fen: string): PositionAnalysis {
  return stored.fen === fen ? stored : { ...stored, fen };
}

export class MemoryAnalysisCache implements AnalysisCache {
  private entries = new Map<string, PositionAnalysis[]>();

  async get(fen: string, engine: string, limits: SearchLimits) {
    const candidates = this.entries.get(positionKey(fen)) ?? [];
    const match = candidates
      .filter((a) => satisfies(a, engine, limits))
      .sort((a, b) => b.depth - a.depth)[0];
    return match ? forFen(match, fen) : null;
  }

  async put(analysis: PositionAnalysis) {
    const key = positionKey(analysis.fen);
    const list = (this.entries.get(key) ?? []).filter(
      (a) =>
        !(
          a.engine === analysis.engine &&
          a.limits.multiPv <= analysis.limits.multiPv &&
          a.depth <= analysis.depth
        ),
    );
    list.push(analysis);
    this.entries.set(key, list);
  }
}

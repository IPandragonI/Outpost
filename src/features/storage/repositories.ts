import { positionKey } from "@/lib/chess/position";
import { forFen, satisfies, type AnalysisCache } from "@/features/engine/analysis-cache";
import type { SearchLimits } from "@/features/engine/uci";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import { gameTitle, type ParsedGame } from "@/features/games/pgn";
import { mainline, type GameTree } from "@/features/games/variation-tree";
import type { OpeningInfo } from "@/features/openings/opening-book";
import {
  getDatabase,
  type GameRecord,
  type PositionRecord,
  type RepertoireRecord,
} from "./database";

const known = (value: string | undefined) =>
  value && value !== "?" && value !== "??" && value !== "????.??.??" ? value : "";

export function newId(): string {
  return crypto.randomUUID();
}

/** Builds a library record from an imported game. `opening` comes from the book, if loaded. */
export function gameRecordFrom(
  game: Pick<ParsedGame, "headers" | "tree" | "result" | "source">,
  opening: OpeningInfo | null = null,
  now = Date.now(),
): GameRecord {
  const h = game.headers;
  return {
    id: newId(),
    title: gameTitle(h),
    white: known(h.White),
    black: known(h.Black),
    event: known(h.Event),
    date: known(h.Date) || known(h.UTCDate),
    result: game.result,
    eco: opening?.eco ?? known(h.ECO),
    opening: opening?.name ?? known(h.Opening),
    headers: h,
    pgn: game.source,
    tree: game.tree,
    plies: mainline(game.tree).length - 1,
    analysis: { state: "none", presetId: null, engine: null, analyzed: 0, total: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

export const games = {
  async add(records: GameRecord[]): Promise<void> {
    await getDatabase().games.bulkAdd(records);
  },
  async list(): Promise<GameRecord[]> {
    return getDatabase().games.orderBy("updatedAt").reverse().toArray();
  },
  async get(id: string): Promise<GameRecord | undefined> {
    return getDatabase().games.get(id);
  },
  async saveTree(id: string, tree: GameTree): Promise<void> {
    await getDatabase().games.update(id, { tree, updatedAt: Date.now() });
  },
  async update(
    id: string,
    patch: Partial<
      Pick<
        GameRecord,
        | "title"
        | "headers"
        | "analysis"
        | "eco"
        | "opening"
        | "tree"
        | "result"
        | "white"
        | "black"
        | "event"
        | "date"
      >
    >,
  ): Promise<void> {
    await getDatabase().games.update(id, { ...patch, updatedAt: Date.now() });
  },
  async rename(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("A game needs a name.");
    await getDatabase().games.update(id, { title: trimmed, updatedAt: Date.now() });
  },
  async remove(id: string): Promise<void> {
    await getDatabase().games.delete(id);
  },
  async count(): Promise<number> {
    return getDatabase().games.count();
  },
};

/** Engine results in IndexedDB, shared by every game (see AnalysisCache). */
export class IndexedDbAnalysisCache implements AnalysisCache {
  async get(fen: string, engine: string, limits: SearchLimits): Promise<PositionAnalysis | null> {
    const records = await getDatabase()
      .positions.where("[key+engine]")
      .equals([positionKey(fen), engine])
      .toArray();
    const match = records
      .map((r) => r.analysis)
      .filter((a) => satisfies(a, engine, limits))
      .sort((a, b) => b.depth - a.depth)[0];
    return match ? forFen(match, fen) : null;
  }

  async put(analysis: PositionAnalysis): Promise<void> {
    const db = getDatabase();
    const key = positionKey(analysis.fen);
    await db.transaction("rw", db.positions, async () => {
      const existing = await db.positions
        .where("[key+engine]")
        .equals([key, analysis.engine])
        .toArray();
      // Drop entries the new one makes redundant (no deeper, no more lines).
      const redundant = existing
        .filter((r) => r.depth <= analysis.depth && r.multiPv <= analysis.limits.multiPv)
        .map((r) => r.id!);
      if (redundant.length) await db.positions.bulkDelete(redundant);
      const record: PositionRecord = {
        key,
        engine: analysis.engine,
        depth: analysis.depth,
        multiPv: analysis.limits.multiPv,
        analysis,
        createdAt: Date.now(),
      };
      await db.positions.add(record);
    });
  }

  async count(): Promise<number> {
    return getDatabase().positions.count();
  }

  async clear(): Promise<void> {
    await getDatabase().positions.clear();
  }

  /** Every stored result for some positions, for exports. */
  async forPositions(
    fens: readonly string[],
    engine: string,
  ): Promise<(PositionAnalysis | null)[]> {
    return Promise.all(
      fens.map(async (fen) => {
        const records = await getDatabase()
          .positions.where("[key+engine]")
          .equals([positionKey(fen), engine])
          .toArray();
        const best = records.sort((a, b) => b.depth - a.depth)[0];
        return best ? forFen(best.analysis, fen) : null;
      }),
    );
  }
}

export const analysisCache = new IndexedDbAnalysisCache();

export const repertoires = {
  async list(): Promise<RepertoireRecord[]> {
    return getDatabase().repertoires.orderBy("updatedAt").reverse().toArray();
  },
  async get(id: string) {
    return getDatabase().repertoires.get(id);
  },
  async save(record: RepertoireRecord): Promise<void> {
    await getDatabase().repertoires.put({ ...record, updatedAt: Date.now() });
  },
  async remove(id: string): Promise<void> {
    await getDatabase().repertoires.delete(id);
  },
};

export const settingsStore = {
  async get<T>(key: string): Promise<T | undefined> {
    return (await getDatabase().settings.get(key))?.value as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await getDatabase().settings.put({ key, value });
  },
};

/** Deletes every game, cached analysis, repertoire and setting stored by the app. */
export async function clearAllData(): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", [db.games, db.positions, db.repertoires, db.settings], async () => {
    await Promise.all([
      db.games.clear(),
      db.positions.clear(),
      db.repertoires.clear(),
      db.settings.clear(),
    ]);
  });
}

export interface StorageUsage {
  games: number;
  positions: number;
  repertoires: number;
  /** Bytes used and available for the site, when the browser tells. */
  usage?: number;
  quota?: number;
  persisted?: boolean;
}

export async function storageUsage(): Promise<StorageUsage> {
  const db = getDatabase();
  const [gameCount, positionCount, repertoireCount] = await Promise.all([
    db.games.count(),
    db.positions.count(),
    db.repertoires.count(),
  ]);
  const result: StorageUsage = {
    games: gameCount,
    positions: positionCount,
    repertoires: repertoireCount,
  };
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    if (estimate.usage !== undefined) result.usage = estimate.usage;
    if (estimate.quota !== undefined) result.quota = estimate.quota;
    result.persisted = (await navigator.storage.persisted?.()) ?? false;
  }
  return result;
}

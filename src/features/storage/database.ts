import Dexie, { type EntityTable } from "dexie";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import type { PgnHeaders } from "@/features/games/pgn";
import type { GameTree } from "@/features/games/variation-tree";
import type { Color } from "@/lib/chess/position";
import type { MessageKey, Translate, Vars } from "@/lib/i18n/translate";

export type AnalysisState = "none" | "partial" | "complete";

export interface GameRecord {
  id: string;
  title: string;
  white: string;
  black: string;
  event: string;
  /** PGN date as written ("2024.03.??"), kept as text: PGN dates are often partial. */
  date: string;
  result: string;
  eco: string;
  opening: string;
  headers: PgnHeaders;
  /** The game's PGN text exactly as imported (empty for games entered on the board). */
  pgn: string;
  /** Imported moves plus explored variations (see variation-tree.ts). */
  tree: GameTree;
  /** Number of half-moves in the main line. */
  plies: number;
  analysis: {
    state: AnalysisState;
    presetId: string | null;
    engine: string | null;
    analyzed: number;
    total: number;
  };
  createdAt: number;
  updatedAt: number;
}

/** One cached engine result. Several may exist per position (engines, depths, MultiPV). */
export interface PositionRecord {
  id?: number;
  /** positionKey(fen). */
  key: string;
  engine: string;
  depth: number;
  multiPv: number;
  analysis: PositionAnalysis;
  createdAt: number;
}

export interface RepertoireRecord {
  id: string;
  name: string;
  /** The side the repertoire is played for. */
  color: Color;
  tree: GameTree;
  createdAt: number;
  updatedAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export const DATABASE_NAME = "outpost";

/**
 * Schema history. Each version lists its indexes; a version that changes stored data
 * adds an `.upgrade()` step here, so existing data is migrated, never dropped.
 *
 * v1 — games, positions (engine cache), repertoires, settings.
 */
export class OutpostDatabase extends Dexie {
  games!: EntityTable<GameRecord, "id">;
  positions!: EntityTable<PositionRecord, "id">;
  repertoires!: EntityTable<RepertoireRecord, "id">;
  settings!: EntityTable<SettingRecord, "key">;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      games: "id, updatedAt, createdAt, white, black, date, result, opening, eco",
      positions: "++id, key, [key+engine]",
      repertoires: "id, updatedAt",
      settings: "key",
    });
  }
}

let instance: OutpostDatabase | null = null;

export function getDatabase(): OutpostDatabase {
  instance ??= new OutpostDatabase();
  return instance;
}

/** For tests: use a fresh database. */
export function setDatabase(db: OutpostDatabase | null) {
  instance = db;
}

/** A message for the user, translated where it is displayed. */
export interface UserMessage {
  key: MessageKey;
  vars?: Vars;
}

/** Turns IndexedDB failures into messages a user can act on. */
export function storageProblem(error: unknown): UserMessage {
  const name = (error as { name?: string } | null)?.name ?? "";
  const inner = (error as { inner?: { name?: string } } | null)?.inner?.name ?? "";
  if (name === "QuotaExceededError" || inner === "QuotaExceededError") {
    return { key: "storage.quota" };
  }
  if (name === "MissingAPIError" || name === "InvalidStateError") {
    return { key: "storage.unavailable" };
  }
  if (name === "VersionError") return { key: "storage.version" };
  return {
    key: "storage.failed",
    vars: { detail: error instanceof Error ? error.message : "" },
  };
}

export function describeStorageError(error: unknown, t: Translate): string {
  const problem = storageProblem(error);
  return t(problem.key, problem.vars);
}

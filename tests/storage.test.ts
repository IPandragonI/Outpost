import { readFileSync } from "node:fs";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cp } from "@/features/engine/evaluation";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import { parsePgn } from "@/features/games/pgn";
import { mainline } from "@/features/games/variation-tree";
import { OutpostDatabase, setDatabase } from "@/features/storage/database";
import {
  IndexedDbAnalysisCache,
  clearAllData,
  gameRecordFrom,
  games,
  settingsStore,
} from "@/features/storage/repositories";
import { START_FEN } from "@/lib/chess/position";

let db: OutpostDatabase;
let name = 0;

beforeEach(async () => {
  db = new OutpostDatabase(`test-${++name}`);
  setDatabase(db);
  await db.open();
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
  setDatabase(null);
});

const opera = parsePgn(readFileSync("tests/fixtures/opera.pgn", "utf-8")).games[0]!;

function analysis(
  fen: string,
  depth: number,
  multiPv = 2,
  engine = "Stockfish test",
): PositionAnalysis {
  return {
    fen,
    lines: [{ multipv: 1, score: cp(20 + depth), depth, pv: ["e2e4"] }],
    score: cp(20 + depth),
    bestMove: "e2e4",
    depth,
    timeMs: 10,
    limits: { depth, multiPv },
    engine,
    complete: true,
  };
}

describe("game library", () => {
  it("saves an imported game with its metadata and original PGN", async () => {
    const record = gameRecordFrom(opera);
    await games.add([record]);
    const stored = await games.get(record.id);
    expect(stored?.white).toBe("Paul Morphy");
    expect(stored?.date).toBe("1858.??.??");
    expect(stored?.eco).toBe("C41");
    expect(stored?.plies).toBe(33);
    expect(stored?.pgn).toBe(opera.source);
    expect(mainline(stored!.tree).map((n) => n.san)).toEqual(
      mainline(opera.tree).map((n) => n.san),
    );
  });

  it("renames, updates and deletes games, newest first", async () => {
    const a = gameRecordFrom(opera, null, 1000);
    const b = gameRecordFrom(opera, null, 2000);
    await games.add([a, b]);
    expect((await games.list()).map((g) => g.id)).toEqual([b.id, a.id]);
    await games.rename(a.id, "  Opera  ");
    expect((await games.get(a.id))?.title).toBe("Opera");
    expect((await games.list())[0]!.id).toBe(a.id); // renaming touches updatedAt
    await expect(games.rename(a.id, " ")).rejects.toThrow();
    await games.remove(b.id);
    expect(await games.count()).toBe(1);
  });

  it("stores settings and clears everything on request", async () => {
    await settingsStore.set("theme", "dark");
    expect(await settingsStore.get("theme")).toBe("dark");
    await games.add([gameRecordFrom(opera)]);
    await clearAllData();
    expect(await games.count()).toBe(0);
    expect(await settingsStore.get("theme")).toBeUndefined();
  });
});

describe("IndexedDB analysis cache", () => {
  const cache = new IndexedDbAnalysisCache();
  const otherCounters = START_FEN.replace(" 0 1", " 4 9");

  it("reuses a result only when it is deep enough and has enough lines", async () => {
    await cache.put(analysis(START_FEN, 16, 2));
    expect(await cache.get(START_FEN, "Stockfish test", { depth: 12, multiPv: 2 })).not.toBeNull();
    expect(await cache.get(START_FEN, "Stockfish test", { depth: 20, multiPv: 2 })).toBeNull();
    expect(await cache.get(START_FEN, "Stockfish test", { depth: 12, multiPv: 3 })).toBeNull();
    expect(await cache.get(START_FEN, "Another engine", { depth: 12, multiPv: 1 })).toBeNull();
  });

  it("matches the same position reached with other move counters", async () => {
    await cache.put(analysis(START_FEN, 14));
    const hit = await cache.get(otherCounters, "Stockfish test", { depth: 14, multiPv: 2 });
    expect(hit?.fen).toBe(otherCounters);
    expect(hit?.depth).toBe(14);
  });

  it("keeps the deepest result and drops redundant ones", async () => {
    await cache.put(analysis(START_FEN, 12));
    await cache.put(analysis(START_FEN, 18));
    expect(await cache.count()).toBe(1);
    expect((await cache.get(START_FEN, "Stockfish test", { depth: 10, multiPv: 1 }))?.depth).toBe(
      18,
    );
  });

  it("never reuses an incomplete search", async () => {
    await cache.put({ ...analysis(START_FEN, 20), complete: false });
    expect(await cache.get(START_FEN, "Stockfish test", { depth: 10, multiPv: 1 })).toBeNull();
  });
});

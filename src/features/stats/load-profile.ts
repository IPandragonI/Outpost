import { ANALYSIS_PRESETS } from "@/features/analysis/game-analysis";
import { sideOf } from "@/features/analysis/perspective";
import { planGame } from "@/features/analysis/plan-game";
import { ENGINE_NAME } from "@/features/engine/flavors";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import { mainline } from "@/features/games/variation-tree";
import type { GameRecord } from "@/features/storage/database";
import { analysisCache, games } from "@/features/storage/repositories";
import { loadOpeningBook } from "@/hooks/useOpeningBook";
import { dateOf, openingFamily, outcomeOf, timeClassOf, type ProfileGame } from "./profile";
import { buildSummary, SUMMARY_VERSION, type GameSummary } from "./summary";

/**
 * The digest of a game's analysis, rebuilt from the positions stored in the engine cache
 * (for games analyzed before summaries were kept). Null when the game is not fully
 * analyzed with what is stored here.
 */
export async function summarizeFromCache(record: GameRecord): Promise<GameSummary | null> {
  const preset = ANALYSIS_PRESETS.find((p) => p.id === record.analysis.presetId);
  if (!preset) return null;
  const line = mainline(record.tree);
  const fens = line.map((n) => n.fen);
  const plan = await planGame(fens, preset.limits);
  const positions: (PositionAnalysis | null)[] = [];
  for (const [i, fen] of fens.entries()) {
    positions.push(await analysisCache.get(fen, ENGINE_NAME, plan[i]!));
  }
  const book = await loadOpeningBook().catch(() => null);
  return buildSummary(line, positions, book);
}

const rating = (value: string | undefined): number | null => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** A stored game seen from `username`'s side; null when they did not play it. */
export function toProfileGame(
  record: GameRecord,
  summary: GameSummary,
  username: string,
): ProfileGame | null {
  const side = sideOf(record.headers, username);
  if (!side) return null;
  const mine = side === "w" ? summary.white : summary.black;
  const theirs = side === "w" ? summary.black : summary.white;
  return {
    id: record.id,
    date: dateOf(record.headers.Date, record.createdAt),
    side,
    outcome: outcomeOf(record.result, side),
    ownRating: rating(side === "w" ? record.headers.WhiteElo : record.headers.BlackElo),
    timeClass: timeClassOf(record.headers.TimeControl),
    opening: openingFamily(record.opening),
    stats: mine,
    opponent: theirs,
  };
}

/**
 * The analyzed games of `username`, ready for buildProfile. Games analyzed before summaries
 * were kept are summarized from the stored positions, once, and the summary is saved.
 */
export async function loadProfileGames(
  username: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ProfileGame[]> {
  const records = (await games.list()).filter(
    (r) => r.analysis.state === "complete" && sideOf(r.headers, username) !== null,
  );
  const result: ProfileGame[] = [];
  for (const [i, record] of records.entries()) {
    onProgress?.(i, records.length);
    let summary = record.summary?.version === SUMMARY_VERSION ? record.summary : null;
    if (!summary) {
      summary = await summarizeFromCache(record).catch(() => null);
      if (summary) await games.saveSummary(record.id, summary).catch(() => undefined);
    }
    const game = summary ? toProfileGame(record, summary, username) : null;
    if (game) result.push(game);
  }
  onProgress?.(records.length, records.length);
  return result;
}

"use client";

import type { ParsedGame, PgnError } from "@/features/games/pgn";
import { mainline } from "@/features/games/variation-tree";
import type { GameRecord } from "@/features/storage/database";
import { gameRecordFrom, games } from "@/features/storage/repositories";
import type { Translate } from "@/lib/i18n/translate";
import { loadOpeningBook } from "@/hooks/useOpeningBook";

/**
 * Saves parsed games to the library, named after their opening when the opening book is
 * available (the import works without it).
 */
export async function saveParsedGames(parsed: readonly ParsedGame[]): Promise<GameRecord[]> {
  const book = await loadOpeningBook().catch(() => null);
  const records = parsed.map((game) => {
    const opening = book?.identify(mainline(game.tree).map((n) => n.fen)).opening ?? null;
    return gameRecordFrom(game, opening);
  });
  await games.add(records);
  return records;
}

export function pgnErrorMessage(t: Translate, error: PgnError): string {
  return t(`pgnError.${error.code}`, error.vars);
}

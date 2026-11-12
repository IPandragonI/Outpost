import type { PgnHeaders } from "@/features/games/pgn";
import type { Color } from "@/lib/chess/position";

/**
 * The side `username` plays in a game, from its PGN headers (names compared without case),
 * or null when they are not a player of it. Used to put the analyzing player at the bottom
 * of the board and to write the debrief from their point of view.
 */
export function sideOf(headers: PgnHeaders, username: string): Color | null {
  const name = username.trim().toLowerCase();
  if (!name) return null;
  if (headers.White?.trim().toLowerCase() === name) return "w";
  if (headers.Black?.trim().toLowerCase() === name) return "b";
  return null;
}

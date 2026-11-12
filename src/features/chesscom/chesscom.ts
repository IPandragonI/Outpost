/**
 * Recent games of a Chess.com player, from Chess.com's public API
 * (https://www.chess.com/news/view/published-data-api). Read-only and anonymous: only
 * the username is sent, to api.chess.com, and the games are then stored locally like any
 * imported PGN. No credentials, no Chess.com data beyond the public game archives.
 */

const API = "https://api.chess.com/pub/player";

export type ChessComErrorCode =
  "invalid-username" | "not-found" | "rate-limited" | "network" | "unexpected";

export class ChessComError extends Error {
  constructor(
    readonly code: ChessComErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ChessComError";
  }
}

export interface ChessComPlayer {
  username: string;
  rating: number;
  /** "win", "checkmated", "resigned", "timeout", "agreed", "stalemate"… */
  result: string;
}

export interface ChessComGame {
  url: string;
  uuid: string;
  pgn: string;
  /** Unix time in seconds. */
  endTime: number;
  timeClass: string;
  timeControl: string;
  rated: boolean;
  white: ChessComPlayer;
  black: ChessComPlayer;
}

interface ApiGame {
  url: string;
  uuid?: string;
  pgn?: string;
  end_time: number;
  time_class: string;
  time_control: string;
  rated: boolean;
  rules: string;
  white: ChessComPlayer;
  black: ChessComPlayer;
}

const USERNAME = /^[A-Za-z0-9_-]{3,25}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME.test(username.trim());
}

async function getJson<T>(fetcher: typeof fetch, url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ChessComError("network", `Chess.com could not be reached: ${String(error)}`);
  }
  if (response.status === 404) throw new ChessComError("not-found", "No such Chess.com player.");
  if (response.status === 429) {
    throw new ChessComError("rate-limited", "Chess.com asks to wait before retrying.");
  }
  if (!response.ok) {
    throw new ChessComError("unexpected", `Chess.com answered HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

/** The game's outcome from `username`'s side, or null if they did not play it. */
export function outcomeFor(game: ChessComGame, username: string): "win" | "loss" | "draw" | null {
  const me = username.trim().toLowerCase();
  const side =
    game.white.username.toLowerCase() === me
      ? game.white
      : game.black.username.toLowerCase() === me
        ? game.black
        : null;
  if (!side) return null;
  if (side.result === "win") return "win";
  const other = side === game.white ? game.black : game.white;
  return other.result === "win" ? "loss" : "draw";
}

/**
 * The player's most recent standard-chess games, newest first: monthly archives are read
 * from the latest until `limit` games are found or `maxMonths` archives were read.
 */
export async function fetchRecentGames(
  username: string,
  options: {
    limit?: number;
    maxMonths?: number;
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  } = {},
): Promise<ChessComGame[]> {
  const name = username.trim();
  if (!isValidUsername(name)) {
    throw new ChessComError("invalid-username", "Invalid Chess.com username.");
  }
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const limit = options.limit ?? 30;
  const maxMonths = options.maxMonths ?? 3;

  const { archives } = await getJson<{ archives?: string[] }>(
    fetcher,
    `${API}/${encodeURIComponent(name.toLowerCase())}/games/archives`,
    options.signal,
  );
  const games: ChessComGame[] = [];
  // Only follow archive links that point back to the same API.
  const months = (archives ?? []).filter((a) => a.startsWith(`${API}/`)).reverse();
  for (const archive of months.slice(0, maxMonths)) {
    const month = await getJson<{ games?: ApiGame[] }>(fetcher, archive, options.signal);
    for (const g of month.games ?? []) {
      if (g.rules !== "chess" || !g.pgn) continue;
      games.push({
        url: g.url,
        uuid: g.uuid ?? g.url,
        pgn: g.pgn,
        endTime: g.end_time,
        timeClass: g.time_class,
        timeControl: g.time_control,
        rated: g.rated,
        white: g.white,
        black: g.black,
      });
    }
    if (games.length >= limit) break;
  }
  return games.sort((a, b) => b.endTime - a.endTime).slice(0, limit);
}

/**
 * Chess.com's time control: "600", "180+2" (seconds, then increment) or "1/86400" (daily,
 * seconds per move). Returns the compact label ("10 min", "3+2") or the days per move.
 */
export function parseTimeControl(control: string): { label: string } | { days: number } | null {
  const daily = /^1\/(\d+)$/.exec(control);
  if (daily) return { days: Math.max(1, Math.round(Number(daily[1]) / 86_400)) };
  const match = /^(\d+)(?:\+(\d+))?$/.exec(control);
  if (!match) return null;
  const base = Number(match[1]);
  const increment = Number(match[2] ?? 0);
  const minutes = base / 60;
  const shown = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
  if (increment > 0) return { label: `${base < 60 ? base + "s" : shown}+${increment}` };
  return { label: base < 60 ? `${base}s` : `${shown} min` };
}

/** The opening named in a Chess.com PGN's ECOUrl header, if any ("Sicilian Defense"). */
export function openingFromPgn(pgn: string): string | null {
  const slug = /\[ECOUrl "[^"]*\/openings\/([^"]+)"\]/.exec(pgn)?.[1];
  if (!slug) return null;
  // The slug ends with the moves that identify the variation ("...-3.Nf3-Nc6"): drop them.
  const words = slug.split("-").filter(Boolean);
  const end = words.findIndex((w) => /^\d+\.{0,3}/.test(w));
  const name = (end === -1 ? words : words.slice(0, end)).join(" ").trim();
  return name || null;
}

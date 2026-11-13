import { settingsStore } from "@/features/storage/repositories";
import { API, ChessComError, getJson, isValidUsername } from "./chesscom";

/**
 * A player's whole Chess.com history, read from the public archives and stats (anonymous,
 * read-only: only the username is sent to api.chess.com). It is kept compact, one small
 * entry per game and no moves, because it serves two purposes: knowing the player's actual
 * rating, and seeing how they do over all their games, not only the few that were analyzed.
 */

export type Outcome = "win" | "loss" | "draw";

export interface HistoryGame {
  /** End of the game, in seconds since the epoch. */
  end: number;
  /** "bullet", "blitz", "rapid" or "daily". */
  timeClass: string;
  rated: boolean;
  color: "w" | "b";
  result: Outcome;
  /** The player's rating and the opponent's when the game was played. */
  own: number | null;
  opp: number | null;
}

export interface ClassRating {
  current: number | null;
  best: number | null;
}

export interface ChessComHistory {
  version: 1;
  username: string;
  fetchedAt: number;
  /** Oldest first. */
  games: HistoryGame[];
  /** Per time class, from the player's stats. */
  ratings: Record<string, ClassRating>;
  /** False when the archives were cut short (too many games or months). */
  complete: boolean;
}

interface ApiSide {
  username?: string;
  rating?: number;
  result?: string;
}

interface ApiGame {
  end_time?: number;
  time_class?: string;
  rated?: boolean;
  rules?: string;
  white?: ApiSide;
  black?: ApiSide;
}

const DRAW_RESULTS = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

function outcomeOf(result: string | undefined): Outcome | null {
  if (!result) return null;
  if (result === "win") return "win";
  if (DRAW_RESULTS.has(result)) return "draw";
  return "loss";
}

/** One game of the archives, from `username`'s side; null for other variants or other players. */
export function parseArchiveGame(game: ApiGame, username: string): HistoryGame | null {
  if (game.rules !== "chess" || typeof game.end_time !== "number" || !game.time_class) return null;
  const name = username.toLowerCase();
  const white = game.white?.username?.toLowerCase() === name;
  const black = game.black?.username?.toLowerCase() === name;
  if (!white && !black) return null;
  const mine = white ? game.white! : game.black!;
  const theirs = white ? game.black : game.white;
  const result = outcomeOf(mine.result);
  if (!result) return null;
  return {
    end: game.end_time,
    timeClass: game.time_class,
    rated: game.rated === true,
    color: white ? "w" : "b",
    result,
    own: typeof mine.rating === "number" ? mine.rating : null,
    opp: typeof theirs?.rating === "number" ? theirs.rating : null,
  };
}

interface ApiStats {
  [key: string]: { last?: { rating?: number }; best?: { rating?: number } } | undefined;
}

const STAT_CLASSES: Record<string, string> = {
  chess_bullet: "bullet",
  chess_blitz: "blitz",
  chess_rapid: "rapid",
  chess_daily: "daily",
};

export function parseStats(stats: ApiStats): Record<string, ClassRating> {
  const ratings: Record<string, ClassRating> = {};
  for (const [key, timeClass] of Object.entries(STAT_CLASSES)) {
    const entry = stats[key];
    if (!entry) continue;
    ratings[timeClass] = {
      current: entry.last?.rating ?? null,
      best: entry.best?.rating ?? null,
    };
  }
  return ratings;
}

export interface FetchHistoryOptions {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  /** Months of archives to read, newest first. */
  maxMonths?: number;
  /** Stop once this many games were read. */
  maxGames?: number;
  /** Pause between two requests, to stay polite with the API. */
  delayMs?: number;
  onProgress?: (done: number, total: number) => void;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads the player's archives, newest month first, and their current and best ratings. */
export async function fetchHistory(
  username: string,
  options: FetchHistoryOptions = {},
): Promise<ChessComHistory> {
  const name = username.trim();
  if (!isValidUsername(name)) {
    throw new ChessComError("invalid-username", "Invalid Chess.com username.");
  }
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const maxMonths = options.maxMonths ?? 36;
  const maxGames = options.maxGames ?? 4000;
  const delay = options.delayMs ?? 120;
  const base = `${API}/${encodeURIComponent(name.toLowerCase())}`;

  const { archives } = await getJson<{ archives?: string[] }>(
    fetcher,
    `${base}/games/archives`,
    options.signal,
  );
  const all = (archives ?? []).filter((a) => a.startsWith(`${API}/`)).reverse();
  const months = all.slice(0, maxMonths);
  const games: HistoryGame[] = [];
  let complete = all.length <= maxMonths;

  for (const [i, archive] of months.entries()) {
    options.onProgress?.(i, months.length);
    if (i > 0) await pause(delay);
    const month = await getJson<{ games?: ApiGame[] }>(fetcher, archive, options.signal);
    for (const game of month.games ?? []) {
      const parsed = parseArchiveGame(game, name);
      if (parsed) games.push(parsed);
    }
    if (games.length >= maxGames) {
      complete = i === months.length - 1 && all.length <= maxMonths;
      break;
    }
  }
  options.onProgress?.(months.length, months.length);

  // The stats are a bonus: the archives are enough to work with.
  let ratings: Record<string, ClassRating> = {};
  try {
    ratings = parseStats(await getJson<ApiStats>(fetcher, `${base}/stats`, options.signal));
  } catch (error) {
    if (options.signal?.aborted) throw error;
  }

  games.sort((a, b) => a.end - b.end);
  return {
    version: 1,
    username: name,
    fetchedAt: Date.now(),
    games,
    ratings,
    complete,
  };
}

const KEY = "chesscom-history";

export async function saveHistory(history: ChessComHistory): Promise<void> {
  await settingsStore.set(KEY, JSON.stringify(history));
}

/** The stored history, when it belongs to `username`. */
export async function loadHistory(username: string): Promise<ChessComHistory | null> {
  try {
    const raw = await settingsStore.get<string>(KEY);
    if (!raw) return null;
    const history = JSON.parse(raw) as ChessComHistory;
    if (history.version !== 1 || history.username.toLowerCase() !== username.trim().toLowerCase()) {
      return null;
    }
    return history;
  } catch {
    return null;
  }
}

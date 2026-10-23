import { describe, expect, it } from "vitest";
import {
  ChessComError,
  fetchRecentGames,
  outcomeFor,
  type ChessComGame,
} from "@/features/chesscom/chesscom";
import { parsePgn } from "@/features/games/pgn";

const API = "https://api.chess.com/pub/player";
const PGN =
  '[Event "Live Chess"]\n[Site "Chess.com"]\n[White "alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';

function game(day: number, rules = "chess") {
  return {
    url: `https://www.chess.com/game/live/${day}`,
    uuid: `u${day}`,
    pgn: PGN,
    end_time: day * 86400,
    time_class: "blitz",
    time_control: "180",
    rated: true,
    rules,
    white: { username: "alice", rating: 1500, result: "win" },
    black: { username: "Bob", rating: 1480, result: "checkmated" },
  };
}

/** A fake api.chess.com, recording the URLs requested. */
function fakeApi(routes: Record<string, unknown>, status: Record<string, number> = {}) {
  const requested: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    if (status[url]) return new Response("", { status: status[url] });
    if (!(url in routes)) return new Response("", { status: 404 });
    return new Response(JSON.stringify(routes[url]), { status: 200 });
  }) as typeof fetch;
  return { fetcher, requested };
}

describe("Chess.com recent games", () => {
  it("reads the latest archives first and returns standard games newest first", async () => {
    const { fetcher, requested } = fakeApi({
      [`${API}/alice/games/archives`]: {
        archives: [`${API}/alice/games/2024/01`, `${API}/alice/games/2024/02`],
      },
      [`${API}/alice/games/2024/02`]: { games: [game(40), game(41, "chess960"), game(45)] },
      [`${API}/alice/games/2024/01`]: { games: [game(10)] },
    });
    const games = await fetchRecentGames("Alice", { fetcher, limit: 10 });
    expect(games.map((g) => g.uuid)).toEqual(["u45", "u40", "u10"]);
    expect(requested[0]).toBe(`${API}/alice/games/archives`);
    expect(requested[1]).toBe(`${API}/alice/games/2024/02`);
    expect(parsePgn(games[0]!.pgn).games[0]!.headers.White).toBe("alice");
  });

  it("stops reading archives once enough games are found", async () => {
    const { fetcher, requested } = fakeApi({
      [`${API}/alice/games/archives`]: {
        archives: [`${API}/alice/games/2024/01`, `${API}/alice/games/2024/02`],
      },
      [`${API}/alice/games/2024/02`]: { games: [game(40), game(45)] },
    });
    const games = await fetchRecentGames("alice", { fetcher, limit: 2 });
    expect(games).toHaveLength(2);
    expect(requested).toHaveLength(2);
  });

  it("ignores archive links that do not point to the Chess.com API", async () => {
    const { fetcher, requested } = fakeApi({
      [`${API}/alice/games/archives`]: { archives: ["https://example.com/evil"] },
    });
    expect(await fetchRecentGames("alice", { fetcher })).toEqual([]);
    expect(requested).toHaveLength(1);
  });

  it("reports invalid, unknown and rate-limited usernames", async () => {
    const { fetcher } = fakeApi({}, { [`${API}/busy/games/archives`]: 429 });
    await expect(fetchRecentGames("a b", { fetcher })).rejects.toMatchObject({
      code: "invalid-username",
    });
    await expect(fetchRecentGames("nobody", { fetcher })).rejects.toBeInstanceOf(ChessComError);
    await expect(fetchRecentGames("nobody", { fetcher })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(fetchRecentGames("busy", { fetcher })).rejects.toMatchObject({
      code: "rate-limited",
    });
  });

  it("reports network failures", async () => {
    const fetcher = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    await expect(fetchRecentGames("alice", { fetcher })).rejects.toMatchObject({ code: "network" });
  });

  it("gives the outcome from the player's side, whatever the case of the username", () => {
    const raw = game(1);
    const g: ChessComGame = {
      url: raw.url,
      uuid: raw.uuid,
      pgn: raw.pgn,
      endTime: raw.end_time,
      timeClass: raw.time_class,
      timeControl: raw.time_control,
      rated: raw.rated,
      white: raw.white,
      black: raw.black,
    };
    expect(outcomeFor(g, "ALICE")).toBe("win");
    expect(outcomeFor(g, "bob")).toBe("loss");
    expect(outcomeFor(g, "carol")).toBeNull();
    const draw = {
      ...g,
      white: { ...g.white, result: "agreed" },
      black: { ...g.black, result: "agreed" },
    };
    expect(outcomeFor(draw, "bob")).toBe("draw");
  });
});

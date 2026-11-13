import { describe, expect, it } from "vitest";
import {
  fetchHistory,
  parseArchiveGame,
  parseStats,
  type ChessComHistory,
  type HistoryGame,
} from "@/features/chesscom/history";
import { behaviorOf, dayPartOf, summarizeHistory } from "@/features/stats/behavior";

const API = "https://api.chess.com/pub/player";

describe("parseArchiveGame", () => {
  const game = (over: Record<string, unknown> = {}) => ({
    end_time: 1_700_000_000,
    time_class: "blitz",
    rated: true,
    rules: "chess",
    white: { username: "Hero", rating: 640, result: "win" },
    black: { username: "Rival", rating: 700, result: "checkmated" },
    ...over,
  });

  it("reads a game from the player's side, whatever the case of the name", () => {
    expect(parseArchiveGame(game(), "hero")).toEqual({
      end: 1_700_000_000,
      timeClass: "blitz",
      rated: true,
      color: "w",
      result: "win",
      own: 640,
      opp: 700,
    });
    const asBlack = parseArchiveGame(game(), "RIVAL")!;
    expect(asBlack).toMatchObject({ color: "b", result: "loss", own: 700, opp: 640 });
  });

  it("counts every drawing result as a draw", () => {
    for (const result of ["agreed", "repetition", "stalemate", "insufficient", "50move"]) {
      const parsed = parseArchiveGame(
        game({ black: { username: "Rival", rating: 1, result } }),
        "rival",
      );
      expect(parsed?.result).toBe("draw");
    }
  });

  it("skips other variants, other players and unreadable games", () => {
    expect(parseArchiveGame(game({ rules: "chess960" }), "hero")).toBeNull();
    expect(parseArchiveGame(game(), "someone")).toBeNull();
    expect(parseArchiveGame(game({ end_time: undefined }), "hero")).toBeNull();
  });
});

describe("parseStats", () => {
  it("keeps the current and best rating of each time class", () => {
    expect(
      parseStats({
        chess_blitz: { last: { rating: 612 }, best: { rating: 700 } },
        chess_daily: { last: { rating: 1000 } },
        tactics: {},
      }),
    ).toEqual({
      blitz: { current: 612, best: 700 },
      daily: { current: 1000, best: null },
    });
  });
});

function fakeApi(months: Record<string, unknown[]>, stats: unknown = null) {
  const urls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const ok = (json: unknown) => ({ status: 200, ok: true, json: async () => json }) as Response;
    if (url.endsWith("/games/archives")) {
      return ok({ archives: Object.keys(months).map((m) => `${API}/hero/games/${m}`) });
    }
    if (url.endsWith("/stats")) {
      return stats ? ok(stats) : ({ status: 404, ok: false } as Response);
    }
    const month = Object.entries(months).find(([m]) => url.endsWith(m));
    return month ? ok({ games: month[1] }) : ({ status: 404, ok: false } as Response);
  }) as typeof fetch;
  return { fetcher, urls };
}

const raw = (end: number, result: string) => ({
  end_time: end,
  time_class: "rapid",
  rated: true,
  rules: "chess",
  white: { username: "hero", rating: 600, result },
  black: { username: "other", rating: 650, result: "x" },
});

describe("fetchHistory", () => {
  it("reads every month, newest first, and returns the games oldest first", async () => {
    const { fetcher, urls } = fakeApi(
      { "2024/03": [raw(300, "win")], "2024/04": [raw(400, "timeout"), raw(500, "agreed")] },
      { chess_rapid: { last: { rating: 640 }, best: { rating: 700 } } },
    );
    const progress: number[] = [];
    const history = await fetchHistory("Hero", {
      fetcher,
      delayMs: 0,
      onProgress: (done) => progress.push(done),
    });
    expect(history.games.map((g) => [g.end, g.result])).toEqual([
      [300, "win"],
      [400, "loss"],
      [500, "draw"],
    ]);
    expect(history.ratings.rapid).toEqual({ current: 640, best: 700 });
    expect(history.complete).toBe(true);
    // The latest month is read first, and only the username goes into the URLs.
    expect(urls[1]).toContain("2024/04");
    expect(urls.every((u) => u.startsWith(API))).toBe(true);
    expect(progress.at(-1)).toBe(2);
  });

  it("stops at the game limit and says the history is incomplete", async () => {
    const { fetcher, urls } = fakeApi({
      "2024/01": [raw(100, "win")],
      "2024/02": [raw(200, "win"), raw(250, "win")],
      "2024/03": [raw(300, "win")],
    });
    const history = await fetchHistory("hero", { fetcher, delayMs: 0, maxGames: 2 });
    expect(history.complete).toBe(false);
    expect(history.games).toHaveLength(3);
    expect(urls.some((u) => u.includes("2024/01"))).toBe(false);
  });

  it("still returns the games when the stats cannot be read", async () => {
    const { fetcher } = fakeApi({ "2024/01": [raw(100, "win")] }, null);
    const history = await fetchHistory("hero", { fetcher, delayMs: 0 });
    expect(history.games).toHaveLength(1);
    expect(history.ratings).toEqual({});
  });

  it("refuses an invalid username before any request", async () => {
    const { fetcher, urls } = fakeApi({});
    await expect(fetchHistory("no spaces", { fetcher })).rejects.toThrow("Invalid");
    expect(urls).toHaveLength(0);
  });
});

function history(games: HistoryGame[]): ChessComHistory {
  return { version: 1, username: "hero", fetchedAt: 0, games, ratings: {}, complete: true };
}

const at = (hour: number, day = 0) => {
  const date = new Date(2024, 0, 10 + day, hour, 0, 0);
  return Math.floor(date.getTime() / 1000);
};

describe("behaviorOf", () => {
  const game = (end: number, result: HistoryGame["result"]): HistoryGame => ({
    end,
    timeClass: "blitz",
    rated: true,
    color: "w",
    result,
    own: 600,
    opp: 600,
  });

  it("needs a long history", () => {
    expect(behaviorOf(null)).toBeNull();
    expect(behaviorOf(history([game(at(10), "win")]))).toBeNull();
  });

  it("finds a player who falls apart right after a loss", () => {
    // Sittings of games two minutes apart: every game after a loss is lost, the first wins.
    const games: HistoryGame[] = [];
    for (let day = 0; day < 20; day++) {
      games.push(game(at(10, day), "win"));
      games.push(game(at(10, day) + 120, "loss"));
      games.push(game(at(10, day) + 240, "loss"));
    }
    const behavior = behaviorOf(history(games))!;
    expect(behavior.afterLoss?.score).toBeLessThan(0.3);
    expect(behavior.tilt).toBe(true);
  });

  it("does not call it tilt when games after a loss go as usual", () => {
    const games: HistoryGame[] = [];
    for (let day = 0; day < 30; day++) {
      games.push(game(at(10, day), day % 2 ? "win" : "loss"));
      games.push(game(at(10, day) + 120, day % 2 ? "loss" : "win"));
    }
    expect(behaviorOf(history(games))!.tilt).toBe(false);
  });

  it("finds the best and the worst part of the day", () => {
    const games: HistoryGame[] = [];
    for (let day = 0; day < 15; day++) {
      games.push(game(at(9, day), "win")); // morning
      games.push(game(at(21, day), "loss")); // evening
    }
    const behavior = behaviorOf(history(games))!;
    expect(behavior.best).toBe("morning");
    expect(behavior.worst).toBe("evening");
  });

  it("names parts of the day", () => {
    expect(dayPartOf(at(3))).toBe("night");
    expect(dayPartOf(at(8))).toBe("morning");
    expect(dayPartOf(at(14))).toBe("afternoon");
    expect(dayPartOf(at(22))).toBe("evening");
  });
});

describe("summarizeHistory", () => {
  it("counts results and keeps each class's rating", () => {
    const games: HistoryGame[] = [
      { end: 100, timeClass: "blitz", rated: true, color: "w", result: "win", own: 600, opp: 600 },
      { end: 200, timeClass: "blitz", rated: true, color: "b", result: "loss", own: 600, opp: 600 },
      { end: 300, timeClass: "rapid", rated: true, color: "w", result: "draw", own: 700, opp: 700 },
    ];
    const summary = summarizeHistory({
      ...history(games),
      ratings: { blitz: { current: 612, best: 650 } },
    });
    expect(summary).toMatchObject({ games: 3, win: 1, loss: 1, draw: 1, since: 100_000 });
    expect(summary.byClass[0]).toMatchObject({
      timeClass: "blitz",
      games: 2,
      current: 612,
      best: 650,
    });
    expect(summary.byClass[1]).toMatchObject({ timeClass: "rapid", current: null });
  });
});

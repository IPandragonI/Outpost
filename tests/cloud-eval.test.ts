import { describe, expect, it } from "vitest";
import { createCloudEval, parseCloudEval } from "@/features/engine/cloud-eval";
import { satisfies } from "@/features/engine/analysis-cache";
import { START_FEN } from "@/lib/chess/position";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

const body = {
  depth: 40,
  pvs: [
    { moves: "e7e5 g1f3 b8c6", cp: 25 },
    { moves: "c7c5 g1f3 d7d6", cp: 30 },
  ],
};

describe("parseCloudEval", () => {
  it("turns a cloud answer into an analysis the cache accepts", () => {
    const analysis = parseCloudEval(AFTER_E4, body, { depth: 16, multiPv: 2 })!;
    expect(analysis.source).toBe("cloud");
    expect(analysis.bestMove).toBe("e7e5");
    expect(analysis.lines).toHaveLength(2);
    expect(analysis.lines[0]!.score).toEqual({ kind: "cp", cp: 25 });
    expect(analysis.depth).toBe(40);
    // Whatever the local engine's name, a cloud result is reused.
    expect(satisfies(analysis, "Stockfish 19 (lite NNUE)", { depth: 16, multiPv: 2 })).toBe(true);
  });

  it("keeps mate scores from White's point of view", () => {
    const mated = parseCloudEval(
      AFTER_E4,
      {
        depth: 30,
        pvs: [
          { moves: "e7e5", mate: -3 },
          { moves: "c7c5", cp: -900 },
        ],
      },
      { depth: 16, multiPv: 2 },
    )!;
    expect(mated.lines[0]!.score).toEqual({ kind: "mate", moves: 3, winner: "b" });
  });

  it("refuses what cannot stand in for a search", () => {
    // Too shallow.
    expect(parseCloudEval(AFTER_E4, { ...body, depth: 10 }, { depth: 16, multiPv: 2 })).toBeNull();
    // One line when two are needed.
    expect(
      parseCloudEval(AFTER_E4, { depth: 40, pvs: [body.pvs[0]] }, { depth: 16, multiPv: 2 }),
    ).toBeNull();
    // An illegal first move for this position.
    expect(
      parseCloudEval(
        AFTER_E4,
        {
          depth: 40,
          pvs: [
            { moves: "e2e4", cp: 0 },
            { moves: "d2d4", cp: 0 },
          ],
        },
        { depth: 16, multiPv: 2 },
      ),
    ).toBeNull();
    expect(parseCloudEval(AFTER_E4, null, { depth: 16, multiPv: 2 })).toBeNull();
  });
});

function fakeFetch(handler: (url: string) => { status: number; json?: unknown }) {
  const urls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const { status, json } = handler(url);
    return { status, ok: status >= 200 && status < 300, json: async () => json } as Response;
  }) as typeof fetch;
  return { fetcher, urls };
}

describe("createCloudEval", () => {
  const limits = { depth: 16, multiPv: 2 };
  const signal = new AbortController().signal;

  it("asks for opening positions only, sending just the FEN", async () => {
    const { fetcher, urls } = fakeFetch(() => ({ status: 200, json: body }));
    const cloud = createCloudEval({ fetcher, minIntervalMs: 0 });
    expect(await cloud.get(AFTER_E4, limits, signal)).not.toBeNull();
    // Move 30 is beyond the opening limit: no request.
    const late = AFTER_E4.replace(/ 0 1$/, " 5 30");
    expect(await cloud.get(late, limits, signal)).toBeNull();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("https://lichess.org/api/cloud-eval?fen=");
    expect(urls[0]).toContain("multiPv=2");
  });

  it("stops asking after a few misses in a row", async () => {
    const { fetcher, urls } = fakeFetch(() => ({ status: 404 }));
    const cloud = createCloudEval({ fetcher, minIntervalMs: 0, maxMisses: 3 });
    for (let i = 0; i < 6; i++) await cloud.get(START_FEN, limits, signal);
    expect(urls).toHaveLength(3);
  });

  it("gives the service up for the run when it refuses", async () => {
    const { fetcher, urls } = fakeFetch(() => ({ status: 429 }));
    const cloud = createCloudEval({ fetcher, minIntervalMs: 0 });
    expect(await cloud.get(START_FEN, limits, signal)).toBeNull();
    expect(await cloud.get(AFTER_E4, limits, signal)).toBeNull();
    expect(urls).toHaveLength(1);
  });

  it("falls back quietly when the network fails", async () => {
    const fetcher = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    const cloud = createCloudEval({ fetcher, minIntervalMs: 0 });
    expect(await cloud.get(START_FEN, limits, signal)).toBeNull();
  });
});

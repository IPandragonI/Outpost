import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UciEngine } from "@/features/engine/uci-engine";
import { START_FEN } from "@/lib/chess/position";
import { nodeEngineTransport, silentTransport } from "./helpers/node-engine";

// Real Stockfish 19 (lite NNUE): these check behaviour on known positions, not exact numbers.
let engine: UciEngine;

beforeAll(async () => {
  engine = await UciEngine.create(nodeEngineTransport(), { hashMb: 16 });
}, 60_000);

afterAll(() => engine?.terminate());

describe("UciEngine with Stockfish", () => {
  it("identifies itself", () => {
    expect(engine.name).toMatch(/Stockfish/);
  });

  it("finds a mate in one and reports it from White's point of view", async () => {
    // Back-rank mate: Re8#.
    const result = await engine.search("6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", {
      depth: 10,
      multiPv: 1,
    });
    expect(result.bestMove).toBe("e1e8");
    expect(result.score).toEqual({ kind: "mate", moves: 1, winner: "w" });
    expect(result.complete).toBe(true);
  });

  it("reports a mate against the side to move as the opponent's", async () => {
    // Black to move, White threatens nothing yet but Black is lost: K+Q vs K, mate in a few.
    const result = await engine.search("7k/8/5K2/8/8/8/8/6Q1 b - - 0 1", { depth: 14, multiPv: 1 });
    expect(result.score.kind).toBe("mate");
    expect(result.score.kind === "mate" && result.score.winner).toBe("w");
  });

  it("returns several principal variations, best first", async () => {
    const result = await engine.search(START_FEN, { depth: 10, multiPv: 3 });
    expect(result.lines).toHaveLength(3);
    expect(result.lines.map((l) => l.multipv)).toEqual([1, 2, 3]);
    expect(result.lines[0]!.pv[0]).toBe(result.bestMove);
    expect(result.depth).toBeGreaterThanOrEqual(10);
    // The initial position is roughly balanced.
    expect(result.score.kind === "cp" && Math.abs(result.score.cp)).toBeLessThan(80);
  });

  it("evaluates a queen up as winning for the right side", async () => {
    const blackUp = await engine.search("4k3/8/8/3q4/8/8/8/4K3 w - - 0 1", {
      depth: 10,
      multiPv: 1,
    });
    expect(blackUp.score.kind === "mate" || blackUp.score.cp < -500).toBe(true);
  });

  it("handles positions without legal moves without searching", async () => {
    const checkmated = await engine.search("4R1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1", {
      depth: 10,
      multiPv: 1,
    });
    expect(checkmated.lines).toEqual([]);
    expect(checkmated.score).toEqual({ kind: "mate", moves: 0, winner: "w" });
    const stalemate = await engine.search("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", {
      depth: 10,
      multiPv: 1,
    });
    expect(stalemate.score).toEqual({ kind: "cp", cp: 0 });
  });

  it("stops a search when aborted and returns the partial result", async () => {
    const controller = new AbortController();
    const search = engine.search(START_FEN, { multiPv: 1 }, undefined, controller.signal);
    setTimeout(() => controller.abort(), 300);
    const result = await search;
    expect(result.complete).toBe(false);
    expect(result.bestMove).toMatch(/^[a-h][1-8][a-h][1-8]/);
  });

  it("runs queued searches in order and keeps results with their position", async () => {
    const fens = [
      START_FEN,
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    ];
    const results = await Promise.all(
      fens.map((fen) => engine.search(fen, { depth: 8, multiPv: 1 })),
    );
    expect(results.map((r) => r.fen)).toEqual(fens);
    expect(results[2]!.bestMove).toBe("e1e8");
  });

  it("rejects a search aborted before it starts", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      engine.search(START_FEN, { depth: 5, multiPv: 1 }, undefined, controller.signal),
    ).rejects.toThrow(/cancel/i);
  });
});

describe("UciEngine initialization", () => {
  it("fails with a clear error and releases the engine when it never answers", async () => {
    const transport = silentTransport();
    await expect(UciEngine.create(transport, { initTimeoutMs: 50 })).rejects.toThrow(
      /did not answer/,
    );
    expect(transport.terminated).toBe(true);
  });
});

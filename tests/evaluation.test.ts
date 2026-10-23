import { describe, expect, it } from "vitest";
import {
  barValue,
  cp,
  formatScore,
  fromUci,
  mate,
  scoreValueFor,
  whiteWinChance,
  winChanceFor,
} from "@/features/engine/evaluation";
import { parseUciLine } from "@/features/engine/uci";

describe("evaluation perspective", () => {
  it("converts side-to-move scores to White's point of view", () => {
    expect(fromUci("cp", 50, "w")).toEqual(cp(50));
    expect(fromUci("cp", 50, "b")).toEqual(cp(-50));
    expect(fromUci("mate", 3, "b")).toEqual(mate(3, "b"));
    expect(fromUci("mate", -2, "b")).toEqual(mate(2, "w"));
    // "mate 0": the side to move is checkmated.
    expect(fromUci("mate", 0, "w")).toEqual(mate(0, "b"));
  });

  it("gives each side complementary winning chances", () => {
    for (const score of [cp(0), cp(137), cp(-480), mate(4, "w"), mate(1, "b")]) {
      expect(winChanceFor(score, "w") + winChanceFor(score, "b")).toBeCloseTo(1, 10);
    }
    expect(whiteWinChance(cp(0))).toBeCloseTo(0.5, 10);
    expect(whiteWinChance(mate(5, "w"))).toBe(1);
    expect(whiteWinChance(mate(0, "b"))).toBe(0);
  });

  it("compresses differences in already decided positions", () => {
    const equalLoss = whiteWinChance(cp(0)) - whiteWinChance(cp(-200));
    const winningLoss = whiteWinChance(cp(900)) - whiteWinChance(cp(700));
    expect(equalLoss).toBeGreaterThan(0.15);
    expect(winningLoss).toBeLessThan(0.05);
    // Clamped beyond ±1000 cp.
    expect(whiteWinChance(cp(5000))).toBe(whiteWinChance(cp(1000)));
  });

  it("orders mates above centipawns and shorter mates above longer ones", () => {
    expect(scoreValueFor(mate(2, "w"), "w")).toBeGreaterThan(scoreValueFor(mate(5, "w"), "w"));
    expect(scoreValueFor(mate(9, "w"), "w")).toBeGreaterThan(scoreValueFor(cp(3000), "w"));
    expect(scoreValueFor(mate(9, "w"), "b")).toBeLessThan(scoreValueFor(cp(-3000), "b"));
  });

  it("formats scores", () => {
    expect(formatScore(cp(125))).toBe("+1.25");
    expect(formatScore(cp(-40))).toBe("−0.40");
    expect(formatScore(cp(0))).toBe("0.00");
    expect(formatScore(mate(3, "w"))).toBe("#3");
    expect(formatScore(mate(2, "b"))).toBe("−#2");
    expect(barValue(cp(0))).toBeCloseTo(0);
  });
});

describe("parseUciLine", () => {
  it("parses a MultiPV info line from Black's point of view", () => {
    const message = parseUciLine(
      "info depth 18 seldepth 25 multipv 2 score cp 34 nodes 120000 nps 900000 hashfull 40 time 133 pv e7e5 g1f3 b8c6",
      "b",
    );
    expect(message).toEqual({
      type: "info",
      info: {
        depth: 18,
        seldepth: 25,
        multipv: 2,
        score: cp(-34),
        nodes: 120000,
        nps: 900000,
        hashfull: 40,
        timeMs: 133,
        pv: ["e7e5", "g1f3", "b8c6"],
      },
    });
  });

  it("flips bounds with the point of view", () => {
    const message = parseUciLine("info depth 10 score cp 20 lowerbound pv d7d5", "b");
    expect(message.type === "info" && message.info.bound).toBe("upper");
  });

  it("parses bestmove, including positions without moves", () => {
    expect(parseUciLine("bestmove e2e4 ponder e7e5", "w")).toEqual({
      type: "bestmove",
      move: "e2e4",
      ponder: "e7e5",
    });
    expect(parseUciLine("bestmove (none)", "w")).toEqual({ type: "bestmove", move: null });
  });

  it("ignores info lines without a variation", () => {
    expect(parseUciLine("info depth 5 currmove e2e4 currmovenumber 1", "w").type).toBe("other");
    expect(parseUciLine("info string NNUE evaluation enabled", "w").type).toBe("other");
  });
});

import { Chess } from "chess.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LESSONS, TOPICS } from "@/features/learn/lessons";
import { UciEngine } from "@/features/engine/uci-engine";
import { isValidFen, parseUci } from "@/lib/chess/position";
import { nodeEngineTransport } from "./helpers/node-engine";

describe("lessons", () => {
  it("cover every topic with unique ids and both languages", () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const topic of TOPICS) {
      expect(
        LESSONS.some((l) => l.topic === topic.id),
        topic.id,
      ).toBe(true);
    }
    for (const lesson of LESSONS) {
      for (const text of [lesson.title, lesson.summary]) {
        expect(text.fr.trim(), lesson.id).not.toBe("");
        expect(text.en.trim(), lesson.id).not.toBe("");
      }
      expect(lesson.body.fr.length, lesson.id).toBe(lesson.body.en.length);
      expect(lesson.line ?? lesson.exercise, lesson.id).toBeTruthy();
    }
  });

  it("use legal positions and legal lines", () => {
    for (const lesson of LESSONS) {
      expect(isValidFen(lesson.fen), lesson.id).toBe(true);
      if (lesson.exercise) expect(isValidFen(lesson.exercise.fen), lesson.id).toBe(true);
      const chess = new Chess(lesson.fen);
      for (const san of lesson.line ?? []) {
        expect(() => chess.move(san), `${lesson.id}: ${san}`).not.toThrow();
      }
      if (lesson.exercise) {
        const move = new Chess(lesson.exercise.fen).move(lesson.exercise.solution);
        expect(move.san, lesson.id).toBe(lesson.exercise.solution);
      }
    }
  });
});

describe("endgame verdicts, checked by Stockfish", () => {
  let engine: UciEngine;
  beforeAll(async () => {
    engine = await UciEngine.create(nodeEngineTransport(), { hashMb: 32 });
  }, 60_000);
  afterAll(() => engine?.terminate());

  it("puts every endgame lesson in a group", () => {
    for (const lesson of LESSONS.filter((l) => l.topic === "endgames")) {
      expect(lesson.group, lesson.id).toBeTruthy();
    }
  });

  for (const lesson of LESSONS.filter((l) => l.verdict)) {
    it(`${lesson.id} is a ${lesson.verdict}`, async () => {
      const result = await engine.search(lesson.fen, { depth: 20, multiPv: 1 });
      const s = result.score;
      const verdict =
        s.kind === "mate"
          ? s.winner === "w"
            ? "win"
            : "loss"
          : s.cp >= 300
            ? "win"
            : Math.abs(s.cp) < 250
              ? "draw"
              : "unclear";
      expect(verdict, JSON.stringify(s)).toBe(lesson.verdict);
    });
  }
});

// Each exercise solution must be what Stockfish plays (or a mate when a mate is asked).
describe("exercise solutions, checked by Stockfish", () => {
  let engine: UciEngine;
  beforeAll(async () => {
    engine = await UciEngine.create(nodeEngineTransport(), { hashMb: 16 });
  }, 60_000);
  afterAll(() => engine?.terminate());

  for (const lesson of LESSONS.filter((l) => l.exercise)) {
    it(lesson.id, async () => {
      const exercise = lesson.exercise!;
      const result = await engine.search(exercise.fen, { depth: 16, multiPv: 2 });
      const best = new Chess(exercise.fen).move(parseUci(result.bestMove!)).san;
      if (exercise.solution.endsWith("#")) {
        expect(result.score).toMatchObject({ kind: "mate", moves: 1 });
      } else {
        expect(best).toBe(exercise.solution);
        // The solution is clearly better than any alternative (a real "find the move").
        const second = result.lines[1];
        const first = result.lines[0]!;
        if (second && first.score.kind === "cp" && second.score.kind === "cp") {
          expect(Math.abs(first.score.cp - second.score.cp)).toBeGreaterThan(200);
        }
      }
    });
  }
});

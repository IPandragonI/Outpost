import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportLine, exportPgn } from "@/features/games/pgn-export";
import { gameTitle, parsePgn } from "@/features/games/pgn";
import { getNode, mainline } from "@/features/games/variation-tree";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf-8");

function single(pgn: string) {
  const { games, errors } = parsePgn(pgn);
  expect(errors).toEqual([]);
  expect(games).toHaveLength(1);
  return games[0]!;
}

describe("parsePgn", () => {
  it("imports a complete game with its tags", () => {
    const game = single(fixture("opera.pgn"));
    expect(game.headers.White).toBe("Paul Morphy");
    expect(game.result).toBe("1-0");
    const line = mainline(game.tree);
    expect(line).toHaveLength(34); // root + 33 half-moves
    expect(line.at(-1)!.san).toBe("Rd8#");
    expect(line[23]!.san).toBe("O-O-O");
    expect(gameTitle(game.headers)).toBe("Paul Morphy – Duke Karl / Count Isouard");
  });

  it("reads several games from one file", () => {
    const { games, errors } = parsePgn(`${fixture("opera.pgn")}\n\n${fixture("immortal.pgn")}`);
    expect(errors).toEqual([]);
    expect(games.map((g) => g.headers.Black)).toEqual([
      "Duke Karl / Count Isouard",
      "Lionel Kieseritzky",
    ]);
    expect(mainline(games[1]!.tree).at(-1)!.san).toBe("Be7#");
    expect(games[1]!.source).toContain("Kieseritzky");
    expect(games[1]!.source).not.toContain("Morphy");
  });

  it("keeps variations, comments and NAGs without changing the main line", () => {
    const game = single(
      `[Event "Test"]\n\n{Start} 1. e4 e5! (1... c5 {Sicilian} 2. Nf3 (2. c3) 2... d6) 2. Nf3 $1 Nc6 *`,
    );
    const line = mainline(game.tree);
    expect(line.map((n) => n.san)).toEqual([null, "e4", "e5", "Nf3", "Nc6"]);
    expect(getNode(game.tree, game.tree.rootId).comment).toBe("Start");
    const e4 = line[1]!;
    expect(e4.children).toHaveLength(2);
    const c5 = getNode(game.tree, e4.children[1]!);
    expect(c5.san).toBe("c5");
    expect(c5.comment).toBe("Sicilian");
    expect(c5.children.map((id) => getNode(game.tree, id).san)).toEqual(["Nf3", "c3"]);
    const nf3AfterC5 = getNode(game.tree, c5.children[0]!);
    expect(nf3AfterC5.children.map((id) => getNode(game.tree, id).san)).toEqual(["d6"]);
    expect(line[2]!.nags).toEqual([1]);
    expect(line[3]!.nags).toEqual([1]);
    expect(game.result).toBe("*");
  });

  it("parses clock annotations and strips engine commands from comments", () => {
    const game = single(
      `[Event "Live"]\n\n1. e4 {[%clk 0:09:58.3]} 1... e5 {[%eval 0.2] [%clk 1:00:00]} 2. Nf3 {A good move [%clk 0:09:50]} *`,
    );
    const line = mainline(game.tree);
    expect(line[1]!.clock).toBeCloseTo(598.3);
    expect(line[1]!.comment).toBeUndefined();
    expect(line[2]!.clock).toBe(3600);
    expect(line[3]!.comment).toBe("A good move");
  });

  it("accepts move numbers glued to moves, zero castling and missing tags", () => {
    const game = single("1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.0-0 Nf6 *");
    expect(mainline(game.tree).at(-2)!.san).toBe("O-O");
  });

  it("starts from a FEN tag", () => {
    const fen = "8/8/8/8/8/5k2/4q3/6K1 b - - 0 1";
    const game = single(`[SetUp "1"]\n[FEN "${fen}"]\n\n1... Qg2# 0-1`);
    expect(getNode(game.tree, game.tree.rootId).fen).toBe(fen);
    expect(mainline(game.tree)[1]!.ply).toBe(2);
    expect(game.result).toBe("0-1");
  });

  it("reports an illegal main-line move with its move number", () => {
    const { games, errors } = parsePgn('[Event "Bad"]\n\n1. e4 e5 2. Ke3 *');
    expect(games).toHaveLength(0);
    expect(errors[0]!.message).toContain("2. Ke3");
  });

  it("imports the valid games of a file even when another one is invalid", () => {
    const { games, errors } = parsePgn(`${fixture("opera.pgn")}\n\n[Event "Bad"]\n\n1. e5 *`);
    expect(games).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.gameIndex).toBe(2);
  });

  it("keeps the game when only a variation is illegal", () => {
    const game = single("1. e4 (1. d4 Ke7) 1... e5 *");
    expect(mainline(game.tree).map((n) => n.san)).toEqual([null, "e4", "e5"]);
    expect(game.warnings[0]).toContain("Ke7");
  });

  it("rejects a FEN tag the engine could not analyze", () => {
    // Black king in check with White to move: chess.js accepts it, Stockfish does not.
    const { errors } = parsePgn(
      '[SetUp "1"]\n[FEN "k7/8/1K6/8/8/8/8/7Q w - - 0 1"]\n\n1. Qh8# 1-0',
    );
    expect(errors[0]?.code).toBe("badFen");
  });

  it("rejects empty input", () => {
    expect(parsePgn("   ").errors[0]!.message).toMatch(/empty/i);
  });
});

describe("exportPgn", () => {
  it("round-trips a game with variations and annotations", () => {
    const original = single(
      `[Event "Test"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 $1 (1... c5 {Sicilian} 2. Nf3) 2. Nf3 {[%clk 0:05:00]} 1-0`,
    );
    const pgn = exportPgn(original.tree, original.headers, original.result);
    expect(pgn).toContain('[Event "Test"]');
    expect(pgn).toContain("1. e4 e5 $1 (1... c5 {Sicilian} 2. Nf3) 2. Nf3 {[%clk 0:05:00]} 1-0");
    const again = single(pgn);
    expect(mainline(again.tree).map((n) => n.san)).toEqual(
      mainline(original.tree).map((n) => n.san),
    );
    expect(Object.keys(again.tree.nodes)).toHaveLength(Object.keys(original.tree.nodes).length);
  });

  it("round-trips real games exactly", () => {
    for (const name of ["opera.pgn", "immortal.pgn"]) {
      const game = single(fixture(name));
      const again = single(exportPgn(game.tree, game.headers, game.result));
      expect(again.headers).toEqual(game.headers);
      expect(mainline(again.tree).map((n) => n.fen)).toEqual(mainline(game.tree).map((n) => n.fen));
    }
  });

  it("writes the FEN tag for games that do not start from the initial position", () => {
    const fen = "8/8/8/8/8/5k2/4q3/6K1 b - - 0 1";
    const game = single(`[FEN "${fen}"]\n[SetUp "1"]\n\n1... Qg2# 0-1`);
    const pgn = exportPgn(game.tree, game.headers, game.result);
    expect(pgn).toContain(`[FEN "${fen}"]`);
    expect(pgn).toContain("1... Qg2# 0-1");
  });

  it("exports a single line", () => {
    const game = single("1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *");
    const c5 = getNode(game.tree, mainline(game.tree)[1]!.children[1]!);
    const nf3 = c5.children[0]!;
    const pgn = exportLine(game.tree, nf3, {});
    expect(pgn.trim().split("\n").at(-1)).toBe("1. e4 c5 2. Nf3 *");
  });
});

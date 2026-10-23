import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  addLine,
  checkTrainingMove,
  emptyRepertoire,
  opponentReply,
  preparedMoves,
  removeMove,
  repertoireLines,
} from "@/features/openings/repertoire";
import { getNode } from "@/features/games/variation-tree";

function fenAfter(uci: string[]): string {
  const chess = new Chess();
  for (const u of uci) chess.move({ from: u.slice(0, 2), to: u.slice(2, 4) });
  return chess.fen();
}

describe("repertoire", () => {
  // White repertoire: 1. e4, against 1...e5 2. Nf3, against 1...c5 2. Nf3.
  let { tree } = addLine(emptyRepertoire(), ["e2e4", "e7e5", "g1f3"]);
  ({ tree } = addLine(tree, ["e2e4", "c7c5", "g1f3"]));

  it("shares moves between lines and lists every line", () => {
    expect(getNode(tree, tree.rootId).children).toHaveLength(1);
    expect(repertoireLines(tree).map((l) => l.map((n) => n.san).join(" "))).toEqual([
      "e4 e5 Nf3",
      "e4 c5 Nf3",
    ]);
  });

  it("finds prepared moves by position", () => {
    expect(preparedMoves(tree, fenAfter(["e2e4"])).sort()).toEqual(["c7c5", "e7e5"]);
    expect(preparedMoves(tree, fenAfter(["e2e4", "e7e5"]))).toEqual(["g1f3"]);
  });

  it("finds prepared moves after a transposition", () => {
    // 1. e4 Nf6 2. Nc3 e5? vs the prepared position after 1. e4 e5 2. Nc3 Nf6.
    const { tree: t } = addLine(emptyRepertoire(), ["e2e4", "e7e5", "b1c3", "g8f6", "f2f4"]);
    expect(preparedMoves(t, fenAfter(["e2e4", "g8f6", "b1c3", "e7e5"]))).toEqual(["f2f4"]);
  });

  it("checks adherence, separately from move quality", () => {
    const afterE5 = fenAfter(["e2e4", "e7e5"]);
    expect(checkTrainingMove(tree, afterE5, "g1f3")).toEqual({ kind: "repertoire" });
    // 2. Nc3 is a perfectly good move, but not the prepared one.
    expect(checkTrainingMove(tree, afterE5, "b1c3")).toEqual({
      kind: "deviation",
      expected: ["g1f3"],
    });
    expect(checkTrainingMove(tree, fenAfter(["d2d4"]), "d7d5")).toEqual({ kind: "unprepared" });
  });

  it("picks opponent replies among the prepared ones", () => {
    const fen = fenAfter(["e2e4"]);
    expect(opponentReply(tree, fen, () => 0)).toBe("e7e5");
    expect(opponentReply(tree, fen, () => 0.99)).toBe("c7c5");
    expect(opponentReply(tree, fenAfter(["e2e4", "e7e5", "g1f3"]))).toBeNull();
  });

  it("removes a move with its continuation", () => {
    const c5 = getNode(tree, getNode(tree, tree.rootId).children[0]!).children[1]!;
    const pruned = removeMove(tree, c5);
    expect(repertoireLines(pruned)).toHaveLength(1);
  });
});

import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { parsePgn } from "@/features/games/pgn";
import {
  addMove,
  deleteSubtree,
  getNode,
  lineEnd,
  mainline,
  mainlineAncestor,
  nextInLine,
  pathTo,
  withoutExplorations,
  type GameTree,
} from "@/features/games/variation-tree";
import { uciOf } from "@/lib/chess/position";

function play(tree: GameTree, parentId: string, san: string) {
  const chess = new Chess(getNode(tree, parentId).fen);
  const move = chess.move(san);
  return addMove(tree, parentId, {
    san: move.san,
    uci: uciOf(move),
    fen: chess.fen(),
    origin: "explore",
  });
}

const game = parsePgn("1. e4 e5 2. Nf3 Nc6 *").games[0]!;

describe("variation tree", () => {
  it("explores without modifying the imported main line", () => {
    const main = mainline(game.tree);
    const afterE4 = main[1]!.id;
    const { tree, id } = play(game.tree, afterE4, "c5");
    expect(mainline(tree).map((n) => n.id)).toEqual(main.map((n) => n.id));
    expect(getNode(tree, afterE4).children[0]).toBe(main[2]!.id);
    expect(getNode(tree, id).origin).toBe("explore");
    // The original tree object is untouched (immutable updates).
    expect(getNode(game.tree, afterE4).children).toHaveLength(1);
  });

  it("reuses the node when a move that already exists is played again", () => {
    const main = mainline(game.tree);
    const { tree, id } = play(game.tree, main[1]!.id, "e5");
    expect(tree).toBe(game.tree);
    expect(id).toBe(main[2]!.id);
  });

  it("does not extend the main line with moves explored after the game's end", () => {
    const last = mainline(game.tree).at(-1)!;
    const { tree, id } = play(game.tree, last.id, "Bb5");
    expect(mainline(tree).at(-1)!.id).toBe(last.id);
    expect(nextInLine(tree, last.id)).toBe(id);
    expect(mainlineAncestor(tree, id)).toBe(last.id);
  });

  it("finds paths, line ends and the branch point of a variation", () => {
    const main = mainline(game.tree);
    let { tree, id } = play(game.tree, main[2]!.id, "Bc4");
    ({ tree, id } = play(tree, id, "Nf6"));
    expect(pathTo(tree, id).map((n) => n.san)).toEqual([null, "e4", "e5", "Bc4", "Nf6"]);
    expect(mainlineAncestor(tree, id)).toBe(main[2]!.id);
    expect(lineEnd(tree, getNode(tree, id).parentId!)).toBe(id);
    expect(getNode(tree, id).ply).toBe(4);
  });

  it("deletes explored variations but never the game's moves", () => {
    const main = mainline(game.tree);
    const branch = play(game.tree, main[1]!.id, "c5");
    const deeper = play(branch.tree, branch.id, "Nf3");
    const pruned = deleteSubtree(deeper.tree, branch.id);
    expect(pruned.nodes[branch.id]).toBeUndefined();
    expect(pruned.nodes[deeper.id]).toBeUndefined();
    expect(getNode(pruned, main[1]!.id).children).toEqual([main[2]!.id]);
    expect(() => deleteSubtree(pruned, main[2]!.id)).toThrow();
  });

  it("restores the tree as imported", () => {
    const main = mainline(game.tree);
    const explored = play(game.tree, main[3]!.id, "d5");
    expect(withoutExplorations(explored.tree).nodes).toEqual(game.tree.nodes);
  });
});

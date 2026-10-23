import { Chess } from "chess.js";
import {
  parseUci,
  positionKey,
  sideToMove,
  START_FEN,
  uciOf,
  type Color,
} from "@/lib/chess/position";
import {
  addMove,
  createTree,
  deleteSubtree,
  getNode,
  type GameTree,
  type MoveNode,
  type NodeId,
} from "@/features/games/variation-tree";

/**
 * A personal repertoire: a tree of moves from the initial position for one side. The
 * user's own moves are the repertoire's choices; the opponent's moves are the replies it
 * prepares for. Positions are matched by key, so a line reached by another move order
 * still finds its prepared moves.
 */

export function emptyRepertoire(): GameTree {
  return createTree(START_FEN);
}

/** Adds a line of UCI moves from the initial position; existing moves are reused. */
export function addLine(tree: GameTree, uci: readonly string[]): { tree: GameTree; leaf: NodeId } {
  let current = tree.rootId;
  const chess = new Chess(getNode(tree, tree.rootId).fen);
  for (const u of uci) {
    const move = chess.move(parseUci(u));
    const added = addMove(tree, current, {
      san: move.san,
      uci: uciOf(move),
      fen: chess.fen(),
      origin: "game",
    });
    tree = added.tree;
    current = added.id;
  }
  return { tree, leaf: current };
}

/** Removes a move and everything prepared after it. */
export function removeMove(tree: GameTree, id: NodeId): GameTree {
  return deleteSubtree(tree, id, { allowGameMoves: true });
}

function nodesAt(tree: GameTree, fen: string): MoveNode[] {
  const key = positionKey(fen);
  return Object.values(tree.nodes).filter((n) => positionKey(n.fen) === key);
}

/** Moves the repertoire has after `fen` (UCI, unique), whichever move order reached it. */
export function preparedMoves(tree: GameTree, fen: string): string[] {
  const moves = new Set<string>();
  for (const node of nodesAt(tree, fen)) {
    for (const child of node.children) {
      const uci = tree.nodes[child]?.uci;
      if (uci) moves.add(uci);
    }
  }
  return [...moves];
}

/** Every line of the repertoire, root to leaf, as nodes without the root. */
export function repertoireLines(tree: GameTree): MoveNode[][] {
  const lines: MoveNode[][] = [];
  const walk = (id: NodeId, path: MoveNode[]) => {
    const node = getNode(tree, id);
    const next = node.parentId === null ? path : [...path, node];
    if (!node.children.length) {
      if (next.length) lines.push(next);
      return;
    }
    for (const child of node.children) walk(child, next);
  };
  walk(tree.rootId, []);
  return lines;
}

export type TrainingVerdict =
  /** The move is one the repertoire prepares. */
  | { kind: "repertoire" }
  /** The repertoire prepares other moves here; the move may still be playable. */
  | { kind: "deviation"; expected: string[] }
  /** The repertoire has nothing for this position: the line is over. */
  | { kind: "unprepared" };

/** Checks the trainee's move against the repertoire (adherence, not quality). */
export function checkTrainingMove(tree: GameTree, fen: string, uci: string): TrainingVerdict {
  const expected = preparedMoves(tree, fen);
  if (!expected.length) return { kind: "unprepared" };
  return expected.includes(uci) ? { kind: "repertoire" } : { kind: "deviation", expected };
}

/** The opponent's reply during training: one of the prepared replies, at random. */
export function opponentReply(tree: GameTree, fen: string, random = Math.random): string | null {
  const moves = preparedMoves(tree, fen);
  if (!moves.length) return null;
  return moves[Math.floor(random() * moves.length)] ?? null;
}

/** Whose turn it is for the repertoire's owner in `fen`. */
export function isOwnTurn(color: Color, fen: string): boolean {
  return sideToMove(fen) === color;
}

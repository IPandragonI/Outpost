import { START_FEN } from "@/lib/chess/position";

export type NodeId = string;

/**
 * Where a move comes from. "game" moves were imported (main line and the PGN's own
 * variations) and are never modified by exploration; "explore" moves were played on the
 * board, picked from an engine line or from the opening explorer.
 */
export type MoveOrigin = "game" | "explore";

export interface MoveNode {
  id: NodeId;
  parentId: NodeId | null;
  /** children[0] is the main continuation of this node's line. */
  children: NodeId[];
  /**
   * Half-moves played since the initial position: 0 for the standard start, then one per
   * move. A game set up from a FEN starts at that position's ply, so move numbers and
   * colours stay right ("ply 2" is always Black's first move: "1... …").
   */
  ply: number;
  /** Position after the move (the starting position for the root). */
  fen: string;
  san: string | null;
  uci: string | null;
  origin: MoveOrigin;
  /** Comment printed before the move (PGN allows one at the start of a variation). */
  preComment?: string;
  comment?: string;
  nags?: number[];
  /** Remaining clock time in seconds, from a `[%clk]` comment command. */
  clock?: number;
}

export interface GameTree {
  rootId: NodeId;
  nodes: Record<NodeId, MoveNode>;
  /** Counter for node ids, so ids stay unique after deletions. */
  nextId: number;
}

/** Ply of a position from its FEN move number and side to move. */
export function plyOfFen(fen: string): number {
  const [, turn, , , , fullmove] = fen.split(" ");
  const moveNumber = Math.max(1, Number(fullmove) || 1);
  return (moveNumber - 1) * 2 + (turn === "b" ? 1 : 0);
}

export function createTree(startFen: string = START_FEN): GameTree {
  return {
    rootId: "0",
    nodes: {
      "0": {
        id: "0",
        parentId: null,
        children: [],
        ply: plyOfFen(startFen),
        fen: startFen,
        san: null,
        uci: null,
        origin: "game",
      },
    },
    nextId: 1,
  };
}

export function getNode(tree: GameTree, id: NodeId): MoveNode {
  const node = tree.nodes[id];
  if (!node) throw new Error(`Unknown move node ${id}`);
  return node;
}

export function hasNode(tree: GameTree, id: NodeId | null | undefined): id is NodeId {
  return id != null && id in tree.nodes;
}

export interface NewMove {
  san: string;
  uci: string;
  fen: string;
  origin: MoveOrigin;
  preComment?: string;
  comment?: string;
  nags?: number[];
  clock?: number;
}

/**
 * Adds `move` after `parentId` and returns the new tree with the id of the move's node.
 * Playing a move that already exists from that position reuses its node, so exploring a
 * line twice (or replaying the game's own move) does not create duplicates.
 */
export function addMove(
  tree: GameTree,
  parentId: NodeId,
  move: NewMove,
): { tree: GameTree; id: NodeId } {
  const parent = getNode(tree, parentId);
  const existing = parent.children.find((c) => tree.nodes[c]?.uci === move.uci);
  if (existing) return { tree, id: existing };

  const id = String(tree.nextId);
  const node: MoveNode = {
    id,
    parentId,
    children: [],
    ply: parent.ply + 1,
    fen: move.fen,
    san: move.san,
    uci: move.uci,
    origin: move.origin,
    ...(move.preComment ? { preComment: move.preComment } : {}),
    ...(move.comment ? { comment: move.comment } : {}),
    ...(move.nags?.length ? { nags: move.nags } : {}),
    ...(move.clock !== undefined ? { clock: move.clock } : {}),
  };
  return {
    tree: {
      ...tree,
      nextId: tree.nextId + 1,
      nodes: {
        ...tree.nodes,
        [parentId]: { ...parent, children: [...parent.children, id] },
        [id]: node,
      },
    },
    id,
  };
}

/** Replaces some annotation fields of a node (comment, NAGs). */
export function annotate(
  tree: GameTree,
  id: NodeId,
  patch: Partial<Pick<MoveNode, "comment" | "preComment" | "nags" | "clock">>,
): GameTree {
  const node = getNode(tree, id);
  return { ...tree, nodes: { ...tree.nodes, [id]: { ...node, ...patch } } };
}

/** The node's line from the root: [root, …, id]. */
export function pathTo(tree: GameTree, id: NodeId): MoveNode[] {
  const path: MoveNode[] = [];
  let node: MoveNode | undefined = getNode(tree, id);
  while (node) {
    path.push(node);
    node = node.parentId === null ? undefined : tree.nodes[node.parentId];
  }
  return path.reverse();
}

function firstGameChild(tree: GameTree, node: MoveNode): MoveNode | undefined {
  const id = node.children.find((c) => tree.nodes[c]?.origin === "game");
  return id === undefined ? undefined : tree.nodes[id];
}

/**
 * The imported game's main line, root included. It follows the first *game* child, so a
 * move explored after the game's last move never extends the main line.
 */
export function mainline(tree: GameTree): MoveNode[] {
  const line: MoveNode[] = [];
  for (let node: MoveNode | undefined = getNode(tree, tree.rootId); node;) {
    line.push(node);
    node = firstGameChild(tree, node);
  }
  return line;
}

export function mainlineIds(tree: GameTree): Set<NodeId> {
  return new Set(mainline(tree).map((n) => n.id));
}

export function isOnMainline(tree: GameTree, id: NodeId): boolean {
  return mainlineIds(tree).has(id);
}

/** The deepest main-line node on the path to `id`: where its variation branches off. */
export function mainlineAncestor(tree: GameTree, id: NodeId): NodeId {
  const main = mainlineIds(tree);
  const path = pathTo(tree, id);
  for (let i = path.length - 1; i >= 0; i--) {
    if (main.has(path[i]!.id)) return path[i]!.id;
  }
  return tree.rootId;
}

/** Next node along the current line (its main continuation), or null at a leaf. */
export function nextInLine(tree: GameTree, id: NodeId): NodeId | null {
  return getNode(tree, id).children[0] ?? null;
}

/** Last node of the line continuing from `id`. */
export function lineEnd(tree: GameTree, id: NodeId): NodeId {
  let current = id;
  for (let next = nextInLine(tree, current); next !== null; next = nextInLine(tree, current)) {
    current = next;
  }
  return current;
}

/** Siblings of `id` (alternatives to the same move), including itself. */
export function siblings(tree: GameTree, id: NodeId): NodeId[] {
  const node = getNode(tree, id);
  return node.parentId === null ? [id] : getNode(tree, node.parentId).children;
}

/**
 * Removes the subtree rooted at `id`. Game moves cannot be deleted, so an imported game
 * stays intact whatever is explored around it; `allowGameMoves` is only for games being
 * entered move by move on the board, where taking a move back is the point.
 */
export function deleteSubtree(
  tree: GameTree,
  id: NodeId,
  { allowGameMoves = false }: { allowGameMoves?: boolean } = {},
): GameTree {
  const node = getNode(tree, id);
  if (node.parentId === null || (node.origin === "game" && !allowGameMoves)) {
    throw new Error("Imported game moves cannot be deleted");
  }
  const nodes = { ...tree.nodes };
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    stack.push(...(nodes[current]?.children ?? []));
    delete nodes[current];
  }
  const parent = getNode(tree, node.parentId);
  nodes[parent.id] = { ...parent, children: parent.children.filter((c) => c !== id) };
  return { ...tree, nodes };
}

/** Removes every explored move, giving back the tree exactly as imported. */
export function withoutExplorations(tree: GameTree): GameTree {
  const nodes: Record<NodeId, MoveNode> = {};
  for (const node of Object.values(tree.nodes)) {
    if (node.origin !== "game") continue;
    nodes[node.id] = {
      ...node,
      children: node.children.filter((c) => tree.nodes[c]?.origin === "game"),
    };
  }
  return { ...tree, nodes };
}

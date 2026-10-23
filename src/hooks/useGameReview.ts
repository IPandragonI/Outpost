"use client";

import { useMemo } from "react";
import { useAnalysis } from "@/features/analysis/store";
import { rulesFor } from "@/features/classification/classification-rules";
import { useSettings } from "@/features/settings/settings-store";
import {
  reviewGame,
  type GameReview,
  type ReviewMove,
} from "@/features/classification/game-review";
import type { MoveClassification } from "@/features/classification/classify-move";
import { mainline, type NodeId } from "@/features/games/variation-tree";
import type { OpeningInfo } from "@/features/openings/opening-book";
import { positionKey } from "@/lib/chess/position";
import { useOpeningBook } from "./useOpeningBook";

export interface GameReviewState {
  review: GameReview | null;
  /** Classification of each main-line move, by the node id of the move. */
  byNode: Record<NodeId, MoveClassification>;
  /** Main-line node ids, root first, aligned with the review's positions. */
  nodeIds: NodeId[];
  opening: OpeningInfo | null;
  /** Index of the last main-line position found in the opening book. */
  lastBookIndex: number;
}

/** Classifies the main line from the whole-game analysis available so far. */
export function useGameReview(): GameReviewState {
  const tree = useAnalysis((s) => s.tree);
  const gamePositions = useAnalysis((s) => s.gamePositions);
  const sensitivity = useSettings((s) => s.sensitivity);
  const { book } = useOpeningBook();

  // Exploring variations changes the tree but not the main line: key the (costly) review
  // on the main line's nodes, which never change once created, so playing a move on the
  // board does not reclassify the whole game.
  const mainlineKey = mainline(tree)
    .map((n) => n.id)
    .join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the main line's ids
  const line = useMemo(() => mainline(tree), [mainlineKey]);

  const identified = useMemo(() => {
    if (!book) return { opening: null, lastBookIndex: -1 };
    const { opening, lastBookIndex } = book.identify(line.map((n) => n.fen));
    return { opening, lastBookIndex };
  }, [book, line]);

  return useMemo(() => {
    const nodeIds = line.map((n) => n.id);
    const positions = line.map((n) => gamePositions[positionKey(n.fen)] ?? null);
    if (!positions.some(Boolean)) {
      return { review: null, byNode: {}, nodeIds, ...identified };
    }
    const moves: ReviewMove[] = line.slice(1).map((node, i) => ({
      fenBefore: line[i]!.fen,
      uci: node.uci!,
      san: node.san!,
      ply: node.ply,
      // A move is "book" while the game is still in the dataset's lines.
      isBook: Boolean(book?.has(node.fen)) && i + 1 <= identified.lastBookIndex,
    }));
    const review = reviewGame(moves, positions, rulesFor(sensitivity));
    const byNode: Record<NodeId, MoveClassification> = {};
    for (const move of review.moves) {
      const nodeId = nodeIds[moves.findIndex((m) => m.ply === move.ply) + 1];
      if (nodeId) byNode[nodeId] = move.result;
    }
    return { review, byNode, nodeIds, ...identified };
  }, [line, gamePositions, book, identified, sensitivity]);
}

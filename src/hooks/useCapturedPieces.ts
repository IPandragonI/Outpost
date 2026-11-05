"use client";

import { useMemo } from "react";
import { useAnalysis } from "@/features/analysis/store";
import {
  capturedPieces,
  type CapturedPieces,
  type LineMove,
} from "@/features/analysis/captured-pieces";
import { pathTo } from "@/features/games/variation-tree";

/**
 * Pieces captured on the way to the position shown on the board: the moves from the
 * start to the selected node (so each variation has its own tally), continued by the
 * previewed engine line when one is shown. It follows the selection, not the game's end.
 */
export function useCapturedPieces(): CapturedPieces {
  const tree = useAnalysis((s) => s.tree);
  const currentId = useAnalysis((s) => s.currentId);
  const preview = useAnalysis((s) => s.preview);

  return useMemo(() => {
    const anchor = preview ? preview.fromId : currentId;
    const path = pathTo(tree, anchor);
    const moves: LineMove[] = [];
    for (let i = 1; i < path.length; i++) {
      moves.push({ fenBefore: path[i - 1]!.fen, uci: path[i]!.uci! });
    }
    if (preview) {
      for (let i = 0; i < preview.step; i++) {
        moves.push({ fenBefore: preview.fens[i]!, uci: preview.uci[i]! });
      }
    }
    return capturedPieces(moves);
  }, [tree, currentId, preview]);
}

import type { GameReview } from "@/features/classification/game-review";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import type { PgnHeaders } from "@/features/games/pgn";
import type { MoveNode } from "@/features/games/variation-tree";
import { positionKey } from "@/lib/chess/position";

export const ANALYSIS_EXPORT_FORMAT = "outpost-analysis/1";

/**
 * Analysis results as JSON, with what is needed to judge them later: engine name, search
 * limits and depth of each position. Scores are from White's point of view ("cp" in
 * centipawns, or "mate" with its winner).
 */
export function buildAnalysisExport(input: {
  title: string;
  headers: PgnHeaders;
  pgn: string;
  line: readonly MoveNode[];
  positions: Record<string, PositionAnalysis>;
  review: GameReview | null;
  presetId: string | null;
}) {
  const byPly = new Map(input.review?.moves.map((m) => [m.ply, m]) ?? []);
  return {
    format: ANALYSIS_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    title: input.title,
    headers: input.headers,
    pgn: input.pgn,
    preset: input.presetId,
    scorePointOfView: "white",
    summary: input.review
      ? {
          white: { precision: input.review.white.precision, counts: input.review.white.counts },
          black: { precision: input.review.black.precision, counts: input.review.black.counts },
          pendingMoves: input.review.pending,
        }
      : null,
    positions: input.line.map((node) => {
      const analysis = input.positions[positionKey(node.fen)] ?? null;
      const move = byPly.get(node.ply);
      return {
        ply: node.ply,
        san: node.san,
        uci: node.uci,
        fen: node.fen,
        analysis: analysis && {
          engine: analysis.engine,
          depth: analysis.depth,
          limits: analysis.limits,
          score: analysis.score,
          bestMove: analysis.bestMove,
          lines: analysis.lines,
        },
        classification:
          node.san && move?.san === node.san
            ? {
                label: move.result.classification,
                loss: move.result.loss,
                cpLoss: move.result.cpLoss,
                bestMove: move.result.bestMove,
                flags: move.result.flags,
              }
            : null,
      };
    }),
  };
}

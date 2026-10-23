"use client";

import { Chess, type Square } from "chess.js";
import { memo, useMemo, useState, type CSSProperties } from "react";
import { Chessboard, type Arrow, type PieceRenderObject } from "react-chessboard";
import type { Classification } from "@/features/classification/classification-rules";
import {
  ANIMATION_MS,
  boardColors,
  useSettings,
  type PieceSet,
} from "@/features/settings/settings-store";
import { ClassificationBadge } from "@/components/analysis/ClassificationBadge";
import { useT } from "@/lib/i18n/useT";

const PIECES = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"] as const;

function piecesFor(set: PieceSet): PieceRenderObject {
  return Object.fromEntries(
    PIECES.map((p) => [
      p,
      () => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/pieces/${set}/${p}.svg`}
          alt=""
          draggable={false}
          className="size-full select-none"
        />
      ),
    ]),
  );
}

export interface BoardMove {
  from: Square;
  to: Square;
  promotion?: "q" | "r" | "b" | "n";
}

export interface ChessBoardProps {
  fen: string;
  orientation: "white" | "black";
  lastMove?: { from: string; to: string } | null;
  arrows?: Arrow[];
  badge?: { square: string; classification: Classification } | null;
  /** Called with a legal move; omit to make the board read-only. */
  onMove?: (move: BoardMove) => void;
  id?: string;
}

function squareCorner(square: string, orientation: "white" | "black") {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const col = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;
  return { left: `${col * 12.5}%`, top: `${row * 12.5}%` };
}

/**
 * The interactive board: drag or tap a piece then a square. Only legal moves are
 * accepted (chess.js decides), promotions open a piece picker.
 */
function ChessBoardImpl({
  fen,
  orientation,
  lastMove,
  arrows = [],
  badge,
  onMove,
  id = "board",
}: ChessBoardProps) {
  const boardTheme = useSettings((s) => s.boardTheme);
  const customLight = useSettings((s) => s.customLight);
  const customDark = useSettings((s) => s.customDark);
  const animationSpeed = useSettings((s) => s.animationSpeed);
  const pieceSet = useSettings((s) => s.pieceSet);
  const showCoordinates = useSettings((s) => s.showCoordinates);
  const animations = useSettings((s) => s.animations);
  const [selected, setSelected] = useState<{ fen: string; square: Square } | null>(null);
  const [promotion, setPromotion] = useState<{ fen: string; from: Square; to: Square } | null>(
    null,
  );

  const chess = useMemo(() => new Chess(fen), [fen]);
  const t = useT();
  const colors = boardColors({ boardTheme, customLight, customDark });
  const pieces = useMemo(() => piecesFor(pieceSet), [pieceSet]);
  // Selections belong to the position they were made in.
  const activeSelection = selected?.fen === fen ? selected.square : null;
  const activePromotion = promotion?.fen === fen ? promotion : null;

  const targets = useMemo(() => {
    if (!activeSelection) return [];
    return chess.moves({ square: activeSelection, verbose: true });
  }, [chess, activeSelection]);

  const tryMove = (from: Square, to: Square): boolean => {
    if (!onMove) return false;
    const candidates = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!candidates.length) return false;
    if (candidates.some((m) => m.promotion)) {
      setPromotion({ fen, from, to });
      return false;
    }
    onMove({ from, to });
    setSelected(null);
    return true;
  };

  const onSquareClick = ({ square }: { square: string }) => {
    if (!onMove || activePromotion) return;
    const sq = square as Square;
    if (activeSelection && activeSelection !== sq && tryMove(activeSelection, sq)) return;
    const piece = chess.get(sq);
    if (piece && piece.color === chess.turn()) {
      setSelected(activeSelection === sq ? null : { fen, square: sq });
    } else {
      setSelected(null);
    }
  };

  const squareStyles: Record<string, CSSProperties> = {};
  const highlight = "rgba(217, 166, 80, 0.42)";
  if (lastMove) {
    squareStyles[lastMove.from] = { background: highlight };
    squareStyles[lastMove.to] = { background: highlight };
  }
  if (chess.inCheck()) {
    const king = chess
      .board()
      .flat()
      .find((c) => c?.type === "k" && c.color === chess.turn());
    if (king) {
      squareStyles[king.square] = {
        ...squareStyles[king.square],
        background:
          "radial-gradient(circle, rgba(240,70,70,0.85) 0%, rgba(240,70,70,0.35) 45%, transparent 75%)",
      };
    }
  }
  if (activeSelection) squareStyles[activeSelection] = { background: "rgba(79, 184, 168, 0.5)" };
  for (const move of targets) {
    squareStyles[move.to] = {
      ...squareStyles[move.to],
      backgroundImage: move.captured
        ? "radial-gradient(circle, transparent 58%, rgba(15,18,22,0.38) 60%)"
        : "radial-gradient(circle, rgba(15,18,22,0.32) 18%, transparent 20%)",
    };
  }

  return (
    <div
      className="relative aspect-square w-full touch-manipulation select-none"
      data-testid="chessboard"
    >
      <p className="sr-only" aria-live="polite">
        {chess.isCheckmate()
          ? t(chess.turn() === "w" ? "board.blackMates" : "board.whiteMates")
          : chess.isStalemate()
            ? t("board.stalemate")
            : t(
                chess.turn() === "w"
                  ? chess.inCheck()
                    ? "board.whiteToMoveCheck"
                    : "board.whiteToMove"
                  : chess.inCheck()
                    ? "board.blackToMoveCheck"
                    : "board.blackToMove",
              )}
      </p>
      <Chessboard
        options={{
          id,
          position: fen,
          boardOrientation: orientation,
          pieces,
          arrows,
          allowDrawingArrows: true,
          clearArrowsOnPositionChange: true,
          showNotation: showCoordinates,
          showAnimations: animations,
          animationDurationInMs: ANIMATION_MS[animationSpeed] ?? ANIMATION_MS.normal,
          allowDragging: Boolean(onMove),
          dragActivationDistance: 4,
          lightSquareStyle: { backgroundColor: colors.light },
          darkSquareStyle: { backgroundColor: colors.dark },
          lightSquareNotationStyle: { color: colors.dark, fontWeight: 600 },
          darkSquareNotationStyle: { color: colors.light, fontWeight: 600 },
          squareStyles,
          boardStyle: { borderRadius: "6px", overflow: "hidden" },
          dropSquareStyle: { boxShadow: "inset 0 0 0 3px rgba(217,166,80,0.8)" },
          canDragPiece: ({ piece }) => piece.pieceType[0] === chess.turn(),
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare ? tryMove(sourceSquare as Square, targetSquare as Square) : false,
          onSquareClick,
          onPieceClick: ({ square }) => {
            if (square) onSquareClick({ square });
          },
        }}
      />

      {badge && (
        <div
          className="pointer-events-none absolute flex size-[12.5%] items-start justify-end"
          style={squareCorner(badge.square, orientation)}
        >
          <ClassificationBadge
            classification={badge.classification}
            className="-mt-[18%] -mr-[18%] size-[42%] min-h-5 min-w-5 text-[clamp(9px,1.5vw,14px)] shadow-md"
          />
        </div>
      )}

      {activePromotion && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-base-200/70"
          role="dialog"
          aria-label={t("board.promotion")}
        >
          <div className="panel flex gap-1 p-2">
            {(["q", "r", "b", "n"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className="btn size-16 btn-ghost p-1"
                aria-label={t(`board.promoteTo.${p}`)}
                onClick={() => {
                  onMove?.({ from: activePromotion.from, to: activePromotion.to, promotion: p });
                  setPromotion(null);
                  setSelected(null);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/pieces/${pieceSet}/${chess.turn()}${p.toUpperCase()}.svg`}
                  alt=""
                  className="size-full"
                />
              </button>
            ))}
            <button
              type="button"
              className="btn self-center btn-ghost btn-sm"
              onClick={() => setPromotion(null)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Memoized: re-renders only when its props change, not on every engine update. */
export const ChessBoard = memo(ChessBoardImpl);

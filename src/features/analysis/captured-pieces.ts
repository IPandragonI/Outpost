import { PIECE_VALUES } from "@/lib/chess/position";

export type CapturablePiece = "p" | "n" | "b" | "r" | "q";

/** Highest value first, the order pieces are shown in. */
const ORDER: CapturablePiece[] = ["q", "r", "b", "n", "p"];

/** A move of a line: the position it is played in and the move itself. */
export interface LineMove {
  fenBefore: string;
  uci: string;
}

export interface CapturedPieces {
  /** Black pieces taken by White, most valuable first. */
  byWhite: CapturablePiece[];
  /** White pieces taken by Black, most valuable first. */
  byBlack: CapturablePiece[];
  /** Captured value of White minus captured value of Black, in pawns: > 0 favours White. */
  balance: number;
}

/** The piece on `square` (e.g. "e4") in a FEN, as the FEN letter, or null when empty. */
function pieceAt(fen: string, square: string): string | null {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const row = fen.split(" ")[0]?.split("/")[8 - rank];
  if (row === undefined || file < 0 || file > 7) return null;
  let col = 0;
  for (const ch of row) {
    if (ch >= "1" && ch <= "8") {
      col += Number(ch);
      if (col > file) return null;
    } else {
      if (col === file) return ch;
      col++;
    }
  }
  return null;
}

function valueOf(pieces: readonly CapturablePiece[]): number {
  return pieces.reduce((sum, p) => sum + (PIECE_VALUES[p] ?? 0), 0);
}

const byValue = (a: CapturablePiece, b: CapturablePiece) => ORDER.indexOf(a) - ORDER.indexOf(b);

/**
 * Pieces captured along a line of moves, from the position it starts in. Computed from the
 * moves themselves rather than from the material on the board, so promotions (a pawn that
 * becomes a queen) do not count as captures, and a capture is a capture even if the
 * capturing piece is itself taken later.
 *
 * Captures are found from the position before each move: a piece on the target square, or
 * a pawn moving diagonally onto an empty square (en passant). Kings are never counted.
 */
export function capturedPieces(moves: readonly LineMove[]): CapturedPieces {
  const byWhite: CapturablePiece[] = [];
  const byBlack: CapturablePiece[] = [];
  for (const { fenBefore, uci } of moves) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const mover = pieceAt(fenBefore, from);
    if (!mover) continue;
    const whiteMoves = mover === mover.toUpperCase();
    let taken = pieceAt(fenBefore, to);
    if (!taken && mover.toLowerCase() === "p" && from[0] !== to[0]) taken = whiteMoves ? "p" : "P";
    if (!taken) continue;
    const type = taken.toLowerCase();
    if (type === "k" || !(type in PIECE_VALUES)) continue;
    // Own pieces are never captured (castling written king-takes-rook, for instance).
    if ((taken === taken.toUpperCase()) === whiteMoves) continue;
    (whiteMoves ? byWhite : byBlack).push(type as CapturablePiece);
  }
  byWhite.sort(byValue);
  byBlack.sort(byValue);
  return { byWhite, byBlack, balance: valueOf(byWhite) - valueOf(byBlack) };
}

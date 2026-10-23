import { Chess, type Move, type Square } from "chess.js";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type Color = "w" | "b";

/**
 * Identifies a position independently of the move order that reached it: piece placement,
 * side to move, castling rights and en passant square, without the move counters.
 *
 * chess.js only writes the en passant square when an en passant capture is actually legal,
 * so two positions that differ only by an unusable en passant square share a key. The
 * fifty-move counter is deliberately ignored: it changes the evaluation only in rare
 * endgames, and keeping it would defeat transposition matching.
 */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

export function sideToMove(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** Full move number of a ply index (ply 1 = White's first move). */
export function moveNumberOfPly(ply: number): number {
  return Math.ceil(ply / 2);
}

export function uciOf(move: Pick<Move, "from" | "to" | "promotion">): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function parseUci(uci: string): { from: Square; to: Square; promotion?: string } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

/** Plays a UCI move on `fen`; null when it is illegal there. */
export function playUci(fen: string, uci: string): Move | null {
  try {
    return new Chess(fen).move(parseUci(uci));
  } catch {
    return null;
  }
}

/** Plays a SAN move on `fen`; null when it is illegal or ambiguous there. */
export function playSan(fen: string, san: string): Move | null {
  try {
    return new Chess(fen).move(san);
  } catch {
    return null;
  }
}

/**
 * Converts a UCI line (as Stockfish prints its principal variation) to SAN, stopping at
 * the first move that is not legal, which can happen with truncated or stale output.
 */
export function uciLineToSan(fen: string, uciMoves: readonly string[]): string[] {
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of uciMoves) {
    try {
      san.push(chess.move(parseUci(uci)).san);
    } catch {
      break;
    }
  }
  return san;
}

export type GameEnd =
  | { kind: "checkmate"; winner: Color }
  | { kind: "stalemate" }
  | { kind: "insufficient-material" }
  | { kind: "threefold-repetition" }
  | { kind: "fifty-move-rule" };

/**
 * Terminal state of a position by the rules alone. Threefold repetition needs the move
 * history, so it is only reported when `history` (earlier position keys) is given.
 */
export function gameEndOf(fen: string, history?: readonly string[]): GameEnd | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { kind: "checkmate", winner: chess.turn() === "w" ? "b" : "w" };
  if (chess.isStalemate()) return { kind: "stalemate" };
  if (chess.isInsufficientMaterial()) return { kind: "insufficient-material" };
  if (history) {
    const key = positionKey(fen);
    if (history.filter((k) => k === key).length >= 2) return { kind: "threefold-repetition" };
  }
  if (Number(fen.split(" ")[4] ?? 0) >= 100) return { kind: "fifty-move-rule" };
  return null;
}

/**
 * Whether `fen` is a position that can be analyzed. Beyond chess.js's syntax checks: one
 * king per side, and the side that just moved not left in check — Stockfish refuses such
 * positions ("king can be captured") and stops.
 */
export function isValidFen(fen: string): boolean {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return false;
  }
  const kings = chess
    .board()
    .flat()
    .filter((c) => c?.type === "k");
  if (kings.filter((k) => k!.color === "w").length !== 1) return false;
  if (kings.filter((k) => k!.color === "b").length !== 1) return false;
  const waiting = chess.turn() === "w" ? "b" : "w";
  const king = kings.find((k) => k!.color === waiting)!;
  return !chess.isAttacked(king.square, chess.turn());
}

export const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Material of `color` in pawn units. */
export function materialOf(fen: string, color: Color): number {
  const placement = fen.split(" ")[0] ?? "";
  let total = 0;
  for (const ch of placement) {
    const lower = ch.toLowerCase();
    if (!(lower in PIECE_VALUES)) continue;
    const isWhite = ch !== lower;
    if ((color === "w") === isWhite) total += PIECE_VALUES[lower] ?? 0;
  }
  return total;
}

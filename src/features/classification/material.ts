import { Chess, type Move, type Square } from "chess.js";
import { PIECE_VALUES, type Color } from "@/lib/chess/position";

const KING_VALUE = 100;

function value(piece: string): number {
  return piece === "k" ? KING_VALUE : (PIECE_VALUES[piece] ?? 0);
}

function capturesOn(chess: Chess, square: Square): Move[] {
  return chess
    .moves({ verbose: true })
    .filter((m) => m.to === square && (m.captured !== undefined || m.isEnPassant()));
}

/**
 * Static exchange evaluation of `capture` (a legal capture in `fen`): the material the
 * capturing side wins, in pawns, when both sides keep recapturing on that square with
 * their least valuable piece and either may stop when continuing would lose material.
 *
 * Recaptures are generated as legal moves, so pins, checks and x-ray attackers (a rook
 * behind a rook) are taken into account.
 */
export function staticExchange(fen: string, capture: Move): number {
  const chess = new Chess(fen);
  const square = capture.to;
  const gains: number[] = [value(capture.captured ?? "p")];
  let onSquare = value(capture.promotion ?? capture.piece);
  if (capture.promotion) gains[0]! += value(capture.promotion) - 1;
  chess.move(capture);

  for (let depth = 1; depth < 32; depth++) {
    const recaptures = capturesOn(chess, square);
    if (!recaptures.length) break;
    const cheapest = recaptures.reduce((a, b) => (value(a.piece) <= value(b.piece) ? a : b));
    gains.push(onSquare - gains[depth - 1]!);
    onSquare = value(cheapest.promotion ?? cheapest.piece);
    chess.move(cheapest);
  }
  // Each side may decline to continue the exchange.
  for (let d = gains.length - 1; d > 0; d--) {
    gains[d - 1] = -Math.max(-gains[d - 1]!, gains[d]!);
  }
  return gains[0]!;
}

export interface Sacrifice {
  /** Net material the mover gives up, in pawns (what can be won back minus what the move took). */
  amount: number;
  /** Square of the piece that can be taken. */
  square: Square;
  piece: string;
}

/**
 * Material a move leaves for the taking. After `move` (played in `fenBefore`), every
 * legal capture of one of the mover's pieces (not pawns) is evaluated by exchange; the
 * best one for the opponent, minus what the move itself captured, is the sacrifice.
 * Returns null when the move gives nothing away.
 */
export function sacrificeOf(fenBefore: string, move: Move): Sacrifice | null {
  const after = new Chess(fenBefore);
  after.move(move);
  const mover: Color = move.color;
  const taken = move.captured ? value(move.captured) : 0;
  let best: Sacrifice | null = null;
  for (const capture of after.moves({ verbose: true })) {
    if (!capture.captured || capture.captured === "p" || capture.captured === "k") continue;
    const target = after.get(capture.to);
    if (!target || target.color !== mover) continue;
    const won = staticExchange(after.fen(), capture) - taken;
    if (won > 0 && (!best || won > best.amount)) {
      best = { amount: won, square: capture.to, piece: capture.captured };
    }
  }
  return best;
}

/**
 * Whether `move` simply wins material that was there for the taking (a capture the
 * exchange rules say gains material, or recapturing on the square the opponent just
 * captured on). Such moves are often the only good move, but they are not hard to find.
 */
export function isObviousCapture(
  fenBefore: string,
  move: Move,
  previousMove?: Pick<Move, "to" | "captured"> | null,
): boolean {
  if (!move.captured && !move.isEnPassant()) return false;
  if (previousMove?.captured && previousMove.to === move.to) return true;
  return staticExchange(fenBefore, move) > 0;
}

/** Material balance (mover's minus opponent's), in pawns. */
export function materialBalance(fen: string, color: Color): number {
  const board = new Chess(fen).board();
  let balance = 0;
  for (const row of board) {
    for (const cell of row) {
      if (!cell || cell.type === "k") continue;
      balance += (cell.color === color ? 1 : -1) * (PIECE_VALUES[cell.type] ?? 0);
    }
  }
  return balance;
}

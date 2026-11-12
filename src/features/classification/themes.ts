import { Chess, type Square } from "chess.js";
import { parseUci } from "@/lib/chess/position";
import { isError } from "./classification-rules";
import type { MoveClassification } from "./classify-move";
import type { GameReview } from "./game-review";
import { sacrificeOf, staticExchange } from "./material";

/** Recurring kinds of mistake, named so the player can see what keeps going wrong. */
export type Theme =
  | "hanging"
  | "missed-capture"
  | "allowed-fork"
  | "missed-fork"
  | "threw-advantage"
  | "allowed-mate"
  | "missed-mate";

export interface ThemeHit {
  theme: Theme;
  /** Piece letter (p, n, b, r, q) involved, when the theme is about a piece. */
  piece?: string;
  square?: string;
  /** The move that carries the theme (the fork, the missed capture), in SAN. */
  san?: string;
}

/**
 * How many pieces worth winning the moved piece attacks after `uci`, counting a check as
 * one. Two or more is a fork. Attacks are the piece's own captures with a positive
 * exchange balance, found by handing the move back to the side that just moved.
 */
function forkTargets(fen: string, uci: string): { san: string; targets: number } | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move(parseUci(uci));
    let targets = chess.isCheck() ? 1 : 0;
    const parts = chess.fen().split(" ");
    parts[1] = parts[1] === "w" ? "b" : "w";
    parts[3] = "-";
    const flipped = parts.join(" ");
    const again = new Chess(flipped);
    for (const capture of again.moves({ square: move.to as Square, verbose: true })) {
      if (!capture.captured || capture.captured === "k") continue;
      if (staticExchange(flipped, capture) > 0) targets++;
    }
    return { san: move.san, targets };
  } catch {
    return null;
  }
}

/**
 * The tactical or strategic theme behind a bad move, from the engine's lines only: a piece
 * left to be taken, a capture or fork that was missed or allowed, mate missed or allowed,
 * a winning position given away. Empty for good moves. Pure, like the classification.
 */
export function moveThemes(
  result: MoveClassification,
  fenBefore: string,
  playedUci: string,
): ThemeHit[] {
  if (!isError(result.classification) && result.classification !== "inaccuracy") return [];
  if (result.isBestMove) return [];
  const hits: ThemeHit[] = [];

  if (result.flags.includes("allows-mate")) hits.push({ theme: "allowed-mate" });
  if (result.flags.includes("missed-mate")) hits.push({ theme: "missed-mate" });

  try {
    const chess = new Chess(fenBefore);
    const played = chess.move(parseUci(playedUci));
    const reply = result.replyLine[0];

    // A piece left to be taken: the best capture of one of the mover's pieces wins material
    // and the engine's reply is that capture.
    const hung = sacrificeOf(fenBefore, played);
    if (hung && (hung.amount >= 3 || reply?.slice(2, 4) === hung.square)) {
      hits.push({ theme: "hanging", piece: hung.piece, square: hung.square });
    }

    // A capture that wins material was available and was not played.
    const best = result.bestMove;
    if (best && best !== playedUci) {
      const bestMove = new Chess(fenBefore).move(parseUci(best));
      if (bestMove.captured && staticExchange(fenBefore, bestMove) >= 1) {
        hits.push({
          theme: "missed-capture",
          piece: bestMove.captured,
          square: bestMove.to,
          san: bestMove.san,
        });
      }
    }

    if (reply) {
      const fork = forkTargets(chess.fen(), reply);
      if (fork && fork.targets >= 2) hits.push({ theme: "allowed-fork", san: fork.san });
    }
    if (best && best !== playedUci) {
      const fork = forkTargets(fenBefore, best);
      if (fork && fork.targets >= 2) hits.push({ theme: "missed-fork", san: fork.san });
    }
  } catch {
    // An unreadable line only means fewer themes.
  }

  if (
    result.chanceBest >= 0.7 &&
    result.chancePlayed < 0.55 &&
    !hits.some((h) => h.theme === "allowed-mate")
  ) {
    hits.push({ theme: "threw-advantage" });
  }
  return hits;
}

/** How often each theme occurred in a game, for each player. */
export function themeSummary(
  review: GameReview,
): Record<"w" | "b", Partial<Record<Theme, number>>> {
  const out: Record<"w" | "b", Partial<Record<Theme, number>>> = { w: {}, b: {} };
  for (const move of review.moves) {
    for (const hit of moveThemes(move.result, move.fenBefore, move.uci)) {
      const counts = out[move.result.mover];
      counts[hit.theme] = (counts[hit.theme] ?? 0) + 1;
    }
  }
  return out;
}

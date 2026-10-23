import { Chess } from "chess.js";
import { positionKey, uciOf } from "@/lib/chess/position";
import type { OpeningBookFile } from "./book-format";

export interface OpeningInfo {
  eco: string;
  /** Full name, e.g. "Sicilian Defense: Najdorf Variation". */
  name: string;
  /** Family ("Sicilian Defense") and variation ("Najdorf Variation"), split at the colon. */
  family: string;
  variation: string | null;
  /** The named line, in SAN separated by spaces. */
  moves: string;
}

export interface BookMove {
  san: string;
  uci: string;
  fen: string;
  /** Named lines of the dataset that continue with this move: depth of theory, not popularity. */
  lines: number;
  /** Name of the position this move reaches, or of the main named line it leads into. */
  opening: OpeningInfo | null;
  /** Whether `opening` is named at the reached position itself (false: further down the line). */
  namedHere: boolean;
}

export interface BookPosition {
  /** Names given to this exact position (several when lines transpose into it). */
  openings: OpeningInfo[];
  moves: BookMove[];
}

export function toOpeningInfo(entry: [string, string, string]): OpeningInfo {
  const [eco, name, moves] = entry;
  const colon = name.indexOf(":");
  return {
    eco,
    name,
    family: colon === -1 ? name : name.slice(0, colon).trim(),
    variation: colon === -1 ? null : name.slice(colon + 1).trim(),
    moves,
  };
}

/** Queries over the generated opening book. Pure: no fetching, no caching. */
export class OpeningBook {
  constructor(readonly data: OpeningBookFile) {}

  get size(): number {
    return this.data.openings.length;
  }

  has(fen: string): boolean {
    return positionKey(fen) in this.data.positions;
  }

  /** Opening names of this exact position. */
  namesAt(fen: string): OpeningInfo[] {
    const entry = this.data.positions[positionKey(fen)];
    return (entry?.o ?? []).map((i) => toOpeningInfo(this.data.openings[i]!));
  }

  /**
   * The most specific name for a position: its own, or, for an unnamed book position on
   * the way to named lines, the name of the line most of the theory continues into.
   */
  private nameAlongLine(
    fen: string,
    maxPlies = 12,
  ): { opening: OpeningInfo | null; here: boolean } {
    const here = this.namesAt(fen)[0];
    if (here) return { opening: here, here: true };
    let chess = new Chess(fen);
    for (let i = 0; i < maxPlies; i++) {
      const entry = this.data.positions[positionKey(chess.fen())];
      const top = entry?.m?.[0];
      if (!top) break;
      const next = new Chess(chess.fen());
      next.move(top[0]);
      chess = next;
      const name = this.namesAt(chess.fen())[0];
      if (name) return { opening: name, here: false };
    }
    return { opening: null, here: false };
  }

  lookup(fen: string): BookPosition | null {
    const entry = this.data.positions[positionKey(fen)];
    if (!entry) return null;
    const moves: BookMove[] = [];
    for (const [san, lines] of entry.m ?? []) {
      const chess = new Chess(fen);
      let move;
      try {
        move = chess.move(san);
      } catch {
        continue;
      }
      const after = chess.fen();
      const { opening, here } = this.nameAlongLine(after);
      moves.push({ san: move.san, uci: uciOf(move), fen: after, lines, opening, namedHere: here });
    }
    return { openings: this.namesAt(fen), moves };
  }

  /**
   * The main theoretical continuation from `fen`: following, at each position, the move
   * with the most named lines after it. UCI moves, at most `maxPlies`.
   */
  mainContinuation(fen: string, maxPlies = 10): string[] {
    const chess = new Chess(fen);
    const line: string[] = [];
    for (let i = 0; i < maxPlies; i++) {
      const top = this.data.positions[positionKey(chess.fen())]?.m?.[0];
      if (!top) break;
      try {
        line.push(uciOf(chess.move(top[0])));
      } catch {
        break;
      }
    }
    return line;
  }

  /**
   * Opening of a game, from its successive positions (the start position first). The
   * deepest named position wins, matched by position rather than move order, so a game
   * that leaves the named lines and transposes back into one is recognized. Only the
   * first `maxPlies` positions are looked at: the dataset's lines are shorter than that,
   * and an exact match deep in the middlegame would not be the game's opening.
   */
  identify(
    fens: readonly string[],
    maxPlies = 40,
  ): {
    opening: OpeningInfo | null;
    /** Index in `fens` of the position that gave the name. */
    namedIndex: number;
    /** Index in `fens` of the last position found in the book. */
    lastBookIndex: number;
  } {
    let opening: OpeningInfo | null = null;
    let namedIndex = -1;
    let lastBookIndex = -1;
    for (let i = 0; i < Math.min(fens.length, maxPlies + 1); i++) {
      const fen = fens[i]!;
      if (!this.has(fen)) continue;
      lastBookIndex = i;
      const name = this.namesAt(fen)[0];
      if (name) {
        opening = name;
        namedIndex = i;
      }
    }
    return { opening, namedIndex, lastBookIndex };
  }
}

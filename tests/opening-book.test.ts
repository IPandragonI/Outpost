import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { OpeningBookFile } from "@/features/openings/book-format";
import { OpeningBook } from "@/features/openings/opening-book";
import { START_FEN } from "@/lib/chess/position";

const book = new OpeningBook(
  JSON.parse(readFileSync("public/data/openings-v1.json", "utf-8")) as OpeningBookFile,
);

function fensOf(sans: string): string[] {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of sans.split(" ")) {
    chess.move(san);
    fens.push(chess.fen());
  }
  return fens;
}

describe("opening book", () => {
  it("contains the whole dataset", () => {
    expect(book.size).toBeGreaterThan(3000);
    expect(book.data.license).toBe("CC0-1.0");
  });

  it("names a position and splits family and variation", () => {
    const fens = fensOf("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6");
    const { opening, namedIndex, lastBookIndex } = book.identify(fens);
    expect(opening?.eco).toBe("B90");
    expect(opening?.family).toBe("Sicilian Defense");
    expect(opening?.variation).toBe("Najdorf Variation");
    expect(namedIndex).toBe(10);
    expect(lastBookIndex).toBe(10);
  });

  it("recognizes transpositions by position, not move order", () => {
    // Queen's Gambit Declined reached through 1. Nf3 instead of 1. d4.
    const direct = book.identify(fensOf("d4 d5 c4 e6 Nc3 Nf6 Nf3")).opening;
    const transposed = book.identify(fensOf("Nf3 Nf6 c4 e6 Nc3 d5 d4")).opening;
    expect(direct?.family).toBe("Queen's Gambit Declined");
    expect(transposed?.name).toBe(direct?.name);
  });

  it("reports the last position found in the book", () => {
    const { opening, lastBookIndex } = book.identify(fensOf("e4 e5 Ke2 Ke7 Qe1"));
    // 1. e4 e5 2. Ke2 is the Bongcloud: still named; 2... Ke7 and later are not theory.
    expect(lastBookIndex).toBe(3);
    expect(opening?.name).toMatch(/Bongcloud/);
  });

  it("lists theoretical continuations with legal moves only", () => {
    const position = book.lookup(START_FEN)!;
    const sans = position.moves.map((m) => m.san);
    expect(sans.slice(0, 4)).toEqual(expect.arrayContaining(["e4", "d4"]));
    for (const move of position.moves) {
      expect(new Chess(START_FEN).move(move.san).san).toBe(move.san);
      expect(move.lines).toBeGreaterThan(0);
    }
    const e4 = position.moves.find((m) => m.san === "e4")!;
    expect(e4.opening?.name).toBe("King's Pawn Game");
    expect(e4.namedHere).toBe(true);
    // No statistics that the dataset does not have.
    expect(Object.keys(e4)).not.toContain("games");
  });

  it("returns null outside the book", () => {
    const chess = new Chess("4k3/8/8/8/8/8/8/4K2R w K - 0 1");
    expect(book.lookup(chess.fen())).toBeNull();
  });
});

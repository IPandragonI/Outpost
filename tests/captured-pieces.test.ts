import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { capturedPieces, type LineMove } from "@/features/analysis/captured-pieces";
import { START_FEN, uciOf } from "@/lib/chess/position";

/** Plays SAN moves from a position and returns them as line moves. */
function line(sans: string[], fen = START_FEN): LineMove[] {
  const chess = new Chess(fen);
  return sans.map((san) => {
    const fenBefore = chess.fen();
    return { fenBefore, uci: uciOf(chess.move(san)) };
  });
}

describe("capturedPieces", () => {
  it("is empty at the start", () => {
    expect(capturedPieces([])).toEqual({ byWhite: [], byBlack: [], balance: 0 });
  });

  it("records ordinary captures for the right side", () => {
    const result = capturedPieces(line(["e4", "d5", "exd5", "Qxd5", "Nc3", "Qxg2"]));
    expect(result.byWhite).toEqual(["p"]);
    expect(result.byBlack).toEqual(["p", "p"]);
    expect(result.balance).toBe(-1);
  });

  it("counts en passant as a pawn", () => {
    const result = capturedPieces(line(["e4", "a6", "e5", "d5", "exd6"]));
    expect(result.byWhite).toEqual(["p"]);
    expect(result.byBlack).toEqual([]);
    expect(result.balance).toBe(1);
  });

  it("does not count a plain promotion, but counts a capturing one", () => {
    const quiet = capturedPieces(line(["a8=Q"], "7k/P7/8/8/8/8/8/K7 w - - 0 1"));
    expect(quiet).toEqual({ byWhite: [], byBlack: [], balance: 0 });

    const capture = capturedPieces(line(["axb8=Q+"], "1r5k/P7/8/8/8/8/8/K7 w - - 0 1"));
    expect(capture.byWhite).toEqual(["r"]);
    expect(capture.balance).toBe(5);
  });

  it("keeps a capture even when the capturing piece is lost later", () => {
    const result = capturedPieces(line(["e4", "d5", "exd5", "Qxd5", "Nc3", "Qxg2", "Nf3", "Qxh1"]));
    expect(result.byBlack).toEqual(["r", "p", "p"]);
  });

  it("gives White +2 for a rook against a bishop", () => {
    const fen = "r3k3/8/8/8/8/8/6b1/R3K2B w - - 0 1";
    const result = capturedPieces(line(["Rxa8+", "Kd7", "Kd1", "Bxh1"], fen));
    expect(result.byWhite).toEqual(["r"]);
    expect(result.byBlack).toEqual(["b"]);
    expect(result.balance).toBe(2);
  });

  it("gives Black +4 for a queen against a rook", () => {
    const result = capturedPieces(line(["Qxa8", "Qxa8"], "r2qk3/8/8/8/8/8/8/Q3K3 w - - 0 1"));
    expect(result.byWhite).toEqual(["r"]);
    expect(result.byBlack).toEqual(["q"]);
    expect(result.balance).toBe(-4);
  });

  it("sorts captured pieces by value", () => {
    // The pawn is taken first, then the queen: shown queen first.
    const fen = "4k3/8/8/q7/p7/8/8/R5K1 w - - 0 1";
    const result = capturedPieces(line(["Rxa4", "Kd7", "Rxa5"], fen));
    expect(result.byWhite).toEqual(["q", "p"]);
    expect(result.balance).toBe(10);
  });

  it("never counts kings and ignores castling", () => {
    const result = capturedPieces(
      line(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6", "d3", "O-O"]),
    );
    expect(result).toEqual({ byWhite: [], byBlack: [], balance: 0 });
  });
});

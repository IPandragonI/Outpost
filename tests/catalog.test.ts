import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { CATALOG, ECO_FAMILIES, ecoFamily, searchCatalog } from "@/features/openings/catalog";
import type { OpeningBookFile } from "@/features/openings/book-format";
import { OpeningBook } from "@/features/openings/opening-book";

const book = new OpeningBook(
  JSON.parse(readFileSync("public/data/openings-v1.json", "utf-8")) as OpeningBookFile,
);

describe("openings catalogue", () => {
  it("has both sides, unique ids and both languages", () => {
    expect(new Set(CATALOG.map((o) => o.id)).size).toBe(CATALOG.length);
    expect(CATALOG.filter((o) => o.side === "white").length).toBeGreaterThanOrEqual(6);
    expect(CATALOG.filter((o) => o.side === "black").length).toBeGreaterThanOrEqual(6);
    for (const o of CATALOG) {
      for (const text of [o.name, o.summary, ...o.lines.flatMap((x) => [x.name, x.note])]) {
        expect(text.fr.trim(), o.id).not.toBe("");
        expect(text.en.trim(), o.id).not.toBe("");
      }
    }
  });

  it("uses legal lines that share the opening's defining moves", () => {
    for (const o of CATALOG) {
      const key = o.lines[0]!.moves.slice(0, o.keyPlies).join(" ");
      for (const line of o.lines) {
        const chess = new Chess();
        for (const san of line.moves) {
          expect(() => chess.move(san), `${o.id}: ${line.name.en}: ${san}`).not.toThrow();
        }
        expect(line.moves.slice(0, o.keyPlies).join(" "), `${o.id}: ${line.name.en}`).toBe(key);
      }
    }
  });

  it("follows theory: every line stays in the opening dataset for most of its length", () => {
    const weak: string[] = [];
    for (const o of CATALOG) {
      for (const line of o.lines) {
        const chess = new Chess();
        const fens = [chess.fen()];
        for (const san of line.moves) {
          chess.move(san);
          fens.push(chess.fen());
        }
        const inBook = fens.filter((f) => book.has(f)).length;
        // A system (London) is a set-up, not a tree of named lines: only its start is
        // named in the dataset. Its defining position must still be there.
        const enough = o.system ? book.has(fens[o.keyPlies]!) : inBook / fens.length >= 0.6;
        if (!enough || !book.identify(fens).opening) {
          weak.push(`${o.id}: ${line.name.en} (${inBook}/${fens.length})`);
        }
      }
    }
    expect(weak).toEqual([]);
  });

  it("files every opening under one ECO family", () => {
    const families = new Set(ECO_FAMILIES.map((f) => f.id));
    for (const o of CATALOG) expect(families.has(ecoFamily(o)), o.id).toBe(true);
  });

  it("searches names in both languages, line names and ECO codes, ignoring accents", () => {
    const ids = (q: string) => searchCatalog(q).map((o) => o.id);
    expect(ids("grunfeld")).toEqual(["grunfeld"]);
    expect(ids("najdorf")).toEqual(["sicilian"]);
    expect(ids("B01")).toEqual(["scandinavian"]);
    expect(ids("défense française")).toContain("french");
    expect(ids("  ")).toHaveLength(CATALOG.length);
  });
});

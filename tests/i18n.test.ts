import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLASSIFICATIONS } from "@/features/classification/classification-rules";
import { explainMove } from "@/features/classification/explain";
import { classifyMove } from "@/features/classification/classify-move";
import { cp, mate } from "@/features/engine/evaluation";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import { parsePgn } from "@/features/games/pgn";
import { DEFAULT_SETTINGS } from "@/features/settings/settings-store";
import { MESSAGES, type MessageKey } from "@/lib/i18n/messages";
import { translate, translator } from "@/lib/i18n/translate";
import { START_FEN } from "@/lib/chess/position";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("i18n", () => {
  it("is French by default", () => {
    expect(DEFAULT_SETTINGS.locale).toBe("fr");
  });

  it("has the same keys and placeholders in French and English", () => {
    const keys = Object.keys(MESSAGES.en) as MessageKey[];
    expect(Object.keys(MESSAGES.fr).sort()).toEqual([...keys].sort());
    const placeholders = (s: string) =>
      [...new Set([...s.matchAll(/\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]))].sort();
    for (const key of keys) {
      expect(placeholders(MESSAGES.fr[key]), key).toEqual(placeholders(MESSAGES.en[key]));
      expect(MESSAGES.fr[key].trim(), key).not.toBe("");
    }
  });

  it("defines every key the code uses literally", () => {
    const used = new Set<string>();
    for (const file of sourceFiles("src")) {
      for (const match of readFileSync(file, "utf-8").matchAll(/\bt\(\s*"([\w.-]+)"/g)) {
        used.add(match[1]!);
      }
    }
    const missing = [...used].filter((k) => !(k in MESSAGES.en));
    expect(missing).toEqual([]);
  });

  it("defines the keys built from classification names", () => {
    for (const c of CLASSIFICATIONS) {
      for (const key of [`cls.${c}`, `cls.${c}.desc`, `explain.headline.${c}`]) {
        expect(MESSAGES.en, key).toHaveProperty([key]);
      }
    }
  });

  it("fills placeholders and plural forms", () => {
    expect(translate("en", "import.imported", { n: 1 })).toBe("1 game imported.");
    expect(translate("en", "import.imported", { n: 3 })).toBe("3 games imported.");
    expect(translate("fr", "import.imported", { n: 1 })).toBe("1 partie importée.");
    expect(translate("fr", "import.imported", { n: 0 })).toBe("0 partie importée.");
    expect(translate("fr", "import.imported", { n: 2 })).toBe("2 parties importées.");
    expect(translate("en", "import.imported", { n: 0 })).toBe("0 games imported.");
  });

  it("explains moves in the chosen language", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
    const after = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
    const analysis = (f: string, lines: [string, ReturnType<typeof cp>][]): PositionAnalysis => ({
      fen: f,
      lines: lines.map(([uci, score], i) => ({
        multipv: i + 1,
        score,
        depth: 20,
        pv: [uci, "f3f7"],
      })),
      score: lines[0]![1],
      bestMove: lines[0]![0],
      depth: 20,
      timeMs: 0,
      limits: { depth: 20, multiPv: lines.length },
      engine: "test",
      complete: true,
    });
    const result = classifyMove({
      fenBefore: fen,
      uci: "g8f6",
      before: analysis(fen, [
        ["d8e7", cp(10)],
        ["g8f6", mate(1, "w")],
      ]),
      after: analysis(after, [["f3f7", mate(1, "w")]]),
      isBook: false,
    });
    const fr = explainMove(translator("fr"), result, fen, "g8f6");
    const en = explainMove(translator("en"), result, fen, "g8f6");
    expect(fr.headline).toBe("Nf6 est une gaffe.");
    expect(en.headline).toBe("Nf6 is a blunder.");
    expect(fr.details[0]).toContain("Il permet un mat en 1");
    expect(en.details[0]).toContain("It allows mate in 1");
  });

  it("gives PGN errors a code the interface can translate", () => {
    const error = parsePgn('[Event "x"]\n\n1. e4 e5 2. Ke3 *').errors[0]!;
    expect(error.code).toBe("illegalMove");
    expect(translate("fr", `pgnError.${error.code}`, error.vars)).toBe("Coup illégal 2. Ke3.");
    expect(parsePgn("").errors[0]!.code).toBe("empty");
    expect(START_FEN).toBeTruthy();
  });
});

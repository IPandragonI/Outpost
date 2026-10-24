import { describe, expect, it } from "vitest";
import { catalogOpening } from "@/features/openings/catalog";
import {
  BOX_INTERVALS,
  MASTERED_BOX,
  catalogDrillLines,
  isTraineeMove,
  lineStatus,
  pickNextLine,
  recordAttempt,
  repertoireDrillLines,
  siblingLines,
  summarize,
  type DrillProgress,
} from "@/features/openings/drill";
import { addLine, emptyRepertoire } from "@/features/openings/repertoire";

const NOW = 1_700_000_000_000;
const italian = catalogDrillLines(catalogOpening("italian")!);
const sicilian = catalogDrillLines(catalogOpening("sicilian")!);

describe("drill lines", () => {
  it("turns catalogue lines into UCI moves for the opening's side", () => {
    expect(italian[0]!.color).toBe("w");
    expect(italian[0]!.moves.slice(0, 3)).toEqual([
      { san: "e4", uci: "e2e4" },
      { san: "e5", uci: "e7e5" },
      { san: "Nf3", uci: "g1f3" },
    ]);
    expect(new Set(italian.map((l) => l.id)).size).toBe(italian.length);
    expect(sicilian[0]!.color).toBe("b");
  });

  it("knows whose move it is", () => {
    expect(isTraineeMove(italian[0]!, 0)).toBe(true);
    expect(isTraineeMove(italian[0]!, 1)).toBe(false);
    expect(isTraineeMove(sicilian[0]!, 0)).toBe(false);
    expect(isTraineeMove(sicilian[0]!, 1)).toBe(true);
  });

  it("recognizes a move from another line of the same set", () => {
    // Giuoco Piano and Evans Gambit part at White's fourth move: 4.c3 or 4.b4.
    const piano = italian[0]!;
    const evans = italian.find((l) => l.moves[6]?.san === "b4")!;
    expect(siblingLines(italian, piano, 6, "b2b4").map((l) => l.id)).toEqual([evans.id]);
    expect(siblingLines(italian, piano, 6, "h2h3")).toEqual([]);
  });

  it("lists every line of a personal repertoire", () => {
    let { tree } = addLine(emptyRepertoire(), ["e2e4", "e7e5", "g1f3"]);
    ({ tree } = addLine(tree, ["e2e4", "c7c5", "g1f3"]));
    const lines = repertoireDrillLines({ id: "r1", name: "Mine", color: "w", tree });
    expect(lines.map((l) => l.name)).toEqual(["1.e4 e5 2.Nf3", "1.e4 c5 2.Nf3"]);
    expect(lines[1]!.moves.map((m) => m.uci)).toEqual(["e2e4", "c7c5", "g1f3"]);
  });
});

describe("spaced repetition", () => {
  it("moves a perfect recall up a box and resets a line with a mistake", () => {
    let progress: DrillProgress = {};
    progress = recordAttempt(progress, "a", 0, NOW);
    expect(progress.a).toMatchObject({ box: 1, due: NOW + BOX_INTERVALS[1]!, reviews: 1 });
    progress = recordAttempt(progress, "a", 0, NOW);
    expect(progress.a!.box).toBe(2);
    progress = recordAttempt(progress, "a", 2, NOW);
    expect(progress.a).toMatchObject({ box: 0, due: NOW + BOX_INTERVALS[0]!, lapses: 1 });
  });

  it("caps the box at mastered", () => {
    let progress: DrillProgress = {};
    for (let i = 0; i < 10; i++) progress = recordAttempt(progress, "a", 0, NOW);
    expect(progress.a!.box).toBe(MASTERED_BOX);
    expect(lineStatus(progress.a, NOW)).toBe("mastered");
    expect(lineStatus(progress.a, NOW + BOX_INTERVALS[MASTERED_BOX]!)).toBe("due");
    expect(lineStatus(undefined, NOW)).toBe("new");
  });

  it("drills overdue lines first, then new ones, then the soonest due", () => {
    const [a, b, c] = italian;
    const progress: DrillProgress = {
      [a!.id]: { box: 2, due: NOW - 1000, reviews: 2, lapses: 0 },
      [b!.id]: { box: 1, due: NOW - 5000, reviews: 1, lapses: 0 },
    };
    expect(pickNextLine(italian, progress, NOW)?.id).toBe(b!.id);
    expect(pickNextLine(italian, progress, NOW, b!.id)?.id).toBe(a!.id);
    const later: DrillProgress = Object.fromEntries(
      italian.map((l, i) => [l.id, { box: 1, due: NOW + (i + 1) * 1000, reviews: 1, lapses: 0 }]),
    );
    expect(pickNextLine(italian, later, NOW)?.id).toBe(a!.id);
    expect(pickNextLine(italian, later, NOW, a!.id)?.id).toBe(b!.id);
    expect(pickNextLine(italian, { [a!.id]: later[a!.id]! }, NOW, a!.id)?.id).toBe(b!.id);
    expect(pickNextLine([c!], {}, NOW, c!.id)?.id).toBe(c!.id);
    expect(summarize(italian, progress, NOW)).toEqual({
      new: italian.length - 2,
      due: 2,
      learning: 0,
      mastered: 0,
    });
  });
});

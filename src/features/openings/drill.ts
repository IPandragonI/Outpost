import { Chess } from "chess.js";
import type { Localized } from "@/features/learn/lessons";
import type { GameTree } from "@/features/games/variation-tree";
import { uciOf, type Color } from "@/lib/chess/position";
import type { CatalogOpening } from "./catalog";
import { repertoireLines } from "./repertoire";

/**
 * Opening drills: lines to play from memory against the board, scheduled by spaced
 * repetition (Leitner boxes). A line recalled without mistakes moves up a box and comes
 * back later; a line with a mistake goes back to the first box and comes back soon.
 */

export interface DrillMove {
  san: string;
  uci: string;
}

export interface DrillLine {
  /** Stable across sessions: progress is stored under it. */
  id: string;
  /** The opening or repertoire the line belongs to. */
  group: Localized | string;
  name: Localized | string;
  /** The side the trainee plays. */
  color: Color;
  moves: DrillMove[];
}

/** Lines of a catalogued opening, played for the side that chooses it. */
export function catalogDrillLines(opening: CatalogOpening): DrillLine[] {
  return opening.lines.map((line, index) => {
    const chess = new Chess();
    const moves = line.moves.map((san) => {
      const move = chess.move(san);
      return { san: move.san, uci: uciOf(move) };
    });
    return {
      id: `o:${opening.id}/${index}`,
      group: opening.name,
      name: line.name,
      color: opening.side === "white" ? "w" : "b",
      moves,
    };
  });
}

/** Every root-to-leaf line of a personal repertoire. */
export function repertoireDrillLines(repertoire: {
  id: string;
  name: string;
  color: Color;
  tree: GameTree;
}): DrillLine[] {
  return repertoireLines(repertoire.tree).map((nodes) => {
    const moves = nodes.map((n) => ({ san: n.san!, uci: n.uci! }));
    return {
      id: `r:${repertoire.id}/${moves.map((m) => m.uci).join(",")}`,
      group: repertoire.name,
      name: nodes
        .slice(0, 8)
        .map((n) => (n.ply % 2 === 1 ? `${Math.ceil(n.ply / 2)}.${n.san}` : n.san))
        .join(" ")
        .concat(nodes.length > 8 ? " …" : ""),
      color: repertoire.color,
      moves,
    };
  });
}

/** Whether the trainee or the board plays the move at `ply` (0-based) of a line. */
export function isTraineeMove(line: DrillLine, ply: number): boolean {
  return (ply % 2 === 0 ? "w" : "b") === line.color;
}

/**
 * Other lines that share the moves played so far and continue with `uci`: playing one of
 * them is a different line of the same set, not a mistake.
 */
export function siblingLines(
  lines: readonly DrillLine[],
  current: DrillLine,
  ply: number,
  uci: string,
): DrillLine[] {
  return lines.filter(
    (other) =>
      other.id !== current.id &&
      other.color === current.color &&
      other.moves[ply]?.uci === uci &&
      current.moves.slice(0, ply).every((m, i) => other.moves[i]?.uci === m.uci),
  );
}

// Spaced repetition.

export interface LineProgress {
  /** Leitner box: 0 is being learnt, the last box is mastered. */
  box: number;
  /** When the line is next due (epoch ms). */
  due: number;
  reviews: number;
  lapses: number;
}

export type DrillProgress = Record<string, LineProgress>;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Delay before a line comes back, by box. */
export const BOX_INTERVALS = [10 * MINUTE, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];
export const MASTERED_BOX = BOX_INTERVALS.length - 1;

/** Records one recall of a line: no mistake moves it up a box, any mistake resets it. */
export function recordAttempt(
  progress: DrillProgress,
  lineId: string,
  mistakes: number,
  now: number,
): DrillProgress {
  const previous = progress[lineId];
  const box = mistakes === 0 ? Math.min(previous ? previous.box + 1 : 1, MASTERED_BOX) : 0;
  return {
    ...progress,
    [lineId]: {
      box,
      due: now + BOX_INTERVALS[box]!,
      reviews: (previous?.reviews ?? 0) + 1,
      lapses: (previous?.lapses ?? 0) + (mistakes > 0 && previous ? 1 : 0),
    },
  };
}

export type LineStatus = "new" | "due" | "learning" | "mastered";

export function lineStatus(entry: LineProgress | undefined, now: number): LineStatus {
  if (!entry) return "new";
  if (entry.due <= now) return "due";
  return entry.box >= MASTERED_BOX ? "mastered" : "learning";
}

/**
 * The next line to drill: the most overdue line first, then a new one (in order), then
 * the one due soonest. `skip` (the line just played) is avoided when there is a choice.
 */
export function pickNextLine(
  lines: readonly DrillLine[],
  progress: DrillProgress,
  now: number,
  skip?: string,
): DrillLine | null {
  const pool = lines.length > 1 ? lines.filter((l) => l.id !== skip) : lines;
  const due = pool
    .filter((l) => progress[l.id] && progress[l.id]!.due <= now)
    .sort((a, b) => progress[a.id]!.due - progress[b.id]!.due);
  if (due.length) return due[0]!;
  const fresh = pool.find((l) => !progress[l.id]);
  if (fresh) return fresh;
  return [...pool].sort((a, b) => progress[a.id]!.due - progress[b.id]!.due)[0] ?? null;
}

export function summarize(
  lines: readonly DrillLine[],
  progress: DrillProgress,
  now: number,
): Record<LineStatus, number> {
  const counts: Record<LineStatus, number> = { new: 0, due: 0, learning: 0, mastered: 0 };
  for (const line of lines) counts[lineStatus(progress[line.id], now)]++;
  return counts;
}

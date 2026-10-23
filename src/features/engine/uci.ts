import type { Color } from "@/lib/chess/position";
import { fromUci, type Score } from "./evaluation";

/** One `info` line carrying a principal variation. Scores are White point of view. */
export interface InfoLine {
  depth: number;
  seldepth?: number;
  multipv: number;
  score: Score;
  /** Set when the score is only a bound (an aspiration window failed), not exact. */
  bound?: "lower" | "upper";
  nodes?: number;
  nps?: number;
  timeMs?: number;
  hashfull?: number;
  pv: string[];
}

export type UciMessage =
  | { type: "info"; info: InfoLine }
  | { type: "bestmove"; move: string | null; ponder?: string }
  | { type: "uciok" }
  | { type: "readyok" }
  | { type: "id"; name: string }
  | { type: "other"; line: string };

/**
 * Parses one line of engine output. `turn` is the side to move in the searched
 * position, needed to turn UCI's side-to-move scores into White point-of-view ones.
 * Info lines without a score and a PV (currmove, string, hashfull-only…) are "other".
 */
export function parseUciLine(line: string, turn: Color): UciMessage {
  const trimmed = line.trim();
  if (trimmed === "uciok") return { type: "uciok" };
  if (trimmed === "readyok") return { type: "readyok" };
  const tokens = trimmed.split(/\s+/);
  const head = tokens[0];

  if (head === "bestmove") {
    const move = tokens[1];
    const ponderIndex = tokens.indexOf("ponder");
    return {
      type: "bestmove",
      move: !move || move === "(none)" || move === "0000" ? null : move,
      ...(ponderIndex !== -1 && tokens[ponderIndex + 1] ? { ponder: tokens[ponderIndex + 1] } : {}),
    };
  }
  if (head === "id" && tokens[1] === "name") {
    return { type: "id", name: tokens.slice(2).join(" ") };
  }
  if (head !== "info" || tokens.includes("string")) return { type: "other", line: trimmed };

  let depth: number | undefined;
  let score: Score | undefined;
  const info: Partial<InfoLine> = { multipv: 1 };
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    switch (token) {
      case "depth":
        depth = Number(next);
        i++;
        break;
      case "seldepth":
        info.seldepth = Number(next);
        i++;
        break;
      case "multipv":
        info.multipv = Number(next);
        i++;
        break;
      case "nodes":
        info.nodes = Number(next);
        i++;
        break;
      case "nps":
        info.nps = Number(next);
        i++;
        break;
      case "time":
        info.timeMs = Number(next);
        i++;
        break;
      case "hashfull":
        info.hashfull = Number(next);
        i++;
        break;
      case "score": {
        const kind = next;
        const value = Number(tokens[i + 2]);
        if ((kind === "cp" || kind === "mate") && Number.isFinite(value)) {
          score = fromUci(kind, value, turn);
        }
        i += 2;
        break;
      }
      case "lowerbound":
      case "upperbound": {
        // Bounds are from the side to move's point of view, like the score.
        const sideBound = token === "lowerbound" ? "lower" : "upper";
        info.bound = turn === "w" ? sideBound : sideBound === "lower" ? "upper" : "lower";
        break;
      }
      case "pv":
        info.pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
      default:
        break;
    }
  }
  if (depth === undefined || !score || !info.pv?.length) return { type: "other", line: trimmed };
  return { type: "info", info: { ...(info as InfoLine), depth, score } };
}

export interface SearchLimits {
  /** Stop at this depth. */
  depth?: number;
  /** Stop after this many milliseconds. */
  movetimeMs?: number;
  /** Number of principal variations (MultiPV). */
  multiPv: number;
}

export function goCommand(limits: SearchLimits): string {
  const parts = ["go"];
  if (limits.depth) parts.push("depth", String(limits.depth));
  if (limits.movetimeMs) parts.push("movetime", String(Math.round(limits.movetimeMs)));
  if (parts.length === 1) parts.push("infinite");
  return parts.join(" ");
}

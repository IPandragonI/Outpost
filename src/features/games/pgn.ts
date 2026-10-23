import { Chess } from "chess.js";
import { isValidFen, START_FEN, uciOf } from "@/lib/chess/position";
import {
  addMove,
  annotate,
  createTree,
  getNode,
  type GameTree,
  type NodeId,
} from "./variation-tree";

/**
 * PGN import. chess.js validates the moves, but its own PGN loader drops variations, so
 * the movetext is tokenized here into a variation tree that keeps the main line, nested
 * variations (RAV), comments, NAGs and `[%clk]` clock annotations.
 */

export type PgnHeaders = Record<string, string>;

export interface ParsedGame {
  headers: PgnHeaders;
  tree: GameTree;
  /** Result token from the movetext, or the Result tag ("*" when unknown). */
  result: string;
  /** Problems that did not prevent the import, e.g. an illegal move inside a variation. */
  warnings: string[];
  /** This game's PGN text exactly as it appeared in the input. */
  source: string;
}

export type PgnErrorCode =
  "empty" | "noGame" | "noMoves" | "badFen" | "illegalMove" | "illegalFirstMove" | "unknown";

export class PgnError extends Error {
  constructor(
    /** English description, for logs and tests; the UI translates `code`. */
    message: string,
    /** 1-based index of the game in a multi-game input. */
    readonly gameIndex: number,
    readonly code: PgnErrorCode = "unknown",
    /** Values for the translated message (the faulty move, the FEN…). */
    readonly vars: Record<string, string> = {},
  ) {
    super(message);
    this.name = "PgnError";
  }
}

export interface PgnImportResult {
  games: ParsedGame[];
  /** Games that could not be imported, with a human-readable reason each. */
  errors: PgnError[];
}

const SUFFIX_NAGS: Record<string, number> = { "!": 1, "?": 2, "!!": 3, "??": 4, "!?": 5, "?!": 6 };
const RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

type Token =
  | { type: "tag"; name: string; value: string }
  | { type: "comment"; text: string }
  | { type: "nag"; value: number }
  | { type: "open" }
  | { type: "close" }
  | { type: "result"; value: string }
  | { type: "move"; san: string; suffixNag?: number };

interface RawGame {
  tokens: Token[];
  source: string;
}

/** Splits the input into games: a tag after movetext (or a result) starts a new game. */
function tokenize(input: string): RawGame[] {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const games: RawGame[] = [];
  let tokens: Token[] = [];
  let gameStart = 0;
  let sawMovetext = false;
  let i = 0;

  const finish = (end: number) => {
    if (tokens.length) games.push({ tokens, source: text.slice(gameStart, end).trim() });
    tokens = [];
    sawMovetext = false;
    gameStart = end;
  };

  while (i < text.length) {
    const ch = text[i]!;
    // "%" at the start of a line escapes the whole line (PGN standard 6).
    if (ch === "%" && (i === 0 || text[i - 1] === "\n")) {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "[") {
      if (sawMovetext) finish(i);
      const end = findTagEnd(text, i);
      const body = text.slice(i + 1, end);
      const match = /^\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*$/s.exec(body);
      if (match) {
        tokens.push({
          type: "tag",
          name: match[1]!,
          value: match[2]!.replace(/\\(["\\])/g, "$1"),
        });
      }
      i = end + 1;
      continue;
    }
    sawMovetext = true;
    if (ch === "{") {
      const end = text.indexOf("}", i + 1);
      const close = end === -1 ? text.length : end;
      tokens.push({ type: "comment", text: text.slice(i + 1, close) });
      i = close + 1;
      continue;
    }
    if (ch === ";") {
      const end = text.indexOf("\n", i + 1);
      const close = end === -1 ? text.length : end;
      tokens.push({ type: "comment", text: text.slice(i + 1, close) });
      i = close;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "open" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "close" });
      i++;
      continue;
    }
    if (ch === "$") {
      const match = /^\$(\d+)/.exec(text.slice(i));
      if (match) tokens.push({ type: "nag", value: Number(match[1]) });
      i += match ? match[0].length : 1;
      continue;
    }

    // A symbol: move number, move, result or stray annotation.
    let j = i;
    while (j < text.length && !/[\s{}();[\]$]/.test(text[j]!)) j++;
    const word = text.slice(i, j);
    i = j;

    if (RESULTS.has(word)) {
      tokens.push({ type: "result", value: word });
      finish(i);
      continue;
    }
    // Move numbers ("12.", "12...") may be glued to the move: "12.Nf3".
    const symbol = word.replace(/^\d+\.+/, "");
    if (!symbol || /^\.+$/.test(symbol) || /^\d+$/.test(symbol)) continue;
    const suffix = /([!?]{1,2})$/.exec(symbol);
    if (suffix && suffix.index === 0) {
      tokens.push({ type: "nag", value: SUFFIX_NAGS[suffix[1]!] ?? 0 });
      continue;
    }
    let san = suffix ? symbol.slice(0, suffix.index) : symbol;
    // Castling written with zeros: "0-0", "0-0-0".
    if (/^0-0(-0)?[+#]?$/.test(san)) san = san.replace(/0/g, "O");
    tokens.push({
      type: "move",
      san,
      ...(suffix ? { suffixNag: SUFFIX_NAGS[suffix[1]!] } : {}),
    });
  }
  finish(text.length);
  return games;
}

function findTagEnd(text: string, start: number): number {
  let inString = false;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && inString) {
      i++;
      continue;
    }
    if (ch === '"') inString = !inString;
    else if (ch === "]" && !inString) return i;
  }
  return text.length;
}

/** Extracts `[%clk 1:02:03.4]` from a comment; other commands such as `[%eval]` are dropped. */
function splitCommentCommands(raw: string): { text: string; clock?: number } {
  let clock: number | undefined;
  const text = raw
    .replace(/\[%(\w+)\s+([^\]]*)\]/g, (_, cmd: string, arg: string) => {
      if (cmd === "clk") {
        const parts = arg.trim().split(":").map(Number);
        if (parts.every((p) => Number.isFinite(p))) {
          clock = parts.reduce((acc, p) => acc * 60 + p, 0);
        }
      }
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return clock === undefined ? { text } : { text, clock };
}

function appendText(existing: string | undefined, text: string): string {
  return existing ? `${existing} ${text}` : text;
}

function describeMove(ply: number, san: string): string {
  const number = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${number}. ${san}` : `${number}... ${san}`;
}

function buildGame(raw: RawGame, gameIndex: number): ParsedGame {
  const headers: PgnHeaders = {};
  for (const token of raw.tokens) {
    if (token.type === "tag") headers[token.name] = token.value;
  }

  let startFen = START_FEN;
  if (headers.FEN && headers.SetUp !== "0") {
    try {
      if (!isValidFen(headers.FEN)) throw new Error("invalid position");
      startFen = new Chess(headers.FEN).fen();
    } catch {
      throw new PgnError(
        `The FEN tag is not a valid position: "${headers.FEN}"`,
        gameIndex,
        "badFen",
        { fen: headers.FEN },
      );
    }
  }

  let tree = createTree(startFen);
  const warnings: string[] = [];
  let result = headers.Result && RESULTS.has(headers.Result) ? headers.Result : "*";

  // `current` is the node the next move is played from; `last` is the most recent move,
  // which a "(" offers an alternative to. `broken` skips the rest of an invalid variation.
  interface Frame {
    current: NodeId;
    last: NodeId | null;
    broken: boolean;
  }
  let frame: Frame = { current: tree.rootId, last: null, broken: false };
  const stack: Frame[] = [];
  let pendingPreComment: string | undefined;
  let moveCount = 0;

  for (const token of raw.tokens) {
    switch (token.type) {
      case "tag":
        break;
      case "result":
        if (stack.length === 0) result = token.value;
        break;
      case "comment": {
        if (frame.broken) break;
        const { text, clock } = splitCommentCommands(token.text);
        if (frame.last === null && stack.length === 0) {
          // Before the game's first move: a comment on the starting position.
          const root = getNode(tree, tree.rootId);
          if (text) tree = annotate(tree, tree.rootId, { comment: appendText(root.comment, text) });
        } else if (frame.last === null) {
          // At the start of a variation, before its first move.
          if (text) pendingPreComment = appendText(pendingPreComment, text);
        } else {
          const node = getNode(tree, frame.last);
          tree = annotate(tree, frame.last, {
            ...(text ? { comment: appendText(node.comment, text) } : {}),
            ...(clock !== undefined ? { clock } : {}),
          });
        }
        break;
      }
      case "nag": {
        if (frame.broken || frame.last === null || token.value === 0) break;
        const node = getNode(tree, frame.last);
        tree = annotate(tree, frame.last, { nags: [...(node.nags ?? []), token.value] });
        break;
      }
      case "open": {
        stack.push(frame);
        if (frame.broken || frame.last === null) {
          // A variation with nothing to be an alternative to: keep its moves out.
          if (!frame.broken) warnings.push("Ignored a variation placed before any move.");
          frame = { current: frame.current, last: null, broken: true };
        } else {
          const parent = getNode(tree, frame.last).parentId ?? tree.rootId;
          frame = { current: parent, last: null, broken: false };
        }
        pendingPreComment = undefined;
        break;
      }
      case "close": {
        const previous = stack.pop();
        if (previous) frame = previous;
        pendingPreComment = undefined;
        break;
      }
      case "move": {
        if (frame.broken) break;
        const from = getNode(tree, frame.current);
        const chess = new Chess(from.fen);
        let move;
        try {
          move = chess.move(token.san);
        } catch {
          move = null;
        }
        if (!move) {
          const where = describeMove(from.ply + 1, token.san);
          if (stack.length === 0) {
            throw new PgnError(
              `Illegal move ${where}${moveCount === 0 ? " (is the starting position right?)" : ""}.`,
              gameIndex,
              moveCount === 0 ? "illegalFirstMove" : "illegalMove",
              { move: where },
            );
          }
          warnings.push(`Skipped the rest of a variation at the illegal move ${where}.`);
          frame = { ...frame, broken: true };
          break;
        }
        const added = addMove(tree, frame.current, {
          san: move.san,
          uci: uciOf(move),
          fen: chess.fen(),
          origin: "game",
          ...(pendingPreComment ? { preComment: pendingPreComment } : {}),
          ...(token.suffixNag ? { nags: [token.suffixNag] } : {}),
        });
        tree = added.tree;
        pendingPreComment = undefined;
        frame = { current: added.id, last: added.id, broken: false };
        moveCount++;
        break;
      }
    }
  }

  if (stack.length)
    warnings.push("A variation was not closed; it was ended at the end of the game.");
  if (moveCount === 0 && !headers.FEN && Object.keys(headers).length === 0) {
    throw new PgnError("No moves or tags were found.", gameIndex, "noMoves");
  }
  return { headers, tree, result, warnings, source: raw.source };
}

/** Parses one or several games. Invalid games are reported without discarding valid ones. */
export function parsePgn(input: string): PgnImportResult {
  if (!input.trim()) {
    return { games: [], errors: [new PgnError("The PGN is empty.", 1, "empty")] };
  }
  const games: ParsedGame[] = [];
  const errors: PgnError[] = [];
  tokenize(input).forEach((raw, index) => {
    try {
      games.push(buildGame(raw, index + 1));
    } catch (error) {
      errors.push(
        error instanceof PgnError
          ? error
          : new PgnError(
              error instanceof Error ? error.message : String(error),
              index + 1,
              "unknown",
              { detail: error instanceof Error ? error.message : String(error) },
            ),
      );
    }
  });
  if (games.length === 0 && errors.length === 0) {
    errors.push(new PgnError("No game was found in this text.", 1, "noGame"));
  }
  return { games, errors };
}

/** Readable title for a game, from its tags. */
export function gameTitle(headers: PgnHeaders): string {
  const known = (v?: string) => (v && v !== "?" && v !== "??" ? v : undefined);
  const white = known(headers.White);
  const black = known(headers.Black);
  if (white || black) return `${white ?? "Unknown"} – ${black ?? "Unknown"}`;
  return known(headers.Event) ?? "Untitled game";
}

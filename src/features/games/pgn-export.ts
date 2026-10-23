import { START_FEN } from "@/lib/chess/position";
import type { PgnHeaders } from "./pgn";
import { getNode, pathTo, type GameTree, type MoveNode, type NodeId } from "./variation-tree";

/** Seven Tag Roster order, then the remaining tags alphabetically. */
const STR = ["Event", "Site", "Date", "Round", "White", "Black", "Result"];
const STR_DEFAULTS: Record<string, string> = {
  Event: "?",
  Site: "?",
  Date: "????.??.??",
  Round: "?",
  White: "?",
  Black: "?",
  Result: "*",
};

export interface PgnExportOptions {
  /** Include moves explored on the board as variations. Default false: the game as imported. */
  includeExplorations?: boolean;
  /** Include comments, NAGs and clocks. Default true. */
  includeAnnotations?: boolean;
}

function escapeTag(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds - h * 3600 - m * 60;
  const ss = Number.isInteger(s) ? String(s).padStart(2, "0") : s.toFixed(1).padStart(4, "0");
  return `${h}:${String(m).padStart(2, "0")}:${ss}`;
}

function sanitizeComment(text: string): string {
  // "}" would end the comment early.
  return text.replace(/}/g, ")");
}

export function formatHeaders(headers: PgnHeaders, result: string, startFen: string): string {
  const tags: [string, string][] = [];
  const all: PgnHeaders = { ...headers, Result: result };
  if (startFen !== START_FEN) {
    all.SetUp = "1";
    all.FEN = startFen;
  } else {
    delete all.SetUp;
    delete all.FEN;
  }
  for (const name of STR) tags.push([name, all[name] ?? STR_DEFAULTS[name]!]);
  for (const name of Object.keys(all).sort()) {
    if (!STR.includes(name)) tags.push([name, all[name]!]);
  }
  return tags.map(([n, v]) => `[${n} "${escapeTag(v)}"]`).join("\n");
}

/** Space-separated movetext tokens for the line starting with `firstId`, with its variations. */
function lineTokens(
  tree: GameTree,
  firstId: NodeId,
  options: Required<PgnExportOptions>,
  keep: (node: MoveNode) => boolean,
): string[] {
  const out: string[] = [];
  let node: MoveNode | undefined = getNode(tree, firstId);
  let forceNumber = true;

  while (node) {
    const annotated = options.includeAnnotations;
    if (annotated && node.preComment) out.push(`{${sanitizeComment(node.preComment)}}`);
    const moveNumber = Math.ceil(node.ply / 2);
    const isWhite = node.ply % 2 === 1;
    if (isWhite) out.push(`${moveNumber}.`);
    else if (forceNumber) out.push(`${moveNumber}...`);
    out.push(node.san!);
    if (annotated) {
      for (const nag of node.nags ?? []) out.push(`$${nag}`);
      const commands = node.clock !== undefined ? `[%clk ${formatClock(node.clock)}]` : "";
      const text = [commands, node.comment ? sanitizeComment(node.comment) : ""]
        .filter(Boolean)
        .join(" ");
      if (text) out.push(`{${text}}`);
    }
    forceNumber = annotated && Boolean(node.comment || node.clock !== undefined);

    // Alternatives to this move are printed right after it, then the line continues.
    const parent: MoveNode | undefined =
      node.parentId === null ? undefined : getNode(tree, node.parentId);
    const alternatives = parent
      ? parent.children.filter((c) => c !== node!.id && keep(getNode(tree, c)))
      : [];
    const isFirst = parent?.children.filter((c) => keep(getNode(tree, c)))[0] === node.id;
    if (isFirst) {
      for (const alt of alternatives) {
        out.push(`(${lineTokens(tree, alt, options, keep).join(" ")})`);
        forceNumber = true;
      }
    }

    const nextId: NodeId | undefined = node.children.find((c) => keep(getNode(tree, c)));
    node = nextId === undefined ? undefined : getNode(tree, nextId);
  }
  return out;
}

function wrap(tokens: string[], width = 80): string {
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    if (line && line.length + 1 + token.length > width) {
      lines.push(line);
      line = token;
    } else {
      line = line ? `${line} ${token}` : token;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/** Writes the whole tree (main line and variations) as one PGN game. */
export function exportPgn(
  tree: GameTree,
  headers: PgnHeaders,
  result: string,
  options: PgnExportOptions = {},
): string {
  const opts: Required<PgnExportOptions> = {
    includeExplorations: options.includeExplorations ?? false,
    includeAnnotations: options.includeAnnotations ?? true,
  };
  const keep = (n: MoveNode) => opts.includeExplorations || n.origin === "game";
  const root = getNode(tree, tree.rootId);
  const tokens: string[] = [];
  if (opts.includeAnnotations && root.comment) tokens.push(`{${sanitizeComment(root.comment)}}`);
  const first = root.children.find((c) => keep(getNode(tree, c)));
  if (first !== undefined) tokens.push(...lineTokens(tree, first, opts, keep));
  tokens.push(result);
  return `${formatHeaders(headers, result, root.fen)}\n\n${wrap(tokens)}\n`;
}

/**
 * Writes only the line leading to `id` (e.g. an explored variation), as a standalone game
 * with an unknown result.
 */
export function exportLine(tree: GameTree, id: NodeId, headers: PgnHeaders): string {
  const path = pathTo(tree, id);
  const ids = new Set(path.map((n) => n.id));
  const root = path[0]!;
  const tokens: string[] = [];
  const first = path[1];
  if (first) {
    tokens.push(
      ...lineTokens(tree, first.id, { includeExplorations: true, includeAnnotations: false }, (n) =>
        ids.has(n.id),
      ),
    );
  }
  tokens.push("*");
  return `${formatHeaders(headers, "*", root.fen)}\n\n${wrap(tokens)}\n`;
}

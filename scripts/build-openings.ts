/**
 * Builds public/data/openings-v1.json from the lichess chess-openings TSV files in
 * data/openings (CC0, https://github.com/lichess-org/chess-openings).
 *
 * Run with `pnpm openings` after updating the TSV files. Every line is replayed with
 * chess.js, so an illegal or ambiguous line fails the build instead of shipping.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Chess } from "chess.js";
import { positionKey } from "@/lib/chess/position";
import type { BookPositionEntry, OpeningBookFile } from "@/features/openings/book-format";

const dataDir = join(process.cwd(), "data", "openings");
const outFile = join(process.cwd(), "public", "data", "openings-v1.json");

const openings: OpeningBookFile["openings"] = [];
const positions = new Map<string, { o: number[]; m: Map<string, number> }>();

function entry(key: string) {
  let value = positions.get(key);
  if (!value) {
    value = { o: [], m: new Map() };
    positions.set(key, value);
  }
  return value;
}

for (const file of readdirSync(dataDir)
  .filter((f) => f.endsWith(".tsv"))
  .sort()) {
  const rows = readFileSync(join(dataDir, file), "utf-8").trim().split("\n").slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.replace(/\r$/, "").split("\t");
    if (!eco || !name || !pgn) throw new Error(`${file}: malformed row "${row}"`);
    const sans = pgn.split(/\s+/).filter((token) => token && !/^\d+\.+$/.test(token));
    const chess = new Chess();
    const index = openings.length;
    const played: string[] = [];
    for (const san of sans) {
      const key = positionKey(chess.fen());
      let move;
      try {
        move = chess.move(san, { strict: true });
      } catch {
        throw new Error(`${file}: illegal move ${san} in "${name}" (${pgn})`);
      }
      played.push(move.san);
      const moves = entry(key).m;
      moves.set(move.san, (moves.get(move.san) ?? 0) + 1);
    }
    entry(positionKey(chess.fen())).o.push(index);
    openings.push([eco, name, played.join(" ")]);
  }
}

const out: OpeningBookFile = {
  format: 1,
  source: "lichess-org/chess-openings",
  license: "CC0-1.0",
  openings,
  positions: {},
};
for (const [key, value] of positions) {
  const compact: BookPositionEntry = {};
  if (value.o.length) compact.o = value.o;
  if (value.m.size) compact.m = [...value.m].sort((a, b) => b[1] - a[1]);
  out.positions[key] = compact;
}

const json = JSON.stringify(out);
mkdirSync(join(process.cwd(), "public", "data"), { recursive: true });
writeFileSync(outFile, json);
console.log(
  `${openings.length} named lines, ${positions.size} positions → ${outFile} (${Math.round(
    json.length / 1024,
  )} KiB)`,
);

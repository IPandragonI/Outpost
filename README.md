# Outpost

A client-side chess analysis workstation: import games, analyze them with Stockfish running
in your browser, review classified moves, explore opening theory and train a repertoire.
No backend, no account, no telemetry — games and analyses stay on the device (IndexedDB),
and the app works offline once its files are cached. The interface is in French by default,
with English available (header switch or Settings).

## Features

- **Games**: PGN import (paste, file, several games per file; variations, comments, NAGs and
  `[%clk]` kept), recent games fetched from a Chess.com account, manual entry on the board,
  local library with search, sort, rename, delete and PGN export.
- **Board**: drag or tap-to-move, promotion picker, flip, last-move/check highlights,
  keyboard navigation (←/→, Home/End, F, Esc).
- **Engine**: Stockfish 19 (lite NNUE, WebAssembly) in a Web Worker, multi-threaded when the
  page is cross-origin isolated. Live MultiPV analysis, "go deeper", whole-game analysis
  (quick / standard / deep) with progress, cancellation and resume.
- **Review**: per-move classifications (brilliant, great, best, excellent, good, book, forced,
  inaccuracy, mistake, miss, blunder) with engine-grounded explanations, best alternative and
  refutation lines to step through, evaluation graph, per-player precision, turning points.
- **Variations**: explore any line without altering the imported game; preview engine and
  theory lines move by move; keep, delete, return to the game.
- **Learn**: theory lessons (opening principles, tactical patterns, endgame theory: basic
  mates, king and pawn, rook endgames with Lucena and Philidor, theoretical draws) with lines
  to step through and exercises solved on the board; every exercise, and every endgame's
  win/draw verdict, is checked with Stockfish by the tests.
- **Openings**: a grid of the main White openings and Black defences; each card opens a board
  that plays through the main line and its variations (step by step or automatically, next
  move shown as an arrow). Every catalogue line is legal and checked against the opening
  dataset by the tests. The advanced studio keeps position-based identification, theory moves
  with Stockfish's evaluation, opening search and a personal repertoires.
- **Settings**: board colours (presets or custom), six piece sets, animation speed, move
  sounds (synthesized in the browser, with volume), engine depth, threads, memory and the
  sensitivity of move classification (lenient, standard, strict).
- **Export**: PGN as imported, with explored variations, current line only; analysis JSON.

## Privacy

Nothing is sent anywhere, with one opt-in exception: the Chess.com tab sends the username you
type to Chess.com's public API (`api.chess.com/pub/player/<username>/games/…`) to list your
recent games. No credentials are involved; the games you pick are stored locally.

## Getting started

Requires Node.js 22+ and pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:3000 (service worker disabled in development)
pnpm build && pnpm start
```

`next.config.ts` copies the Stockfish builds from `node_modules/stockfish` into
`public/engines/` at startup; nothing else needs to be generated.

### Scripts

| Command | |
| --- | --- |
| `pnpm test` | Unit and integration tests (Vitest). Engine tests run the real Stockfish build in Node. |
| `pnpm test:e2e` | Playwright end-to-end tests against the production build (`pnpm build` first). |
| `pnpm typecheck` / `pnpm lint` | TypeScript (strict) and ESLint. |
| `pnpm check` | lint + typecheck + unit tests. |
| `pnpm bench` | Times the whole-game analysis with the real engine (before/after the parallel pipeline). |
| `pnpm openings` | Rebuilds `public/data/openings-v1.json` from `data/openings/*.tsv`. |
| `pnpm icons` | Renders the PWA icons from `public/icons/icon.svg`. |

## Deployment

Any static-capable host running `next start` works. To enable the multi-threaded engine the
host must send `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` (configured in `next.config.ts` for `next start`).
Without them the single-threaded build is used automatically.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, data flow and design decisions.
- [docs/CLASSIFICATION.md](docs/CLASSIFICATION.md) — classification and precision methodology,
  benchmark and limits.
- [docs/LICENSES.md](docs/LICENSES.md) — third-party licenses and data provenance.

## License

GPL-3.0-or-later (see `LICENSE`), because the application ships Stockfish (GPL-3.0).
Not affiliated with Chess.com or lichess.org.

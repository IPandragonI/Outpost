# Architecture

Outpost is a Next.js (App Router) application whose pages are all static: every feature runs
in the browser. Next.js provides routing, bundling and the service worker build; there are no
API routes or server actions.

## Layout

```
src/
  app/                 routes: /, /games, /analysis, /openings, /learn, /settings, /about, sw.ts
  components/          React UI by area (analysis, board, library, openings, settings, layout)
  features/            framework-free domain modules (unit tested)
    games/             PGN parser and exporter, variation tree
    engine/            UCI parsing, UciEngine, EngineService (queue), evaluation, cache
    classification/    classification, game review, precision, explanations, material/SEE
    openings/          opening book queries, catalogue, repertoire logic, drills (spaced repetition)
    analysis/          whole-game analysis runner, workspace store (Zustand), JSON export
    storage/           Dexie database and repositories
    settings/          settings store (persisted in IndexedDB)
    offline/           offline asset checks
  hooks/               live engine, opening book, game review, media queries
  lib/                 chess helpers (position keys, UCI/SAN), downloads
scripts/               opening book build, icon generation
data/openings/         lichess chess-openings TSV files (CC0), source of the book
tests/                 Vitest: domain, storage, real-engine integration
e2e/                   Playwright: desktop, mobile, offline
```

Concerns stay separate: chess rules (`lib/chess`, chess.js), engine execution (`engine/`),
evaluation normalization (`engine/evaluation.ts`), classification (`classification/`, no UI or
engine code), opening data (`openings/`), persistence (`storage/`), presentation
(`components/`).

## Key decisions

**Variation tree.** A game is an immutable tree of move nodes. Imported moves have origin
`game`, moves played on the board `explore`. The main line follows the first `game` child, so
exploring can never extend or reorder the imported game, and deleting `game` nodes is refused
(except while entering a game move by move on an empty board). The original PGN text is kept
untouched next to the tree.

**PGN parser.** chess.js validates moves but its loader drops variations, so the movetext is
tokenized here. An illegal main-line move rejects that game with its move number; an illegal
move inside a variation only truncates that variation (reported as a warning). Multi-game
files import the valid games and list the invalid ones.

**Evaluation model.** Every `Score` is from White's point of view, and mates carry their winner
explicitly (`{ kind: "mate", moves, winner }`): "mate 0" has no sign, and an explicit winner
makes perspective errors hard to write silently. Conversions to the mover's view go through
`winChanceFor`, `scoreValueFor` and `centipawnsFor` only.

**Engine.** Stockfish.js 19 lite builds, copied from npm when Next starts. One engine for the
whole app (`EngineService`): searches are queued; interactive searches (the board) preempt
background ones (whole-game analysis), which are re-queued rather than lost. Cancelling a
running search sends `stop` and resolves with the partial result. A crashed engine is
restarted once for the running search; the threaded build falls back to the single-threaded
one. `UciEngine` talks to a transport interface, so tests drive the real engine in Node.
Results are stamped with a fixed engine identity so cached results are recognized across
sessions.

Threads default to cores − 1, capped at 4 (2 on phones); hash 16–64 MB by device memory; both
are settings. The lite network is weaker than desktop Stockfish but weighs ~1.8 MB; the 94 MB
full network was judged too heavy for a default offline download.

**Whole-game analysis speed.** Two measures, neither lowering the depth of a judged move:

- *Helper engines.* Besides the primary engine (multi-threaded, serving the board first),
  up to three single-thread helpers analyze positions in parallel (fewer on phones, none on
  low-memory devices); they stop after 20 s idle. The game is cut into consecutive
  stretches ("lanes"), each searched in order by the same engine when possible, so its
  hash table carries over from one position to the next as in a sequential analysis.
- *Shallow book positions.* A position between two book moves is searched at depth 10 with
  one line: book moves are labelled from theory, so their scores never decide a verdict.
  The position before the first judged move, and every later one, gets the full preset.

`pnpm bench` (Immortal Game, Standard preset, one 4-thread engine vs the pool):
159.7 s and 212.3 s for two runs of the old pipeline, 58.6 s for the new one (2.7–3.6×).
Verdicts: the two old runs agree on 36 of 45 moves (multi-threaded search is not
deterministic); the new pipeline agrees with them on 39 and 35 — the same spread.

**Stale results.** The live-analysis hook tags each result with the request (position, depth,
lines) it answers and ignores any other; the search is cancelled when the board changes. The
whole-game run checks a per-run token before applying each result.

**Cache.** Results are stored per position key (FEN without move counters) and engine
identity, and reused only when complete, at least as deep and with at least as many lines as
requested (`analysis-cache.ts`). Transpositions share results, across games too.

**Openings.** The lichess chess-openings dataset (CC0) is compiled by
`scripts/build-openings.ts` into a position-keyed JSON (~1 MB, ~140 KB gzipped) fetched on
first use, not bundled. The dataset has no game statistics; the UI shows the number of named
lines after each move and says so. `OpeningBook` is the provider interface; a larger
user-supplied dataset in the same format could be loaded the same way.
The `/openings` grid comes from a hand-written catalogue (`features/openings/catalog.ts`:
bilingual names, summaries, main line and variations), shown by side, by ECO family (the letter
of the code) or by White's first move, with a search over names, variation names and ECO codes. `tests/catalog.test.ts` checks that every
line is legal, shares the opening's defining moves and stays in the dataset; the dataset still
names the positions shown on the board. `?view=studio` keeps the full explorer and repertoire.

**Persistence.** Dexie over IndexedDB, schema v1: `games`, `positions` (engine cache),
`repertoires`, `settings` (also holds the trainer's progress). A data-model change adds `version(n).upgrade()` in `database.ts`.
Storage errors become actionable messages, never swallowed. Only the theme is mirrored to
`localStorage`, to apply it before first paint.

**Offline.** Serwist precaches the app shell, routes and piece sets. The engine and opening
book are cached on first use (cache-first), keeping installation light; Settings shows
whether they are available offline and can download them explicitly.

**Languages.** French (default) and English. Messages live in `src/lib/i18n/messages.ts`:
English defines the keys, the French table is typed against them, and `tests/i18n.test.ts`
checks keys, placeholders and that every key used in the code exists. Domain code returns
codes or takes a translator rather than producing text (`PgnError.code`, `storageProblem`,
`explainMove(t, …)`). Pages are prerendered in French; the choice is mirrored to
`localStorage` so the right language (and `<html lang>`) applies before settings load from
IndexedDB. Opening names stay in English, as in the dataset.

**Chess.com import.** `src/features/chesscom/chesscom.ts` reads a player's monthly archives
from Chess.com's public API (CORS-enabled, so it works from the browser even under
cross-origin isolation), newest first, standard chess only, following only links back to the
same API. It is the app's only request carrying user input, made on demand. Imported games
keep their `Link` tag, which marks them as already imported in later fetches.

**Repertoire trainer.** `/trainer` drills lines from the catalogue (one opening, or every
opening of a side) or from a personal repertoire: the board plays the opponent's moves, the
trainee must find theirs. A move from another line of the same set is pointed out, not counted
as a mistake. Lines are scheduled by Leitner boxes (`features/openings/drill.ts`): a line
played from memory without a mistake moves up a box (10 min, 1, 3, 7, 16, 35 days), any
mistake or hint sends it back to the first. Guided mode shows every move and is not recorded.
Progress is one `trainer-progress` record in the `settings` table, so no schema change.

**Review flow.** While the whole game is analyzed, the report tab is shown and the live
search on the board drops to one line at depth ≤ 14 (`useLiveAnalysis`): interactive searches
preempt the review, so a light one hands the engine back quickly. When the run completes, the
workspace moves to the moves view, on the first move out of the opening book. The move
assessment box has a fixed height (one reason, the best move and its actions) so stepping
through moves does not shift the layout; on phones the advantage chart sits between it and
the move list.

**Pages.** `/` presents the app; `/games` is the library and import; `/analysis`,
`/openings`, `/trainer`, `/learn` (lessons from `src/features/learn/lessons.ts`, bilingual data checked by
`tests/lessons.test.ts`, with exercise solutions confirmed by Stockfish) and `/settings`.

**Appearance.** Warm sand surfaces with a burnt-amber accent (light) and a dark walnut
counterpart, with a matching "Sand" board as the default. The header has a sun/moon toggle
and a gear that opens quick settings (theme, language, board, pieces, coordinates,
animations, sound) next to a playable preview board; the full settings stay at `/settings`.
The pickers are shared (`components/settings/AppearanceControls.tsx`). The home page hero
plays the Opera Game in a loop (pausable; static under reduced motion).

**Smoothness.** Live engine output is throttled (200 ms), the game review is recomputed only
when the main line changes, heavy panels (board, move list, graph, report) are memoized with
stable props, and the evaluation bar animates a GPU `transform` instead of its height. Move
sounds are short Web Audio tones generated on the fly (`lib/sound.ts`), so no audio files
are shipped.

**Routing.** Saved games open at `/analysis?game=<id>` (a query parameter rather than a dynamic
segment) so every route is prerendered and precached for offline use.

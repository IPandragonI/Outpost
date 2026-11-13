# Move classification

Implementation: `src/features/classification/` (`classify-move.ts`, `classification-rules.ts`,
`material.ts`, `game-review.ts`, `explain.ts`). Pure functions, covered by
`tests/classification.test.ts` (rules on exact numbers) and
`tests/classification-engine.test.ts` (reference games reviewed with the real engine).

## Inputs

For a move played in position P by the mover M, reaching position Q:

- the analysis of P (MultiPV 2 during whole-game analysis): best move, best score, score of
  the next best move;
- the analysis of Q: the opponent's best reply line;
- whether Q is in the opening dataset, the number of legal moves in P, and the loss of the
  opponent's previous move.

The played move's score is taken from the same search as the best move when it is one of the
MultiPV lines, so both numbers are directly comparable; otherwise from the search of Q.

Book positions (between two book moves) are searched at depth 10 during whole-game
analysis: book moves are labelled from theory, and a book move never counts as the
opponent's error for the Miss rule.

## Expected-points loss

Scores become M's winning chances with the logistic curve published by lichess,
`W(cp) = 1 / (1 + e^(−0.00368208·cp))`, centipawns clamped to ±1000, mates 0 or 1. The loss is
`max(0, W(best) − W(played))`. The curve flattens, so the same centipawn loss weighs much more
in a balanced position than in a decided one (+0.3 → −2.7 loses about 26 points, +9 → +6 about 6).

| Loss                                       | Label      |
| ------------------------------------------ | ---------- |
| engine's move, or a score at least as good | Best       |
| ≤ 2%                                       | Excellent  |
| ≤ 5%                                       | Good       |
| ≤ 10%                                      | Inaccuracy |
| ≤ 20%                                      | Mistake    |
| > 20%                                      | Blunder    |

The bands follow the thresholds Chess.com describes publicly for its game review. They live in
`DEFAULT_RULES` and are configurable.

## Special labels

Checked in this order:

1. **Forced** — the only legal move.
2. **Book** — the resulting position is in the opening dataset, while the game is still within
   the dataset's lines.
3. **Miss** — would be a mistake or blunder, but the opponent's previous move lost ≥ 10%, the
   best move kept a winning position (≥ 75%), and the move did not lose the game (≥ 30%
   remains): the error was not punished, rather than the game thrown away.
4. **Brilliant** — best or excellent, and a sacrifice: after the move the opponent can win at
   least 2 pawns of material from a non-pawn piece, measured by static exchange evaluation
   (legal recaptures, so pins and x-rays count) minus what the move captured; the mover keeps
   ≥ 45%; and no alternative keeps ≥ 90% (not "winning anyway"). Both searches at depth ≥ 12.
5. **Great** — the engine's move; the second best loses ≥ 15% and falls into a worse outcome
   band (winning ≥ 75% / balanced / losing ≤ 25%); the mover keeps ≥ 40%; at least three legal
   moves; not a checkmate, nor a capture that simply wins material or recaptures. Depth ≥ 12.

Flags explain verdicts: `allows-mate`, `missed-mate`, `slower-mate` (a longer but still forced
mate is not punished), `sacrifice`, `only-move`, `low-confidence` (depth < 10).

## Precision

Per move: `103.1668·e^(−0.04354·loss%) − 3.1669`, clamped to 0–100 (the curve lichess publishes
for its accuracy). Per player: the mean of the arithmetic and harmonic means of their moves'
scores, book and forced moves excluded. This is Outpost's own metric, not Chess.com's accuracy.

## Benchmark and limits

The reference corpus (`tests/classification-engine.test.ts`, depth 14) pins behaviour that does
not depend on exact numbers:

- Opera Game (Morphy, 1858): 13.Rxd7 and 16.Qb8+ Brilliant; 9…b5 an error; 16…Nxb8 Forced;
  17.Rd8# Best; opening moves Book; White's precision above Black's.
- Scholar's mate: 3…Nf6 a Blunder flagged `allows-mate`, with a defending move as best.

No agreement rate against Chess.com has been measured: its classifications are proprietary and
no licensed set of its annotations is available, so **no parity is claimed**. Differences are
expected from the engine build (the browser lite network is weaker than server Stockfish),
search depth and variance (multi-threaded search is not deterministic), the win-chance curve,
and Chess.com's undisclosed rules, especially for Brilliant, Great and Miss. Shallow presets
make special labels rarer (and can mislabel moves beyond the search horizon); the review says
when the analysis is partial.

To extend the benchmark, add annotated games to `tests/fixtures` with assertions on moves whose
verdict is unambiguous.

## Phases, estimated level and mistake themes

- **Phases.** Each move belongs to the opening (while the game follows the opening book, and
  for the first ten moves), the endgame (six pieces or fewer besides pawns and kings) or the
  middlegame in between; a game never goes back to an earlier phase. Precision is computed
  per phase over the judged moves (book and forced moves are left out).
- **Estimated level.** `3100·e^(−0.01·ACPL)`, rounded to 50 and clamped to 400–3000, from the
  average centipawn loss, with at least eight judged moves. It is a rule of thumb that tells
  how close the moves were to the engine's, not a rating, and it is shown as such.
- **Themes** (`src/features/classification/themes.ts`). For inaccuracies, mistakes, misses
  and blunders, from the engine's lines only: a piece left hanging (static exchange of the
  best capture, and the engine's reply is that capture), a capture that wins material that
  was not played, a fork allowed or missed (a move whose piece attacks two or more pieces
  worth winning, a check counting as one), mate allowed or missed, and a winning advantage
  thrown away (chances ≥ 70 % before, < 55 % after). Themes are heuristics: a move can have
  several, or none.

## One analysis, opened on request

A game opened from the library or from Chess.com is analyzed at once, at the preset chosen in
the settings, and the whole game is analyzed (there is no separate quick pass). While it runs,
the start screen shows the numbers as they come: the advantage chart, each player's precision
and the move table. Its button, "Démarrer le bilan", stays disabled until the analysis is
complete; pressing it only opens the detailed review (the three tabs) from the results already
computed and starts nothing. Changing the depth on that screen restarts the analysis, reusing
positions already analyzed at least as deep. A game that already has stored results opens the
detailed review directly.

## Analysis speed: what was measured

`pnpm bench` (tests/analysis-bench.test.ts) runs the same game with the real engine, 12 cores,
Standard preset (depth 16, two lines), and compares configurations by time, by nodes searched
(the engine's work, which does not depend on how busy the machine is) and by agreement of the
verdicts. Results on the "immortal" fixture:

- **Helper layout (kept).** Whole-game analysis runs on single-thread helper engines, one
  position each, and the primary engine stays free for the board. Against the older layout (a
  4-thread primary plus three helpers, all searching): 1.6 times faster (29 s against 46 s;
  60 s against 100 s on a busy machine) with 2.5 times fewer nodes, and repeatable (two runs
  gave 45 of 45 identical verdicts, where the older layout agreed with itself on 37 to 41 of
  45). The two layouts differ on about 6 of 45 verdicts. Their agreement with a depth-20
  reference could not be measured (the benchmark was stopped for lack of memory).
- **Shortcuts (kept).** SIMD is present in both Stockfish builds. Engines are loaded ahead of
  use, a position repeated in a game is searched once, and a position with one legal move is
  searched to depth 12 at most.
- **Adaptive depth, second line only where needed, early stop (not enabled).** Measured in
  nodes against the exact method, early stop halves the work but moves the verdicts well beyond
  the engine's own run-to-run noise (mean loss difference 1.9 points against 0.5); the selective
  second line also degrades them; adaptive depth alone saves about 12 % of the nodes on this
  very tactical game. None passes "faster without lower quality", so the app keeps the exact
  method (`ANALYSIS_STRATEGY` in review-pipeline.ts). The options stay in the code, off, so they
  can be measured again on other games.
- **Lichess opening evaluations (optional).** Off by default; the setting sends the position
  (FEN only) of the first moves to lichess.org and falls back to the engine on any failure.
  It was tested with a simulated service, not against the live one.

## The coach page ("Coach" tab)

The coach page (`/coach`) is built on the device from the games that were analyzed to the end. Which
side of a game is the player's comes from the saved username (the Chess.com account, or any
name typed on the page), compared without case with the PGN's White and Black.

- **Digest per game.** When an analysis completes, a compact digest (`GameSummary`: precision,
  average centipawn loss, move counts by classification, precision by phase, mistake themes,
  for both sides) is stored with the game, so the profile never rereads positions. Games
  analyzed before that are summarized once from the engine cache and the digest is saved.
- **Estimated level.** The median of the per-game estimates (see "estimated level" above) over
  the latest 20 analyzed games, rounded to 10, with the quartiles as a range and a trend (the
  median of the latest 5 games against the 5 before, from 10 games on). Under 5 games it is
  shown as provisional. It is set beside the rating found in the games' headers when there is
  one. It is a rule of thumb from how close the moves were to the engine's, not a rating.
- **Statistics.** Results by colour and by time control (Chess.com's classes, from the
  `TimeControl` header: under 3 minutes bullet, under 10 blitz, under an hour rapid), precision
  overall, by phase and in won and lost games, move classes per 100 moves, recurring mistake
  themes per game, openings by family (the part of the name before ":") for each colour with
  results and precision in the opening phase, and the precision of the latest 40 games.
- **Strengths and weaknesses.** Plain rules over those numbers, with a minimum of 3 games for
  any comparison: the weakest and strongest phase (3 points apart), the most frequent mistake
  theme, a colour scoring 15 points worse, the best and worst time control and opening
  (15 points apart), brilliant and great moves per 100 moves, blunders and misses per 100 moves.

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
- **Estimated level of a game.** From the moves played while the position was still open (the
  mover's winning chances between 10 % and 90 % with the best move) and from four measures of
  them: the rate of mistakes, blunders and missed chances, the average centipawn loss, the
  precision and the rate of outright blunders, each mapped to a level by indicative steps and
  averaged (`src/features/classification/rating-model.ts`). Rounded to 50 in the game review.
  It replaced `3100·e^(−0.01·ACPL)` over every move, which read a 600-rated player as ~1500:
  after a blunder the game is decided, and in a decided position a further blunder costs next
  to nothing on a saturating scale, so the long tail of such games diluted the average. The
  steps are rules of thumb, not fitted on a licensed dataset.
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

The coach page (`/coach`) is built on the device from the games that were analyzed to the end,
and, optionally, from the player's whole Chess.com history. Which side of a game is the player's
comes from the saved username (the Chess.com account, or any name typed on the page), compared
without case with the PGN's White and Black.

- **Digest per game.** When an analysis completes, a compact digest (`GameSummary`, version 2) is
  stored with the game: precision, average centipawn loss, move counts by classification,
  precision by phase, mistake themes, the moves played in open positions, style features (captures,
  checks, early queen, castling, book moves, endgame reached), time pressure (moves played with
  little time left, when the PGN has clocks) and the swings of the game, for both sides. Games
  analyzed before are summarized once from the engine cache.
- **Estimated level** (`features/stats/level.ts`). Two kinds of evidence are combined like two
  measurements with their uncertainty. The moves' evidence (the rating model above, with the moves
  of all the games pooled, each game weighted, less a penalty for very uneven phases and for a lot
  of time trouble) has an uncertainty that includes the scale's own (±250). The anchor is the
  Chess.com rating of the time class played most lately (±100 with 30 recent rated games), or the
  rating of the latest games, or the ratings written in the games' headers. The estimate is their
  precision-weighted mean, so the rating anchors it and the moves nudge it by what they deserve. A
  600-rated player whose moves read as ~1500 comes out near 700. Without any rating the moves
  speak alone and the page says the estimate is not anchored. An 80 % range, a trend (latest 5
  games against the 5 before, from 10 games on) and a reliability level are given.
- **Selection bias.** Analyzed games are not a fair sample (people analyze their wins, or their
  losses). With the history, the analyzed games are weighted so that their wins, draws and losses
  match the player's real record over the latest year (inverse-probability weighting on the
  result). Outcomes with no analyzed game cannot be corrected: they are named, and the moves'
  evidence is made less certain (×1.35 when the sample is clearly unrepresentative).
- **Chess.com history** (`features/chesscom/history.ts`). Read on request from the public
  archives (36 months, 4000 games at most) and stats: one small entry per game (date, time class,
  colour, result, ratings), kept on the device. Only the username is sent to api.chess.com.
- **Playing style** (`features/stats/style.ts`). Five scores from 0 to 100 (aggressive and
  tactical, positional and solid, chaotic, endgame-minded, theory-driven) built from captures and
  checks per 100 moves, game length, swings per game, brilliant and great moves, blunders in open
  positions, games reaching the endgame and book moves, each compared with rough club norms; the
  top one is the style when it reaches 58, otherwise "balanced". Habits are read from the same
  games: fading or finishing strong, time trouble and how errors rise under it, early castling, a
  king left in the centre, an early queen.
- **Habits over all the games** (`features/stats/behavior.ts`, needs the history): the score right
  after a loss against the overall score (a drop of 10 points or more over 15 games or more is
  flagged), and the best and worst part of the day (10 games or more in each).
- **Other statistics.** Results by colour and by time control (Chess.com's classes), precision
  overall, by phase and in won and lost games, move classes per 100 moves, recurring mistake
  themes per game, openings by family with results and precision in the opening phase, the
  precision of the latest 40 games, and strengths and weaknesses from plain rules over these
  numbers (a minimum of 3 games for any comparison).

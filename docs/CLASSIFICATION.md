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

| Loss | Label |
| --- | --- |
| engine's move, or a score at least as good | Best |
| ≤ 2% | Excellent |
| ≤ 5% | Good |
| ≤ 10% | Inaccuracy |
| ≤ 20% | Mistake |
| > 20% | Blunder |

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

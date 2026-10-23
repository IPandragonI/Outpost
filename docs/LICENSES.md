# Licenses and provenance

Outpost is distributed under **GPL-3.0-or-later** (`LICENSE`). Whoever distributes it must also
provide its complete corresponding source code.

| Component | Use | License | Source |
| --- | --- | --- | --- |
| Stockfish 19 | engine | GPL-3.0 | https://github.com/official-stockfish/Stockfish |
| stockfish.js 19.0.1 (npm `stockfish`) | WebAssembly builds (lite NNUE) | GPL-3.0 | https://github.com/nmrugg/stockfish.js |
| lichess-org/chess-openings | opening names, ECO codes, lines (`data/openings`) | CC0-1.0 | https://github.com/lichess-org/chess-openings |
| cburnett pieces | "Classic" piece set | GPL-2.0-or-later | Colin M.L. Burnett, via lichess-org/lila |
| merida pieces | piece set | GPL-2.0-or-later | Armando Hernandez Marroquin, via lichess-org/lila |
| chessnut pieces | piece set | Apache-2.0 | https://github.com/LexLuengas/chessnut-pieces |
| fantasy, spatial, celtic pieces | piece sets | MIT | Maurizio Monge, via lichess-org/lila |
| chess.js | rules, SAN, FEN | BSD-2-Clause | https://github.com/jhlywa/chess.js |
| react-chessboard | board component (its bundled pieces are not used) | MIT | https://github.com/Clariity/react-chessboard |
| Next.js, React | framework | MIT | |
| Tailwind CSS, daisyUI | styling | MIT | |
| Dexie.js | IndexedDB | Apache-2.0 | |
| Recharts | evaluation graph | MIT | |
| Zustand | state | MIT | |
| Serwist | service worker | MIT | |
| lucide-react | icons | ISC | |
| IBM Plex Sans and Mono | fonts, self-hosted by next/font | OFL-1.1 | |

Games fetched from Chess.com come from its public published-data API at the user's request;
Outpost is not affiliated with Chess.com and uses none of its branding.

Piece-set licenses were checked against lichess's `COPYING.md`. The opening dataset contains
named lines only, no game records. No Chess.com asset is used; the classification is an
independent implementation documented in `CLASSIFICATION.md`.

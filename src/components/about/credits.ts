import type { MessageKey } from "@/lib/i18n/translate";

/** Third-party components and data, with their licenses (see docs/LICENSES.md). */
export const CREDITS: { name: string; what: MessageKey; license: string; url: string }[] = [
  {
    name: "Stockfish 19",
    what: "credit.stockfish",
    license: "GPL-3.0",
    url: "https://github.com/official-stockfish/Stockfish",
  },
  {
    name: "Stockfish.js",
    what: "credit.stockfishjs",
    license: "GPL-3.0",
    url: "https://github.com/nmrugg/stockfish.js",
  },
  {
    name: "chess-openings",
    what: "credit.openings",
    license: "CC0-1.0",
    url: "https://github.com/lichess-org/chess-openings",
  },
  {
    name: "cburnett",
    what: "credit.cburnett",
    license: "GPL-2.0-or-later",
    url: "https://en.wikipedia.org/wiki/User:Cburnett/GFDL_images/Chess",
  },
  {
    name: "Merida",
    what: "credit.merida",
    license: "GPL-2.0-or-later",
    url: "https://github.com/lichess-org/lila/blob/master/COPYING.md",
  },
  {
    name: "Chessnut",
    what: "credit.chessnut",
    license: "Apache-2.0",
    url: "https://github.com/LexLuengas/chessnut-pieces",
  },
  {
    name: "chess.js",
    what: "credit.chessjs",
    license: "BSD-2-Clause",
    url: "https://github.com/jhlywa/chess.js",
  },
  {
    name: "react-chessboard",
    what: "credit.board",
    license: "MIT",
    url: "https://github.com/Clariity/react-chessboard",
  },
  { name: "Dexie.js", what: "credit.dexie", license: "Apache-2.0", url: "https://dexie.org" },
  { name: "Recharts", what: "credit.recharts", license: "MIT", url: "https://recharts.org" },
  { name: "Next.js, React", what: "credit.next", license: "MIT", url: "https://nextjs.org" },
  {
    name: "Tailwind CSS, daisyUI",
    what: "credit.styles",
    license: "MIT",
    url: "https://daisyui.com",
  },
  { name: "Serwist", what: "credit.serwist", license: "MIT", url: "https://serwist.pages.dev" },
  { name: "Lucide", what: "credit.icons", license: "ISC", url: "https://lucide.dev" },
  {
    name: "Zustand",
    what: "credit.state",
    license: "MIT",
    url: "https://github.com/pmndrs/zustand",
  },
  {
    name: "IBM Plex",
    what: "credit.fonts",
    license: "OFL-1.1",
    url: "https://github.com/IBM/plex",
  },
];

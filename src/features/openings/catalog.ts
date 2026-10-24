import type { Localized } from "@/features/learn/lessons";

/**
 * Curated openings for the openings page: the common choices for each side, with their
 * main line and key variations. Every line is checked by tests/catalog.test.ts (legal
 * moves, and present in the lichess opening dataset).
 */

export interface OpeningLine {
  name: Localized;
  /** SAN from the initial position. */
  moves: string[];
  note: Localized;
}

export interface CatalogOpening {
  id: string;
  /** The side that chooses this opening. */
  side: "white" | "black";
  name: Localized;
  eco: string;
  summary: Localized;
  /** Plies that define the opening (shown on its card). */
  keyPlies: number;
  /** Main line first. */
  lines: OpeningLine[];
  /**
   * A set-up played against almost anything rather than a tree of named variations: the
   * dataset names only its first moves.
   */
  system?: boolean;
}

const l = (fr: string, en: string): Localized => ({ fr, en });
const m = (moves: string) => moves.split(" ");

export const CATALOG: CatalogOpening[] = [
  // White
  {
    id: "italian",
    side: "white",
    name: l("Partie italienne", "Italian Game"),
    eco: "C50–C54",
    summary: l(
      "Le fou vise f7 dès le troisième coup : un développement rapide et naturel, idéal pour apprendre.",
      "The bishop eyes f7 from move three: fast, natural development, ideal for learning.",
    ),
    keyPlies: 5,
    lines: [
      {
        name: l("Giuoco Piano", "Giuoco Piano"),
        moves: m("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+"),
        note: l(
          "Les Blancs construisent un centre avec c3 et d4 ; les Noirs le contestent aussitôt.",
          "White builds a centre with c3 and d4; Black challenges it at once.",
        ),
      },
      {
        name: l("Giuoco Pianissimo", "Giuoco Pianissimo"),
        moves: m("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O"),
        note: l(
          "Une version lente et manœuvrière, très prisée au plus haut niveau.",
          "A slow, manoeuvring version, very popular at the highest level.",
        ),
      },
      {
        name: l("Défense des deux cavaliers", "Two Knights Defence"),
        moves: m("e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O"),
        note: l(
          "Les Noirs contre-attaquent e4 au lieu de développer le fou.",
          "Black counterattacks e4 instead of developing the bishop.",
        ),
      },
      {
        name: l("Gambit Evans", "Evans Gambit"),
        moves: m("e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4"),
        note: l(
          "Un pion sacrifié pour gagner du temps et un grand centre.",
          "A pawn sacrificed for time and a big centre.",
        ),
      },
    ],
  },
  {
    id: "ruy-lopez",
    side: "white",
    name: l("Partie espagnole", "Ruy Lopez"),
    eco: "C60–C99",
    summary: l(
      "Le fou presse le cavalier qui défend e5 : une pression durable, au cœur de la théorie depuis des siècles.",
      "The bishop presses the knight that defends e5: lasting pressure, at the heart of theory for centuries.",
    ),
    keyPlies: 5,
    lines: [
      {
        name: l("Variante fermée", "Closed Variation"),
        moves: m("e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3"),
        note: l(
          "La ligne principale : les deux camps se préparent pour une longue bataille de manœuvres.",
          "The main line: both sides prepare for a long manoeuvring battle.",
        ),
      },
      {
        name: l("Défense berlinoise", "Berlin Defence"),
        moves: m("e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8"),
        note: l(
          "Le « mur de Berlin » : une partie sans dames, très solide pour les Noirs.",
          "The “Berlin Wall”: a queenless middlegame, very solid for Black.",
        ),
      },
      {
        name: l("Variante d’échange", "Exchange Variation"),
        moves: m("e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6"),
        note: l(
          "Les Blancs abîment la structure noire et visent la finale.",
          "White damages Black’s pawns and aims for the endgame.",
        ),
      },
      {
        name: l("Attaque Marshall", "Marshall Attack"),
        moves: m(
          "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5 Nxe5 Nxe5 Rxe5 c6",
        ),
        note: l(
          "Un pion sacrifié par les Noirs pour une attaque sur le roi blanc.",
          "Black sacrifices a pawn for an attack on the White king.",
        ),
      },
    ],
  },
  {
    id: "queens-gambit",
    side: "white",
    name: l("Gambit dame", "Queen’s Gambit"),
    eco: "D06–D69",
    summary: l(
      "Le pion c4 propose un échange pour gagner le centre : la base des ouvertures du pion dame.",
      "The c4 pawn offers a trade to win the centre: the backbone of queen’s pawn openings.",
    ),
    keyPlies: 3,
    lines: [
      {
        name: l("Gambit dame refusé", "Queen’s Gambit Declined"),
        moves: m("d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3"),
        note: l(
          "Les Noirs maintiennent leur pion d5 et se développent solidement.",
          "Black keeps the d5 pawn and develops solidly.",
        ),
      },
      {
        name: l("Gambit dame accepté", "Queen’s Gambit Accepted"),
        moves: m("d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6"),
        note: l(
          "Les Noirs prennent le pion puis frappent le centre avec c5.",
          "Black takes the pawn, then hits the centre with c5.",
        ),
      },
      {
        name: l("Variante d’échange", "Exchange Variation"),
        moves: m("d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6"),
        note: l(
          "Une structure claire, avec souvent l’attaque de minorité des Blancs.",
          "A clear structure, often with White’s minority attack.",
        ),
      },
      {
        name: l("Défense Tarrasch", "Tarrasch Defence"),
        moves: m("d4 d5 c4 e6 Nc3 c5 cxd5 exd5 Nf3 Nc6 g3 Nf6 Bg2 Be7"),
        note: l(
          "Les Noirs acceptent un pion isolé pour un jeu de pièces libre.",
          "Black accepts an isolated pawn for free piece play.",
        ),
      },
    ],
  },
  {
    id: "london",
    side: "white",
    system: true,
    name: l("Système de Londres", "London System"),
    eco: "D02, A46",
    summary: l(
      "Un schéma fixe (d4, Ff4, e3, c3) qui se joue contre presque tout : peu de théorie à apprendre.",
      "A set-up (d4, Bf4, e3, c3) played against almost anything: little theory to learn.",
    ),
    keyPlies: 1,
    lines: [
      {
        name: l("Contre …d5", "Against …d5"),
        moves: m("d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3"),
        note: l(
          "Le fou f4 sort avant e3 ; les Blancs gardent une structure solide.",
          "The bishop comes to f4 before e3; White keeps a solid structure.",
        ),
      },
      {
        name: l("Contre l’est-indienne", "Against the King’s Indian set-up"),
        moves: m("d4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3"),
        note: l(
          "Même schéma ; h3 garde une case de retraite au fou.",
          "Same set-up; h3 keeps a retreat square for the bishop.",
        ),
      },
    ],
  },
  {
    id: "english",
    side: "white",
    name: l("Ouverture anglaise", "English Opening"),
    eco: "A10–A39",
    summary: l(
      "c4 contrôle d5 depuis le flanc : une partie souple, souvent de structure sicilienne inversée.",
      "c4 controls d5 from the side: a flexible game, often a reversed Sicilian.",
    ),
    keyPlies: 1,
    lines: [
      {
        name: l("Sicilienne inversée", "Reversed Sicilian"),
        moves: m("c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6"),
        note: l(
          "Une sicilienne avec un temps de plus pour les Blancs.",
          "A Sicilian with an extra tempo for White.",
        ),
      },
      {
        name: l("Variante symétrique", "Symmetrical Variation"),
        moves: m("c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3"),
        note: l(
          "Les deux camps font un fianchetto et luttent pour la case d5.",
          "Both sides fianchetto and fight for d5.",
        ),
      },
      {
        name: l("Quatre cavaliers", "Four Knights"),
        moves: m("c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6"),
        note: l(
          "Une sicilienne inversée avec un temps de plus pour les Blancs.",
          "A reversed Sicilian with an extra tempo for White.",
        ),
      },
    ],
  },
  {
    id: "scotch",
    side: "white",
    name: l("Partie écossaise", "Scotch Game"),
    eco: "C44–C45",
    summary: l(
      "d4 ouvre le centre dès le troisième coup : un jeu ouvert et direct.",
      "d4 opens the centre on move three: open, direct play.",
    ),
    keyPlies: 5,
    lines: [
      {
        name: l("Variante Mieses", "Mieses Variation"),
        moves: m("e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4"),
        note: l(
          "La ligne principale moderne : les Blancs gagnent de l’espace avec e5 et c4.",
          "The modern main line: White gains space with e5 and c4.",
        ),
      },
      {
        name: l("Variante classique", "Classical Variation"),
        moves: m("e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7"),
        note: l(
          "Les Noirs mettent la pression sur le cavalier d4.",
          "Black puts pressure on the d4 knight.",
        ),
      },
    ],
  },
  {
    id: "kings-gambit",
    side: "white",
    name: l("Gambit du roi", "King’s Gambit"),
    eco: "C30–C39",
    summary: l(
      "f4 sacrifie un pion pour ouvrir la colonne f : l’ouverture romantique par excellence.",
      "f4 sacrifices a pawn to open the f-file: the romantic opening par excellence.",
    ),
    keyPlies: 3,
    lines: [
      {
        name: l("Gambit accepté, Kieseritzky", "Accepted, Kieseritzky"),
        moves: m("e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5"),
        note: l(
          "Les Blancs attaquent la chaîne de pions noirs avec h4.",
          "White attacks Black’s pawn chain with h4.",
        ),
      },
      {
        name: l("Gambit refusé", "Declined"),
        moves: m("e4 e5 f4 Bc5 Nf3 d6 c3"),
        note: l(
          "Le fou c5 empêche le petit roque blanc : les Noirs refusent le cadeau.",
          "The c5 bishop stops White from castling: Black declines the gift.",
        ),
      },
    ],
  },

  {
    id: "vienna",
    side: "white",
    name: l("Partie viennoise", "Vienna Game"),
    eco: "C25–C29",
    summary: l(
      "Cc3 avant Cf3 garde la poussée f4 en réserve : un jeu ouvert et vif.",
      "Nc3 before Nf3 keeps the f4 push in reserve: open, lively play.",
    ),
    keyPlies: 3,
    lines: [
      {
        name: l("Gambit viennois", "Vienna Gambit"),
        moves: m("e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7"),
        note: l(
          "f4 ouvre la colonne f ; les Noirs répliquent au centre avec d5.",
          "f4 opens the f-file; Black answers in the centre with d5.",
        ),
      },
      {
        name: l("Variante Mieses (g3)", "Mieses Variation (g3)"),
        moves: m("e4 e5 Nc3 Nf6 g3 d5 exd5 Nxd5 Bg2 Nxc3 bxc3 Bd6"),
        note: l(
          "Le fou en fianchetto vise la grande diagonale ; jeu positionnel.",
          "The fianchettoed bishop eyes the long diagonal; positional play.",
        ),
      },
      {
        name: l("Variante Frankenstein-Dracula", "Frankenstein-Dracula Variation"),
        moves: m("e4 e5 Nc3 Nf6 Bc4 Nxe4 Qh5 Nd6 Bb3 Nc6 Nb5 g6 Qf3 f5"),
        note: l(
          "Une ligne folle : les Noirs gagnent du matériel mais doivent survivre à l’attaque.",
          "A wild line: Black wins material but must survive the attack.",
        ),
      },
    ],
  },
  {
    id: "catalan",
    side: "white",
    name: l("Catalane", "Catalan Opening"),
    eco: "E00–E09",
    summary: l(
      "Gambit dame et fianchetto du roi réunis : une pression durable sur la grande diagonale.",
      "Queen’s Gambit plus a kingside fianchetto: lasting pressure on the long diagonal.",
    ),
    keyPlies: 5,
    lines: [
      {
        name: l("Catalane ouverte", "Open Catalan"),
        moves: m("d4 Nf6 c4 e6 g3 d5 Bg2 dxc4 Nf3 Be7 O-O O-O Qc2 a6"),
        note: l(
          "Les Noirs prennent c4 ; les Blancs le récupèrent en gardant l’initiative.",
          "Black takes on c4; White wins it back while keeping the initiative.",
        ),
      },
      {
        name: l("Catalane fermée", "Closed Catalan"),
        moves: m("d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O Nbd7 Qc2 c6"),
        note: l(
          "Les Noirs tiennent d5 et préparent e5 ou b6.",
          "Black holds d5 and prepares e5 or b6.",
        ),
      },
    ],
  },
  {
    id: "reti",
    side: "white",
    name: l("Ouverture Réti", "Réti Opening"),
    eco: "A04–A09",
    summary: l(
      "Cf3 puis c4 attaque le centre de loin : une ouverture souple et hypermoderne.",
      "Nf3 then c4 attacks the centre from afar: a flexible, hypermodern opening.",
    ),
    keyPlies: 3,
    lines: [
      {
        name: l("Réti principale", "Main Line"),
        moves: m("Nf3 d5 c4 e6 g3 Nf6 Bg2 Be7 O-O O-O b3 c5"),
        note: l(
          "Deux fianchettos possibles ; les Blancs pressent d5 sans l’occuper.",
          "Two possible fianchettoes; White presses d5 without occupying it.",
        ),
      },
      {
        name: l(
          "Variante d’avance, gambit Blumenfeld inversé",
          "Advance Variation, Reversed Blumenfeld Gambit",
        ),
        moves: m("Nf3 d5 c4 d4 e3 c5 b4 cxb4 a3"),
        note: l(
          "Les Noirs gagnent de l’espace avec d4 ; les Blancs sacrifient b4 pour miner le centre.",
          "Black gains space with d4; White gives the b-pawn to undermine the centre.",
        ),
      },
    ],
  },

  // Black
  {
    id: "sicilian",
    side: "black",
    name: l("Défense sicilienne", "Sicilian Defence"),
    eco: "B20–B99",
    summary: l(
      "c5 conteste d4 sans symétrie : la réponse la plus combative à 1.e4.",
      "c5 fights for d4 without symmetry: the most combative answer to 1.e4.",
    ),
    keyPlies: 2,
    lines: [
      {
        name: l("Najdorf", "Najdorf"),
        moves: m("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6"),
        note: l(
          "Le petit coup a6 prépare e5 ou b5 : la sicilienne de Fischer et Kasparov.",
          "The little move a6 prepares e5 or b5: the Sicilian of Fischer and Kasparov.",
        ),
      },
      {
        name: l("Dragon", "Dragon"),
        moves: m("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6"),
        note: l(
          "Le fou en fianchetto souffle sur la grande diagonale ; roques opposés et attaques mutuelles.",
          "The fianchettoed bishop breathes on the long diagonal; opposite castling and mutual attacks.",
        ),
      },
      {
        name: l("Sveshnikov", "Sveshnikov"),
        moves: m("e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5"),
        note: l(
          "Les Noirs acceptent une faiblesse en d5 contre une grande activité.",
          "Black accepts a weak d5 square in exchange for great activity.",
        ),
      },
      {
        name: l("Variante Alapine (c3)", "Alapin Variation (c3)"),
        moves: m("e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6"),
        note: l(
          "La réponse anti-sicilienne la plus courante : les Blancs préparent d4.",
          "The most common anti-Sicilian: White prepares d4.",
        ),
      },
      {
        name: l("Taimanov", "Taimanov"),
        moves: m("e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 Qd2 Nf6"),
        note: l(
          "Les Noirs gardent une structure souple et visent les cases noires.",
          "Black keeps a flexible structure and aims at the dark squares.",
        ),
      },
      {
        name: l("Variante Rossolimo", "Rossolimo Variation"),
        moves: m("e4 c5 Nf3 Nc6 Bb5 g6 O-O Bg7 Re1 Nf6"),
        note: l(
          "Les Blancs évitent la théorie du centre ouvert et visent une structure abîmée.",
          "White avoids Open Sicilian theory and targets Black’s structure.",
        ),
      },
      {
        name: l("Sicilienne fermée", "Closed Sicilian"),
        moves: m("e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6"),
        note: l(
          "Pas de d4 : une partie lente où les Blancs préparent f4.",
          "No d4: a slow game in which White prepares f4.",
        ),
      },
    ],
  },
  {
    id: "french",
    side: "black",
    name: l("Défense française", "French Defence"),
    eco: "C00–C19",
    summary: l(
      "e6 puis d5 : une chaîne de pions solide, au prix d’un fou c8 souvent enfermé.",
      "e6 then d5: a solid pawn chain, at the cost of an often locked-in c8 bishop.",
    ),
    keyPlies: 4,
    lines: [
      {
        name: l("Winawer", "Winawer"),
        moves: m("e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7"),
        note: l(
          "Les Noirs doublent les pions blancs mais cèdent leur bon fou.",
          "Black doubles White’s pawns but gives up the good bishop.",
        ),
      },
      {
        name: l("Variante d’avance", "Advance Variation"),
        moves: m("e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6"),
        note: l(
          "Les Noirs attaquent la base de la chaîne blanche, d4.",
          "Black attacks the base of White’s chain, d4.",
        ),
      },
      {
        name: l("Variante classique", "Classical Variation"),
        moves: m("e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7"),
        note: l(
          "Échange des fous de cases noires, puis lutte autour de la chaîne de pions.",
          "Dark-squared bishops come off, then the fight centres on the pawn chain.",
        ),
      },
      {
        name: l("Tarrasch", "Tarrasch"),
        moves: m("e4 e6 d4 d5 Nd2 c5 exd5 exd5"),
        note: l(
          "Les Noirs acceptent un pion isolé en échange d’un jeu actif.",
          "Black accepts an isolated pawn in return for active play.",
        ),
      },
    ],
  },
  {
    id: "caro-kann",
    side: "black",
    name: l("Défense Caro-Kann", "Caro-Kann Defence"),
    eco: "B10–B19",
    summary: l(
      "c6 prépare d5 en gardant le fou c8 libre : solide et sain.",
      "c6 prepares d5 while keeping the c8 bishop free: solid and sound.",
    ),
    keyPlies: 4,
    lines: [
      {
        name: l("Variante classique", "Classical Variation"),
        moves: m("e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7"),
        note: l(
          "Le fou sort avant e6 ; les Blancs gagnent de l’espace à l’aile roi.",
          "The bishop comes out before e6; White gains space on the kingside.",
        ),
      },
      {
        name: l("Variante d’avance", "Advance Variation"),
        moves: m("e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5"),
        note: l(
          "Comme dans la française, mais avec le fou déjà sorti.",
          "As in the French, but with the bishop already out.",
        ),
      },
      {
        name: l("Variante d’échange", "Exchange Variation"),
        moves: m("e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4"),
        note: l(
          "Une structure symétrique ; les Noirs développent le fou c8 avant e6.",
          "A symmetrical structure; Black develops the c8 bishop before e6.",
        ),
      },
      {
        name: l("Attaque Panov", "Panov Attack"),
        moves: m("e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7"),
        note: l(
          "Les Blancs acceptent un pion isolé en échange d’un jeu actif.",
          "White accepts an isolated pawn for active play.",
        ),
      },
    ],
  },
  {
    id: "scandinavian",
    side: "black",
    name: l("Défense scandinave", "Scandinavian Defence"),
    eco: "B01",
    summary: l(
      "d5 attaque e4 dès le premier coup : simple à jouer, avec une structure claire.",
      "d5 hits e4 on move one: simple to play, with a clear structure.",
    ),
    keyPlies: 2,
    lines: [
      {
        name: l("Variante principale (Da5)", "Main Line (Qa5)"),
        moves: m("e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5"),
        note: l(
          "La dame sort tôt mais trouve un abri en a5.",
          "The queen comes out early but finds shelter on a5.",
        ),
      },
      {
        name: l("Variante moderne (Cf6)", "Modern Variation (Nf6)"),
        moves: m("e4 d5 exd5 Nf6 d4 Nxd5"),
        note: l(
          "Les Noirs reprennent avec le cavalier pour éviter les pertes de temps de la dame.",
          "Black recaptures with the knight to avoid losing time with the queen.",
        ),
      },
      {
        name: l("Variante Dd6", "Qd6 Variation"),
        moves: m("e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 a6"),
        note: l(
          "La dame recule vers une case plus sûre ; plan solide et moderne.",
          "The queen retreats to a safer square; a solid, modern plan.",
        ),
      },
    ],
  },
  {
    id: "kings-indian",
    side: "black",
    name: l("Défense est-indienne", "King’s Indian Defence"),
    eco: "E60–E99",
    summary: l(
      "Les Noirs laissent le centre aux Blancs puis l’attaquent : un jeu riche et dynamique.",
      "Black lets White take the centre, then attacks it: rich, dynamic play.",
    ),
    keyPlies: 4,
    lines: [
      {
        name: l("Variante classique", "Classical Variation"),
        moves: m("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7"),
        note: l(
          "Centre bloqué : les Blancs attaquent à l’aile dame, les Noirs à l’aile roi.",
          "Locked centre: White attacks on the queenside, Black on the kingside.",
        ),
      },
      {
        name: l("Variante Sämisch", "Sämisch Variation"),
        moves: m("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5 d5 Nh5"),
        note: l(
          "f3 bétonne e4 et prépare une attaque à l’aile roi.",
          "f3 cements e4 and prepares a kingside attack.",
        ),
      },
      {
        name: l("Variante du fianchetto", "Fianchetto Variation"),
        moves: m("d4 Nf6 c4 g6 Nf3 Bg7 g3 O-O Bg2 d6 O-O Nbd7 Nc3 e5"),
        note: l(
          "Les Blancs opposent leur propre fou à la grande diagonale.",
          "White meets the long-diagonal bishop with one of their own.",
        ),
      },
    ],
  },
  {
    id: "nimzo-indian",
    side: "black",
    name: l("Défense nimzo-indienne", "Nimzo-Indian Defence"),
    eco: "E20–E59",
    summary: l(
      "Fb4 cloue le cavalier c3 et contrôle e4 : l’une des défenses les plus respectées contre 1.d4.",
      "Bb4 pins the c3 knight and controls e4: one of the most respected defences to 1.d4.",
    ),
    keyPlies: 6,
    lines: [
      {
        name: l("Variante classique (Dc2)", "Classical Variation (Qc2)"),
        moves: m("d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3"),
        note: l(
          "Les Blancs évitent les pions doublés en reprenant avec la dame.",
          "White avoids doubled pawns by recapturing with the queen.",
        ),
      },
      {
        name: l("Variante Rubinstein (e3)", "Rubinstein Variation (e3)"),
        moves: m("d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5"),
        note: l(
          "Un développement simple, puis la lutte pour le centre.",
          "Simple development, then the fight for the centre.",
        ),
      },
    ],
  },
  {
    id: "slav",
    side: "black",
    name: l("Défense slave", "Slav Defence"),
    eco: "D10–D19",
    summary: l(
      "c6 soutient d5 sans enfermer le fou c8 : la réponse solide au gambit dame.",
      "c6 supports d5 without locking in the c8 bishop: the solid answer to the Queen’s Gambit.",
    ),
    keyPlies: 4,
    lines: [
      {
        name: l("Variante principale", "Main Line"),
        moves: m("d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4"),
        note: l(
          "Les Noirs prennent c4, sortent le fou, puis rendent le pion.",
          "Black takes on c4, develops the bishop, then gives the pawn back.",
        ),
      },
      {
        name: l("Variante d’échange", "Exchange Variation"),
        moves: m("d4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Bf4 Nc6 e3 Bf5"),
        note: l(
          "Symétrique et calme : les Noirs copient le développement blanc.",
          "Symmetrical and quiet: Black mirrors White’s development.",
        ),
      },
      {
        name: l("Semi-slave (Merano)", "Semi-Slav (Meran)"),
        moves: m("d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5"),
        note: l(
          "e6 et c6 ensemble : les Noirs prennent c4 puis gagnent du temps avec b5.",
          "e6 and c6 together: Black takes on c4, then gains time with b5.",
        ),
      },
    ],
  },
  {
    id: "petrov",
    side: "black",
    name: l("Défense russe (Petrov)", "Petrov Defence"),
    eco: "C42–C43",
    summary: l(
      "Cf6 contre-attaque e4 au lieu de défendre e5 : symétrique et très solide.",
      "Nf6 counterattacks e4 instead of defending e5: symmetrical and very solid.",
    ),
    keyPlies: 4,
    lines: [
      {
        name: l("Variante classique", "Classical Variation"),
        moves: m("e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3"),
        note: l(
          "Attention au piège : 3…Cxe4 ? 4.De2 coûte du matériel. On joue d’abord 3…d6.",
          "Beware the trap: 3…Nxe4? 4.Qe2 costs material. First comes 3…d6.",
        ),
      },
      {
        name: l("Attaque Steinitz (3.d4)", "Steinitz Attack (3.d4)"),
        moves: m("e4 e5 Nf3 Nf6 d4 Nxe4 Bd3 d5 Nxe5 Nd7"),
        note: l(
          "Les Blancs ouvrent le centre tout de suite ; les Noirs défient le cavalier e5.",
          "White opens the centre at once; Black challenges the e5 knight.",
        ),
      },
    ],
  },
  {
    id: "pirc",
    side: "black",
    name: l("Défense Pirc", "Pirc Defence"),
    eco: "B07–B09",
    summary: l(
      "Les Noirs laissent le centre aux Blancs pour mieux l’attaquer ensuite.",
      "Black lets White build a centre, the better to attack it later.",
    ),
    keyPlies: 4,
    lines: [
      {
        name: l("Attaque autrichienne", "Austrian Attack"),
        moves: m("e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Bd3 Na6"),
        note: l(
          "Trois pions au centre : les Blancs attaquent, les Noirs contrent.",
          "Three pawns in the centre: White attacks, Black counters.",
        ),
      },
      {
        name: l("Variante classique", "Classical Variation"),
        moves: m("e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6"),
        note: l(
          "Développement calme ; les Noirs préparent b5 ou e5.",
          "Calm development; Black prepares b5 or e5.",
        ),
      },
    ],
  },
  {
    id: "alekhine",
    side: "black",
    name: l("Défense Alekhine", "Alekhine’s Defence"),
    eco: "B02–B05",
    summary: l(
      "Le cavalier provoque les pions blancs pour ensuite les attaquer.",
      "The knight provokes White’s pawns forward so as to attack them.",
    ),
    keyPlies: 2,
    lines: [
      {
        name: l("Variante moderne", "Modern Variation"),
        moves: m("e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O Be7"),
        note: l(
          "Les Blancs gardent un léger avantage d’espace ; jeu solide pour les Noirs.",
          "White keeps a small space advantage; solid play for Black.",
        ),
      },
      {
        name: l("Variante d’échange", "Exchange Variation"),
        moves: m("e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 exd6 cxd6 Nc3 g6"),
        note: l(
          "Les Blancs échangent en d6 et misent sur leur espace à l’aile dame.",
          "White exchanges on d6 and relies on queenside space.",
        ),
      },
    ],
  },
  {
    id: "dutch",
    side: "black",
    name: l("Défense hollandaise", "Dutch Defence"),
    eco: "A80–A99",
    summary: l(
      "f5 prend e4 sous contrôle : une défense ambitieuse contre 1.d4.",
      "f5 seizes control of e4: an ambitious defence to 1.d4.",
    ),
    keyPlies: 2,
    lines: [
      {
        name: l("Leningrad", "Leningrad"),
        moves: m("d4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6"),
        note: l(
          "f5 et un fianchetto : un mélange de hollandaise et d’est-indienne.",
          "f5 plus a fianchetto: a mix of the Dutch and the King’s Indian.",
        ),
      },
      {
        name: l("Stonewall", "Stonewall"),
        moves: m("d4 f5 c4 Nf6 g3 e6 Bg2 d5 Nf3 c6 O-O Bd6"),
        note: l(
          "Une chaîne de pions en béton ; e4 devient un avant-poste noir.",
          "A concrete pawn chain; e4 becomes a Black outpost.",
        ),
      },
      {
        name: l("Variante classique", "Classical Variation"),
        moves: m("d4 f5 c4 Nf6 g3 e6 Bg2 Be7 Nf3 O-O O-O d6"),
        note: l(
          "Souple : les Noirs choisissent plus tard entre e5 et De8-h5.",
          "Flexible: Black later chooses between e5 and Qe8–h5.",
        ),
      },
    ],
  },
  {
    id: "grunfeld",
    side: "black",
    name: l("Défense Grünfeld", "Grünfeld Defence"),
    eco: "D70–D99",
    summary: l(
      "Les Noirs laissent les Blancs bâtir un grand centre puis le bombardent.",
      "Black lets White build a big centre, then bombards it.",
    ),
    keyPlies: 6,
    lines: [
      {
        name: l("Variante d’échange", "Exchange Variation"),
        moves: m("d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Be3"),
        note: l(
          "Le centre blanc contre la pression du fou g7 et de c5.",
          "White’s centre against the pressure of the g7 bishop and c5.",
        ),
      },
      {
        name: l("Variante russe", "Russian Variation"),
        moves: m("d4 Nf6 c4 g6 Nc3 d5 Nf3 Bg7 Qb3 dxc4 Qxc4 O-O e4 Bg4"),
        note: l(
          "La dame blanche gagne c4 ; les Noirs attaquent aussitôt le centre.",
          "White’s queen wins c4; Black attacks the centre at once.",
        ),
      },
    ],
  },
  {
    id: "queens-indian",
    side: "black",
    name: l("Défense ouest-indienne", "Queen’s Indian Defence"),
    eco: "E12–E19",
    summary: l(
      "b6 et Fb7 surveillent e4 : une défense solide et positionnelle.",
      "b6 and Bb7 watch over e4: a solid, positional defence.",
    ),
    keyPlies: 6,
    lines: [
      {
        name: l("Variante du fianchetto", "Fianchetto Variation"),
        moves: m("d4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7"),
        note: l(
          "Fa6 attaque c4 ; le jeu reste équilibré et manœuvrier.",
          "Ba6 hits c4; the play stays balanced and manoeuvring.",
        ),
      },
      {
        name: l("Variante Petrossian", "Petrosian Variation"),
        moves: m("d4 Nf6 c4 e6 Nf3 b6 a3 Bb7 Nc3 d5 cxd5 Nxd5"),
        note: l(
          "a3 empêche Fb4 : les Blancs préparent un grand centre avec e4.",
          "a3 prevents Bb4: White prepares a big centre with e4.",
        ),
      },
    ],
  },
  {
    id: "benoni",
    side: "black",
    name: l("Benoni et gambit Benko", "Benoni and Benko Gambit"),
    eco: "A56–A79",
    summary: l(
      "c5 provoque d5 : les Noirs jouent pour une majorité ou des colonnes ouvertes à l’aile dame.",
      "c5 provokes d5: Black plays for a queenside majority or open files.",
    ),
    keyPlies: 5,
    lines: [
      {
        name: l("Benoni moderne", "Modern Benoni"),
        moves: m("d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7 Be2 O-O O-O"),
        note: l(
          "Structure déséquilibrée : majorité noire à l’aile dame, blanche au centre.",
          "An unbalanced structure: Black’s queenside majority against White’s centre.",
        ),
      },
      {
        name: l("Gambit Benko", "Benko Gambit"),
        moves: m("d4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6 Nc3 d6"),
        note: l(
          "Un pion pour des colonnes a et b ouvertes et une pression durable.",
          "A pawn for open a- and b-files and lasting pressure.",
        ),
      },
    ],
  },
  {
    id: "philidor",
    side: "black",
    name: l("Défense Philidor", "Philidor Defence"),
    eco: "C41",
    summary: l(
      "d6 soutient e5 sans complication : solide, un peu passive.",
      "d6 supports e5 without fuss: solid, slightly passive.",
    ),
    keyPlies: 4,
    lines: [
      {
        name: l("Variante Hanham", "Hanham Variation"),
        moves: m("e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 O-O O-O"),
        note: l(
          "Les Noirs maintiennent e5 avec Cbd7 ; position compacte.",
          "Black holds e5 with Nbd7; a compact position.",
        ),
      },
      {
        name: l("Variante d’échange", "Exchange Variation"),
        moves: m("e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7"),
        note: l(
          "Les Noirs cèdent le centre contre un développement simple.",
          "Black gives up the centre for simple development.",
        ),
      },
    ],
  },
];

export function catalogOpening(id: string): CatalogOpening | undefined {
  return CATALOG.find((o) => o.id === id);
}

/** The five volumes of the Encyclopaedia of Chess Openings, by the letter of the code. */
export type EcoFamily = "A" | "B" | "C" | "D" | "E";

export const ECO_FAMILIES: { id: EcoFamily; name: Localized; moves: string }[] = [
  {
    id: "C",
    name: l("Parties ouvertes et française", "Open games and the French"),
    moves: "1.e4 e5, 1.e4 e6",
  },
  { id: "B", name: l("Parties semi-ouvertes", "Semi-open games"), moves: "1.e4 …" },
  {
    id: "D",
    name: l("Parties fermées et semi-fermées", "Closed and semi-closed games"),
    moves: "1.d4 d5",
  },
  { id: "E", name: l("Défenses indiennes", "Indian defences"), moves: "1.d4 Nf6 2.c4 e6, g6" },
  {
    id: "A",
    name: l("Ouvertures de flanc et divers", "Flank openings and others"),
    moves: "1.c4, 1.Nf3, 1.d4 …",
  },
];

export function ecoFamily(opening: CatalogOpening): EcoFamily {
  return opening.eco[0] as EcoFamily;
}

/** The white first move the opening starts with ("1.e4", "1.d4", …). */
export function firstMove(opening: CatalogOpening): string {
  return `1.${opening.lines[0]!.moves[0]}`;
}

/**
 * Openings matching a search: by name in either language, ECO code, or a line or
 * variation name. Case and accents are ignored.
 */
export function searchCatalog(
  query: string,
  openings: readonly CatalogOpening[] = CATALOG,
): CatalogOpening[] {
  const fold = (text: string) =>
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const needle = fold(query.trim());
  if (!needle) return [...openings];
  return openings.filter((o) =>
    [o.name.fr, o.name.en, o.eco, ...o.lines.flatMap((line) => [line.name.fr, line.name.en])].some(
      (text) => fold(text).includes(needle),
    ),
  );
}

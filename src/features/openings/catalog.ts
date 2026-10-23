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
    ],
  },
];

export function catalogOpening(id: string): CatalogOpening | undefined {
  return CATALOG.find((o) => o.id === id);
}

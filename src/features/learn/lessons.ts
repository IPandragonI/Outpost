import { START_FEN } from "@/lib/chess/position";

/**
 * Theory lessons. Each lesson has a position, an optional line to step through (SAN from
 * that position) and an optional exercise: find the move. Every position, line and
 * solution is checked by tests/lessons.test.ts, and exercise solutions are confirmed with
 * Stockfish.
 */

export type LessonTopic = "openings" | "tactics" | "endgames";
export type EndgameGroup = "mates" | "pawns" | "rooks" | "draws";

export interface Localized {
  fr: string;
  en: string;
}

export interface Exercise {
  fen: string;
  prompt: Localized;
  /** The expected move in SAN. For a mate, any other mating move is accepted too. */
  solution: string;
  hint: Localized;
  explanation: Localized;
}

export interface Lesson {
  id: string;
  topic: LessonTopic;
  title: Localized;
  summary: Localized;
  /** Paragraphs. */
  body: { fr: string[]; en: string[] };
  fen: string;
  line?: string[];
  orientation?: "white" | "black";
  exercise?: Exercise;
  /** Endgame lessons: their family in the endgame section. */
  group?: EndgameGroup;
  /**
   * The theoretical result of the lesson position with best play, for White: checked
   * with Stockfish by the tests.
   */
  verdict?: "win" | "draw";
}

export const ENDGAME_GROUPS: { id: EndgameGroup; title: Localized }[] = [
  { id: "mates", title: { fr: "Mats élémentaires", en: "Basic checkmates" } },
  { id: "pawns", title: { fr: "Finales de pions", en: "King and pawn endgames" } },
  { id: "rooks", title: { fr: "Finales de tours", en: "Rook endgames" } },
  { id: "draws", title: { fr: "Nulles théoriques", en: "Theoretical draws" } },
];

export const TOPICS: { id: LessonTopic; title: Localized; intro: Localized }[] = [
  {
    id: "openings",
    title: { fr: "Principes d’ouverture", en: "Opening principles" },
    intro: {
      fr: "Quelques idées simples guident les premiers coups, quelle que soit l’ouverture choisie.",
      en: "A few simple ideas guide the first moves, whatever the opening.",
    },
  },
  {
    id: "tactics",
    title: { fr: "Motifs tactiques", en: "Tactical patterns" },
    intro: {
      fr: "La plupart des parties se gagnent sur une tactique. Apprenez à reconnaître les motifs qui reviennent sans cesse, puis trouvez le coup.",
      en: "Most games are won by a tactic. Learn to recognize the patterns that keep coming back, then find the move.",
    },
  },
  {
    id: "endgames",
    title: { fr: "Finales essentielles", en: "Essential endgames" },
    intro: {
      fr: "Quelques finales de base suffisent pour convertir un avantage — ou sauver une partie.",
      en: "A handful of basic endgames is enough to convert an advantage — or to save a game.",
    },
  },
];

export const LESSONS: Lesson[] = [
  // Openings
  {
    id: "center",
    topic: "openings",
    title: { fr: "Occuper et contrôler le centre", en: "Occupy and control the centre" },
    summary: {
      fr: "Les cases d4, e4, d5 et e5 donnent de l’espace et de la mobilité à toutes les pièces.",
      en: "The squares d4, e4, d5 and e5 give space and mobility to every piece.",
    },
    body: {
      fr: [
        "Une pièce au centre contrôle plus de cases qu’au bord : un cavalier en e5 en attaque huit, un cavalier en a8 seulement deux.",
        "Les pions centraux (e4, d4) prennent de l’espace et ouvrent des lignes pour le fou et la dame. Dans la partie écossaise, les Blancs frappent immédiatement au centre avec d4.",
        "Contrôler le centre ne veut pas toujours dire l’occuper avec des pions : on peut aussi le viser avec des pièces, comme dans les défenses hypermodernes.",
      ],
      en: [
        "A piece in the centre controls more squares than on the edge: a knight on e5 attacks eight squares, a knight on a8 only two.",
        "Central pawns (e4, d4) gain space and open lines for the bishop and queen. In the Scotch Game, White strikes at the centre at once with d4.",
        "Controlling the centre does not always mean occupying it with pawns: it can also be targeted with pieces, as in the hypermodern defences.",
      ],
    },
    fen: START_FEN,
    line: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4"],
  },
  {
    id: "development",
    topic: "openings",
    title: { fr: "Développer ses pièces", en: "Develop your pieces" },
    summary: {
      fr: "Sortez cavaliers et fous avant de rejouer une même pièce ou de lancer une attaque.",
      en: "Bring out knights and bishops before moving a piece twice or starting an attack.",
    },
    body: {
      fr: [
        "Chaque coup d’ouverture devrait, si possible, mettre une nouvelle pièce en jeu. Les cavaliers sortent souvent avant les fous, vers le centre (f3, c3, f6, c6).",
        "Dans la partie italienne ci-contre, les deux camps développent harmonieusement : cavaliers, fous, petit roque, puis les tours viennent au centre.",
        "Une pièce jouée deux fois sans raison, c’est un temps donné à l’adversaire pour développer une pièce de plus.",
      ],
      en: [
        "Each opening move should, when possible, bring a new piece into play. Knights often come out before bishops, towards the centre (f3, c3, f6, c6).",
        "In the Italian Game shown here, both sides develop smoothly: knights, bishops, short castling, then the rooks come to the centre.",
        "A piece moved twice for no reason is a tempo given to the opponent to develop one more piece.",
      ],
    },
    fen: START_FEN,
    line: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6", "O-O", "O-O"],
  },
  {
    id: "king-safety",
    topic: "openings",
    title: { fr: "Mettre son roi à l’abri", en: "Keep your king safe" },
    summary: {
      fr: "Un roi resté au centre devient une cible : roquez tôt.",
      en: "A king left in the centre becomes a target: castle early.",
    },
    body: {
      fr: [
        "Le roque met le roi derrière un rideau de pions et relie les tours. Retarder le roque quand le centre s’ouvre est souvent fatal.",
        "Dans cette ligne de l’attaque Fegatello (« foie frit »), les Noirs reprennent le pion trop vite et leur roi est attiré au centre par le sacrifice Cxf7. Il y restera exposé à toutes les pièces blanches.",
      ],
      en: [
        "Castling puts the king behind a wall of pawns and connects the rooks. Delaying it while the centre opens is often fatal.",
        "In this line of the Fried Liver Attack, Black recaptures too quickly and the king is dragged to the centre by the sacrifice Nxf7, where it stays exposed to every White piece.",
      ],
    },
    fen: START_FEN,
    line: [
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bc4",
      "Nf6",
      "Ng5",
      "d5",
      "exd5",
      "Nxd5",
      "Nxf7",
      "Kxf7",
      "Qf3+",
      "Ke6",
      "Nc3",
    ],
  },
  {
    id: "early-queen",
    topic: "openings",
    title: { fr: "Ne pas sortir la dame trop tôt", en: "Don’t bring the queen out too early" },
    summary: {
      fr: "Une dame sortie tôt se fait chasser par les pièces adverses, qui se développent en gagnant du temps.",
      en: "An early queen gets chased by the opponent’s pieces, which develop while gaining time.",
    },
    body: {
      fr: [
        "La dame est la pièce la plus précieuse : quand une pièce mineure l’attaque, elle doit fuir. Chaque fuite est un temps perdu.",
        "Ici, après 2.Dh5, les Noirs défendent e5 et f7, puis développent leurs pièces en attaquant la dame blanche, qui doit se déplacer encore et encore.",
      ],
      en: [
        "The queen is the most valuable piece: when a minor piece attacks it, it has to move away. Every retreat is a lost tempo.",
        "Here, after 2.Qh5, Black defends e5 and f7, then develops while attacking the White queen, which has to move again and again.",
      ],
    },
    fen: START_FEN,
    line: ["e4", "e5", "Qh5", "Nc6", "Bc4", "g6", "Qf3", "Nf6", "Ne2", "Nd4", "Nxd4", "exd4"],
  },

  // Tactics
  {
    id: "fork",
    topic: "tactics",
    title: { fr: "La fourchette", en: "The fork" },
    summary: {
      fr: "Une pièce attaque deux cibles à la fois : l’adversaire ne peut en sauver qu’une.",
      en: "One piece attacks two targets at once: the opponent can save only one.",
    },
    body: {
      fr: [
        "Le cavalier est le roi des fourchettes, car il attaque des cases que les autres pièces ne peuvent pas contester. Une fourchette avec échec est la plus forte : l’adversaire doit d’abord parer l’échec.",
        "Cherchez les pièces non protégées et les pièces de grande valeur (roi, dame, tours) situées à un saut de cavalier l’une de l’autre.",
      ],
      en: [
        "The knight is the king of forks, because it attacks squares other pieces cannot contest. A fork with check is the strongest: the opponent must deal with the check first.",
        "Look for unprotected pieces and valuable pieces (king, queen, rooks) a knight’s jump away from each other.",
      ],
    },
    fen: "q3k3/8/8/3N4/8/8/8/6K1 w - - 0 1",
    exercise: {
      fen: "q3k3/8/8/3N4/8/8/8/6K1 w - - 0 1",
      prompt: {
        fr: "Les Blancs jouent et gagnent la dame.",
        en: "White to play and win the queen.",
      },
      solution: "Nc7+",
      hint: {
        fr: "Quelle case du cavalier attaque à la fois le roi et la dame ?",
        en: "Which knight square attacks both the king and the queen?",
      },
      explanation: {
        fr: "Cc7+ fait échec au roi et attaque la dame en a8. Après le coup de roi, Cxa8.",
        en: "Nc7+ checks the king and attacks the queen on a8. After the king moves, Nxa8.",
      },
    },
  },
  {
    id: "pin",
    topic: "tactics",
    title: { fr: "Le clouage", en: "The pin" },
    summary: {
      fr: "Une pièce ne peut pas bouger sans exposer une pièce plus précieuse derrière elle.",
      en: "A piece cannot move without exposing a more valuable piece behind it.",
    },
    body: {
      fr: [
        "Quand la pièce de derrière est le roi, le clouage est absolu : la pièce clouée n’a pas le droit de bouger. On peut alors l’attaquer à nouveau, avec un pion par exemple.",
        "Fous, tours et dames clouent le long des diagonales, colonnes et rangées. Avant de placer votre roi ou votre dame sur une ligne ouverte, vérifiez qui la contrôle.",
      ],
      en: [
        "When the piece behind is the king, the pin is absolute: the pinned piece is not allowed to move. You can then attack it again, with a pawn for instance.",
        "Bishops, rooks and queens pin along diagonals, files and ranks. Before putting your king or queen on an open line, check who controls it.",
      ],
    },
    fen: "7k/8/8/4q3/8/2P5/5B2/6K1 w - - 0 1",
    exercise: {
      fen: "7k/8/8/4q3/8/2P5/5B2/6K1 w - - 0 1",
      prompt: {
        fr: "Les Blancs jouent et gagnent la dame noire.",
        en: "White to play and win the Black queen.",
      },
      solution: "Bd4",
      hint: {
        fr: "La dame et le roi noirs sont sur la même diagonale.",
        en: "The Black queen and king stand on the same diagonal.",
      },
      explanation: {
        fr: "Fd4 cloue la dame contre le roi en h8. Elle ne peut que prendre le fou, protégé par le pion c3 : Dxd4 cxd4.",
        en: "Bd4 pins the queen to the king on h8. It can only take the bishop, which the c3 pawn defends: Qxd4 cxd4.",
      },
    },
  },
  {
    id: "skewer",
    topic: "tactics",
    title: { fr: "L’enfilade", en: "The skewer" },
    summary: {
      fr: "Le clouage à l’envers : la pièce de devant, plus précieuse, doit s’écarter et livre celle de derrière.",
      en: "A pin in reverse: the more valuable front piece must step aside and gives up the one behind.",
    },
    body: {
      fr: [
        "L’enfilade la plus fréquente est un échec : le roi doit quitter la ligne, et la pièce qui se trouvait derrière lui tombe.",
        "Elle apparaît souvent en finale, quand le roi s’avance et que les lignes sont ouvertes.",
      ],
      en: [
        "The most common skewer is a check: the king has to leave the line, and the piece behind it falls.",
        "It often appears in endgames, when the king steps forward and the lines are open.",
      ],
    },
    fen: "4q3/8/8/4k3/8/8/1K6/7R w - - 0 1",
    exercise: {
      fen: "4q3/8/8/4k3/8/8/1K6/7R w - - 0 1",
      prompt: {
        fr: "Les Blancs jouent et gagnent la dame.",
        en: "White to play and win the queen.",
      },
      solution: "Re1+",
      hint: {
        fr: "Le roi et la dame noirs sont sur la colonne e.",
        en: "The Black king and queen stand on the e-file.",
      },
      explanation: {
        fr: "Te1+ : le roi doit quitter la colonne e, et la tour prend la dame en e8.",
        en: "Re1+: the king has to leave the e-file, and the rook takes the queen on e8.",
      },
    },
  },
  {
    id: "discovered",
    topic: "tactics",
    title: { fr: "L’attaque à la découverte", en: "The discovered attack" },
    summary: {
      fr: "Une pièce s’écarte et démasque l’attaque d’une autre — en menaçant elle-même quelque chose.",
      en: "A piece steps aside to unmask another piece’s attack — while threatening something itself.",
    },
    body: {
      fr: [
        "Le motif est redoutable car il crée deux menaces d’un coup : celle de la pièce qui bouge et celle de la pièce démasquée.",
        "Quand la pièce démasquée fait échec (échec à la découverte), la pièce qui bouge peut aller presque n’importe où, même se faire prendre : l’adversaire doit d’abord parer l’échec.",
      ],
      en: [
        "The pattern is deadly because it creates two threats in one move: the moving piece’s and the unmasked piece’s.",
        "When the unmasked piece gives check (discovered check), the moving piece can go almost anywhere, even where it can be taken: the opponent must deal with the check first.",
      ],
    },
    fen: "4k3/8/3q4/8/4N3/8/8/4R1K1 w - - 0 1",
    exercise: {
      fen: "4k3/8/3q4/8/4N3/8/8/4R1K1 w - - 0 1",
      prompt: {
        fr: "Les Blancs jouent et gagnent la dame.",
        en: "White to play and win the queen.",
      },
      solution: "Nxd6+",
      hint: {
        fr: "Le cavalier masque la tour, qui vise le roi.",
        en: "The knight blocks the rook, which aims at the king.",
      },
      explanation: {
        fr: "Cxd6+ : en prenant la dame, le cavalier démasque l’échec de la tour e1. Les Noirs doivent parer l’échec et ne peuvent pas reprendre.",
        en: "Nxd6+: taking the queen, the knight unmasks the rook’s check from e1. Black must answer the check and cannot recapture.",
      },
    },
  },
  {
    id: "back-rank",
    topic: "tactics",
    title: { fr: "Le mat du couloir", en: "The back-rank mate" },
    summary: {
      fr: "Un roi enfermé derrière ses propres pions est maté par une tour ou une dame sur la dernière rangée.",
      en: "A king locked behind its own pawns is mated by a rook or queen on the back rank.",
    },
    body: {
      fr: [
        "Après le roque, les trois pions devant le roi le protègent… mais l’enferment aussi. Si la dernière rangée n’est plus défendue, une tour suffit à mater.",
        "La parade classique est de créer une « fenêtre » (h3 ou g3 pour les Blancs, h6 ou g6 pour les Noirs) avant que la menace n’apparaisse.",
      ],
      en: [
        "After castling, the three pawns in front of the king protect it… but also lock it in. If the back rank is no longer defended, a rook is enough to mate.",
        "The classic precaution is to make a “luft” (h3 or g3 for White, h6 or g6 for Black) before the threat appears.",
      ],
    },
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    exercise: {
      fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
      prompt: {
        fr: "Les Blancs jouent et font mat en un coup.",
        en: "White to play and mate in one.",
      },
      solution: "Re8#",
      hint: {
        fr: "Le roi noir n’a aucune case de fuite.",
        en: "The Black king has no escape square.",
      },
      explanation: {
        fr: "Te8# : le roi est enfermé par ses pions f7, g7 et h7.",
        en: "Re8#: the king is locked in by its own pawns on f7, g7 and h7.",
      },
    },
  },

  // Endgames
  {
    id: "queen-mate",
    topic: "endgames",
    group: "mates",
    title: { fr: "Mater avec la dame", en: "Mating with the queen" },
    summary: {
      fr: "Repoussez le roi au bord avec la dame, puis approchez votre roi pour le mat.",
      en: "Push the king to the edge with the queen, then bring your king in for the mate.",
    },
    body: {
      fr: [
        "La dame restreint le roi adverse à un rectangle de plus en plus petit, en restant à un saut de cavalier de lui. Attention au pat : laissez-lui toujours une case tant que le mat n’est pas prêt.",
        "Une fois le roi au bord, le vôtre vient soutenir la dame, qui donne le mat sur la rangée ou la colonne du bord.",
      ],
      en: [
        "The queen confines the enemy king to a shrinking box, staying a knight’s jump away from it. Beware of stalemate: always leave it a square until the mate is ready.",
        "Once the king is on the edge, yours comes in to support the queen, which mates along the edge rank or file.",
      ],
    },
    fen: "k7/8/1K6/8/8/8/7Q/8 w - - 0 1",
    exercise: {
      fen: "k7/8/1K6/8/8/8/7Q/8 w - - 0 1",
      prompt: {
        fr: "Les Blancs jouent et font mat en un coup.",
        en: "White to play and mate in one.",
      },
      solution: "Qh8#",
      hint: {
        fr: "Votre roi contrôle déjà a7 et b7.",
        en: "Your king already covers a7 and b7.",
      },
      explanation: {
        fr: "Dh8# contrôle toute la huitième rangée ; le roi blanc couvre a7 et b7.",
        en: "Qh8# covers the whole eighth rank; the White king covers a7 and b7.",
      },
    },
  },
  {
    id: "rook-mate",
    topic: "endgames",
    group: "mates",
    title: { fr: "Mater avec la tour", en: "Mating with the rook" },
    summary: {
      fr: "Roi et tour matent un roi seul : le roi blanc fait face au roi adverse, la tour donne le mat sur le bord.",
      en: "King and rook mate a lone king: the kings face each other and the rook mates on the edge.",
    },
    body: {
      fr: [
        "La tour coupe le roi adverse d’une rangée ou d’une colonne, et la coupure se resserre à chaque coup.",
        "Le mat arrive quand les deux rois se font face (ou presque, comme ici) et que la tour donne échec sur le bord.",
      ],
      en: [
        "The rook cuts the enemy king off along a rank or file, and the cut moves closer every move.",
        "Mate comes when the kings face each other (or nearly, as here) and the rook checks along the edge.",
      ],
    },
    fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1",
    exercise: {
      fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1",
      prompt: {
        fr: "Les Blancs jouent et font mat en un coup.",
        en: "White to play and mate in one.",
      },
      solution: "Rh8#",
      hint: {
        fr: "Le bord de l’échiquier est la huitième rangée.",
        en: "The edge of the board is the eighth rank.",
      },
      explanation: {
        fr: "Th8# : la tour contrôle la huitième rangée, le roi blanc les cases a7 et b7.",
        en: "Rh8#: the rook covers the eighth rank, the White king covers a7 and b7.",
      },
    },
  },
  {
    id: "opposition",
    topic: "endgames",
    group: "pawns",
    verdict: "win",
    title: { fr: "L’opposition", en: "The opposition" },
    summary: {
      fr: "Dans les finales de pions, les rois face à face avec une case entre eux : celui qui n’a pas le trait gagne la bataille.",
      en: "In pawn endgames, kings facing each other with one square between them: the side not to move wins the battle.",
    },
    body: {
      fr: [
        "Avoir l’opposition, c’est obliger le roi adverse à céder le passage. Avec le roi sur la sixième rangée devant son pion (hors pion de tour), le gain est assuré, quel que soit le camp au trait.",
        "Suivez la ligne : le roi blanc escorte le pion jusqu’à la promotion, le roi noir est contraint de s’écarter.",
      ],
      en: [
        "Having the opposition forces the enemy king to give way. With the king on the sixth rank in front of its pawn (except a rook pawn), the win is certain whoever is to move.",
        "Follow the line: the White king escorts the pawn to promotion, and the Black king is forced aside.",
      ],
    },
    fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1",
    line: ["Kd6", "Kd8", "e6", "Ke8", "e7", "Kf7", "Kd7", "Kf6", "e8=Q"],
  },
  {
    id: "square",
    topic: "endgames",
    group: "pawns",
    title: { fr: "La règle du carré", en: "The rule of the square" },
    summary: {
      fr: "Un roi rattrape un pion passé seul s’il peut entrer dans le « carré » du pion.",
      en: "A king catches a lone passed pawn if it can step into the pawn’s “square”.",
    },
    body: {
      fr: [
        "Tracez le carré entre le pion et sa case de promotion : ici de a4 à d4, d8 et a8. Si le roi adverse peut y entrer au coup suivant, il rattrape le pion ; sinon, le pion va à dame.",
        "Le roi noir en h5, au trait, ne peut pas atteindre la colonne d à temps : le pion est trop rapide.",
      ],
      en: [
        "Draw the square between the pawn and its promotion square: here a4 to d4, d8 and a8. If the enemy king can step into it on its next move, it catches the pawn; otherwise the pawn queens.",
        "The Black king on h5, to move, cannot reach the d-file in time: the pawn is too fast.",
      ],
    },
    fen: "8/8/8/7k/P7/8/8/K7 b - - 0 1",
    line: ["Kg5", "a5", "Kf6", "a6", "Ke7", "a7", "Kd7", "a8=Q"],
  },
  {
    id: "key-squares",
    topic: "endgames",
    group: "pawns",
    verdict: "win",
    title: { fr: "Les cases clés", en: "Key squares" },
    summary: {
      fr: "Si le roi atteint une case clé du pion, le pion va à dame, quoi que fasse l’adversaire.",
      en: "If the king reaches one of the pawn’s key squares, the pawn queens whatever the defence.",
    },
    body: {
      fr: [
        "Pour un pion qui n’a pas dépassé la quatrième rangée, les cases clés sont les trois cases deux rangées devant lui : pour le pion e4, d6, e6 et f6. Le roi qui en occupe une gagne.",
        "Le chemin passe par l’opposition : ici, 1.Re5 prend l’opposition et oblige le roi noir à céder la case f6 ou d6.",
        "Retenez l’ordre : d’abord le roi, ensuite le pion. Pousser trop tôt laisse le roi adverse s’installer devant le pion, et c’est nulle.",
      ],
      en: [
        "For a pawn that has not passed the fourth rank, the key squares are the three squares two ranks ahead of it: for an e4 pawn, d6, e6 and f6. A king that reaches one of them wins.",
        "The way there is the opposition: here 1.Ke5 takes it and forces the Black king to give up f6 or d6.",
        "Remember the order: king first, pawn second. Pushing too early lets the enemy king settle in front of the pawn, and it is a draw.",
      ],
    },
    fen: "8/4k3/8/3K4/4P3/8/8/8 w - - 0 1",
    line: ["Ke5", "Kd7", "Kf6", "Ke8", "e5", "Kf8", "e6", "Ke8", "e7", "Kd7", "Kf7", "Kd6", "e8=Q"],
  },
  {
    id: "lucena",
    topic: "endgames",
    group: "rooks",
    verdict: "win",
    title: { fr: "La position de Lucena", en: "The Lucena position" },
    summary: {
      fr: "La position gagnante de référence en finale de tours : on « construit un pont » pour abriter le roi.",
      en: "The reference winning position of rook endgames: you “build a bridge” to shelter the king.",
    },
    body: {
      fr: [
        "Le roi blanc est devant son pion sur la septième rangée, le roi noir coupé d’au moins une colonne. Le roi blanc ne peut pas sortir : la tour noire l’en chasse par des échecs latéraux.",
        "La méthode : coupez d’abord le roi noir (Td1+), amenez la tour sur la quatrième rangée (Td4), puis sortez le roi. Quand les échecs arrivent, la tour vient s’interposer en b4 : c’est le pont.",
        "Toute finale tour et pion contre tour qui atteint la position de Lucena est gagnée.",
      ],
      en: [
        "The White king stands in front of its pawn on the seventh rank, the Black king is cut off by at least one file. The White king cannot come out: the Black rook chases it with checks from the side.",
        "The method: first cut the Black king off (Rd1+), bring the rook to the fourth rank (Rd4), then walk the king out. When the checks come, the rook interposes on b4: that is the bridge.",
        "Any rook and pawn against rook endgame that reaches the Lucena position is a win.",
      ],
    },
    fen: "1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1",
    line: ["Rd1+", "Ke7", "Rd4", "Ra1", "Kc7", "Rc1+", "Kb6", "Rb1+", "Kc6", "Rc1+", "Kb5", "Rb1+", "Rb4"],
  },
  {
    id: "philidor",
    topic: "endgames",
    group: "rooks",
    verdict: "draw",
    title: { fr: "La défense de Philidor", en: "The Philidor defence" },
    summary: {
      fr: "La nulle de référence : la tour sur la troisième rangée, puis des échecs par derrière dès que le pion avance.",
      en: "The reference draw: the rook on the third rank, then checks from behind as soon as the pawn advances.",
    },
    body: {
      fr: [
        "Le roi défenseur se tient devant le pion. Sa tour garde la sixième rangée (sa troisième rangée) pour empêcher le roi blanc d’y monter.",
        "Dès que le pion avance sur cette rangée, le roi blanc n’a plus d’abri : la tour file en première rangée et donne des échecs par derrière, sans fin.",
      ],
      en: [
        "The defending king stands in front of the pawn. Its rook guards the sixth rank (its third rank) to keep the White king from stepping up.",
        "As soon as the pawn advances to that rank, the White king has no shelter left: the rook drops to the first rank and checks from behind, endlessly.",
      ],
    },
    fen: "3k4/7R/1r6/3PK3/8/8/8/8 w - - 0 1",
    line: ["d6", "Rb1", "Ke6", "Re1+", "Kd5", "Rd1+", "Ke6", "Re1+"],
  },
  {
    id: "rook-pawn",
    topic: "endgames",
    group: "draws",
    verdict: "draw",
    title: { fr: "Le pion de tour", en: "The rook pawn" },
    summary: {
      fr: "Roi et pion de tour contre roi : si le roi défenseur atteint le coin, c’est nulle.",
      en: "King and rook pawn against king: if the defending king reaches the corner, it is a draw.",
    },
    body: {
      fr: [
        "Avec un pion de tour, le roi attaquant ne peut pas contourner le roi adverse par l’autre côté : il n’y a pas d’autre côté.",
        "Le roi blanc finit par enfermer le roi noir… et le pat sauve la défense.",
      ],
      en: [
        "With a rook pawn, the attacking king cannot go round the enemy king on the other side: there is no other side.",
        "The White king ends up boxing the Black king in… and stalemate saves the defence.",
      ],
    },
    fen: "k7/8/K7/P7/8/8/8/8 w - - 0 1",
    line: ["Kb6", "Kb8", "a6", "Ka8", "a7"],
  },
  {
    id: "wrong-bishop",
    topic: "endgames",
    group: "draws",
    verdict: "draw",
    title: { fr: "Le mauvais fou", en: "The wrong bishop" },
    summary: {
      fr: "Fou et pion de tour : si le fou ne contrôle pas la case de promotion, le roi adverse dans le coin tient la nulle.",
      en: "Bishop and rook pawn: if the bishop does not control the promotion square, the enemy king in the corner holds the draw.",
    },
    body: {
      fr: [
        "La case h8 est noire ; un fou de cases blanches ne pourra jamais en chasser le roi. Une pièce de plus, et pourtant aucun gain possible.",
        "Pire, en essayant de forcer, les Blancs risquent le pat, comme dans la ligne : le roi noir n’a plus aucun coup.",
      ],
      en: [
        "The h8 square is dark; a light-squared bishop can never drive the king out of it. A piece up, and still no win.",
        "Worse, trying to force it risks stalemate, as in the line: the Black king has no move left.",
      ],
    },
    fen: "7k/8/6K1/7P/8/8/8/3B4 b - - 0 1",
    line: ["Kg8", "h6", "Kh8", "Bb3"],
  },
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

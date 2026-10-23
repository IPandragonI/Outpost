import { Chess } from "chess.js";
import { parseUci, uciLineToSan, type Color } from "@/lib/chess/position";
import { formatScore, opposite, type Score } from "@/features/engine/evaluation";
import type { MoveClassification } from "./classify-move";
import { materialBalance } from "./material";
import type { MessageKey, Translate } from "@/lib/i18n/translate";

/** "a knight", "two pawns"… in the interface language. */
function materialWords(t: Translate, amount: number): string {
  if ([1, 2, 3, 4, 5, 6, 9].includes(amount)) {
    return t(`material.${amount}` as MessageKey);
  }
  return t("material.n", { n: amount });
}

/**
 * Material won by `color` along `uci` from `fen`, measured after the line's quiet end
 * (up to `plies` moves, stopping early never mid-exchange: one more ply is played while
 * the last move was a capture).
 */
export function materialSwing(
  fen: string,
  uci: readonly string[],
  color: Color,
  plies = 6,
): number {
  const chess = new Chess(fen);
  const start = materialBalance(fen, color);
  let played = 0;
  for (const move of uci) {
    let result;
    try {
      result = chess.move(parseUci(move));
    } catch {
      break;
    }
    played++;
    if (played >= plies && !result.captured) break;
  }
  return materialBalance(chess.fen(), color) - start;
}

function mateWords(t: Translate, score: Score): string | null {
  if (score.kind !== "mate" || score.moves === 0) return null;
  return t("explain.mateIn", { n: score.moves });
}

export interface Explanation {
  headline: string;
  details: string[];
  /** SAN of the best move and its line, for display. */
  bestSan: string | null;
  bestLineSan: string[];
  /** SAN of the engine's reply line after the played move. */
  replySan: string[];
}

/**
 * Describes why a move received its classification, from the engine's evaluations and
 * concrete lines only: which move Stockfish preferred, what the opponent's best reply
 * achieves, mates allowed or missed, and material won or lost along those lines.
 */
export function explainMove(
  t: Translate,
  result: MoveClassification,
  fenBefore: string,
  playedUci: string,
): Explanation {
  const chess = new Chess(fenBefore);
  const played = chess.move(parseUci(playedUci));
  const fenAfter = chess.fen();
  const mover = result.mover;
  const opponent = opposite(mover);
  const bestLineSan = uciLineToSan(fenBefore, result.bestLine);
  const bestSan = bestLineSan[0] ?? null;
  const replySan = uciLineToSan(fenAfter, result.replyLine);
  const details: string[] = [];
  const evalChange = `${formatScore(result.bestScore)} → ${formatScore(result.playedScore)}`;

  switch (result.classification) {
    case "book":
      return {
        headline: t("explain.book", { san: played.san }),
        details: [t("explain.bookDetail")],
        bestSan,
        bestLineSan,
        replySan,
      };
    case "forced":
      return {
        headline: t("explain.forced", { san: played.san }),
        details: [],
        bestSan,
        bestLineSan,
        replySan,
      };
    default:
      break;
  }

  if (result.isBestMove) {
    if (result.classification === "brilliant" && result.sacrifice) {
      details.push(
        t(result.chancePlayed >= 0.75 ? "explain.sacrificeWinning" : "explain.sacrificeGood", {
          material: materialWords(t, result.sacrifice.amount),
          square: result.sacrifice.square,
        }),
      );
    }
    if (result.classification === "great") {
      details.push(t("explain.onlyMove"));
    }
    const mate = mateWords(t, result.playedScore);
    if (mate && result.playedScore.kind === "mate" && result.playedScore.winner === mover) {
      details.push(t("explain.forcesMate", { mate }));
    }
    return {
      headline: t(`explain.headline.${result.classification}` as MessageKey, { san: played.san }),
      details,
      bestSan,
      bestLineSan,
      replySan,
    };
  }

  // Not the best move: what it changes, then what was better.
  if (result.flags.includes("allows-mate")) {
    details.push(
      t(replySan.length ? "explain.allowsMateLine" : "explain.allowsMate", {
        mate: mateWords(t, result.playedScore) ?? t("explain.forcedMate"),
        line: replySan.slice(0, 6).join(" "),
      }),
    );
  } else if (result.flags.includes("missed-mate")) {
    details.push(
      t("explain.missedMate", {
        san: bestSan ?? "",
        mate: mateWords(t, result.bestScore) ?? t("explain.forcedMate"),
      }),
    );
  } else {
    const lost = -materialSwing(fenAfter, result.replyLine, mover);
    if (lost >= 1 && replySan[0]) {
      details.push(
        t(opponent === "w" ? "explain.whiteWins" : "explain.blackWins", {
          san: replySan[0],
          material: materialWords(t, lost),
        }),
      );
    }
    const gain = materialSwing(fenBefore, result.bestLine, mover);
    if (gain >= 1 && bestSan) {
      details.push(t("explain.wouldWin", { san: bestSan, material: materialWords(t, gain) }));
    }
  }
  if (result.flags.includes("slower-mate")) details.push(t("explain.slowerMate"));

  const percent = Math.round(result.loss * 100);
  if (percent >= 1) {
    details.push(t("explain.evalLoss", { change: evalChange, percent }));
  } else {
    details.push(t("explain.eval", { change: evalChange }));
  }
  if (result.flags.includes("low-confidence")) details.push(t("explain.lowConfidence"));

  return {
    headline: t(`explain.headline.${result.classification}` as MessageKey, { san: played.san }),
    details,
    bestSan,
    bestLineSan,
    replySan,
  };
}

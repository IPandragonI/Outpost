"use client";

import { memo, useMemo } from "react";
import { Play, Swords, Trash2 } from "lucide-react";
import { useAnalysis } from "@/features/analysis/store";
import { isError, rulesFor } from "@/features/classification/classification-rules";
import { useSettings } from "@/features/settings/settings-store";
import { classifyMove, type MoveClassification } from "@/features/classification/classify-move";
import { explainMove } from "@/features/classification/explain";
import { formatScore } from "@/features/engine/evaluation";
import { getNode, isOnMainline, type NodeId } from "@/features/games/variation-tree";
import { positionKey } from "@/lib/chess/position";
import { useOpeningBook } from "@/hooks/useOpeningBook";
import { ClassificationBadge, CLASSIFICATION_TEXT } from "./ClassificationBadge";
import { useT } from "@/lib/i18n/useT";

/** Verdict on the current move: why it is good or bad, and what Stockfish preferred. */
function MoveInsightImpl({ byNode }: { byNode: Record<NodeId, MoveClassification> }) {
  const tree = useAnalysis((s) => s.tree);
  const currentId = useAnalysis((s) => s.currentId);
  const pgn = useAnalysis((s) => s.pgn);
  const gamePositions = useAnalysis((s) => s.gamePositions);
  const livePositions = useAnalysis((s) => s.livePositions);
  const { showPreview, playLine, deleteVariation } = useAnalysis.getState();
  const t = useT();
  const { book } = useOpeningBook();
  const sensitivity = useSettings((s) => s.sensitivity);

  const node = getNode(tree, currentId);
  const parent = node.parentId ? getNode(tree, node.parentId) : null;

  // Main-line moves use the whole-game review; other moves are judged from whatever
  // analysis of both positions exists (live engine or game analysis).
  const result = useMemo<{ value: MoveClassification; live: boolean } | null>(() => {
    if (byNode[currentId]) return { value: byNode[currentId]!, live: false };
    if (!parent || !node.uci) return null;
    const key = (fen: string) => positionKey(fen);
    const before = livePositions[key(parent.fen)] ?? gamePositions[key(parent.fen)];
    const after = livePositions[key(node.fen)] ?? gamePositions[key(node.fen)];
    if (!before?.lines.length || !after) return null;
    try {
      return {
        value: classifyMove(
          {
            fenBefore: parent.fen,
            uci: node.uci,
            before,
            after,
            isBook: Boolean(book?.has(node.fen)) && node.ply <= 30,
          },
          rulesFor(sensitivity),
        ),
        live: true,
      };
    } catch {
      return null;
    }
  }, [byNode, currentId, parent, node, livePositions, gamePositions, book, sensitivity]);

  if (!parent || !node.uci) {
    return <p className="text-sm text-base-content/60">{t("insight.start")}</p>;
  }

  const canDelete = node.origin === "explore" || (!pgn && node.origin === "game");
  const deleteButton = canDelete && (
    <button
      type="button"
      className="btn btn-ghost text-base-content/60 btn-xs"
      onClick={() => deleteVariation(node.id)}
    >
      <Trash2 className="size-3.5" aria-hidden="true" />
      {node.origin === "explore" ? t("insight.deleteVariation") : t("insight.takeBack")}
    </button>
  );

  if (!result) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/65">
        <span className="font-mono font-medium text-base-content">{node.san}</span>
        <span>
          {isOnMainline(tree, currentId) ? t("insight.analyzeFirst") : t("insight.exploredPending")}
        </span>
        {deleteButton}
      </div>
    );
  }

  const r = result.value;
  const explanation = explainMove(t, r, parent.fen, node.uci);
  const error = isError(r.classification);
  const opening = r.classification === "book" ? book?.namesAt(node.fen)[0] : null;

  const showBest =
    !r.isBestMove &&
    r.classification !== "book" &&
    r.classification !== "forced" &&
    explanation.bestSan;

  return (
    <article
      className="flex flex-col gap-1.5"
      aria-label={t("insight.label")}
      data-testid="move-insight"
    >
      <header className="flex items-center gap-2">
        <ClassificationBadge classification={r.classification} className="size-6 text-[11px]" />
        <h3
          className={`min-w-0 flex-1 truncate text-[15px] leading-6 font-semibold ${CLASSIFICATION_TEXT[r.classification]}`}
          title={`${explanation.headline} — ${t(`cls.${r.classification}.desc`)}${result.live ? ` ${t("insight.judgedLive")}` : ""}`}
        >
          {explanation.headline}
        </h3>
        <span className="tabular shrink-0 font-mono text-xs text-base-content/55">
          {formatScore(r.playedScore)}
        </span>
        {deleteButton}
      </header>

      {/* One line of context: the opening for book moves, the main reason otherwise. */}
      {opening ? (
        <p className="truncate text-sm">
          <span className="font-mono text-xs text-base-content/55">{opening.eco}</span>{" "}
          {opening.name}
        </p>
      ) : (
        explanation.details[0] && (
          <p className="line-clamp-2 text-sm leading-5 text-base-content/80">
            {explanation.details[0]}
          </p>
        )
      )}

      {showBest && (
        <div
          className={`flex flex-col gap-1.5 rounded-field px-2.5 py-1.5 ${error ? "bg-base-200" : "bg-base-200/60"}`}
        >
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-base-content/60">{t("insight.bestByStockfish")}</span>
            <span className="font-mono font-semibold text-cls-best">{explanation.bestSan}</span>
            <span className="tabular font-mono text-xs text-base-content/55">
              {formatScore(r.bestScore)}
            </span>
            {r.loss > 0.005 && (
              <span
                className="tabular ml-auto text-xs text-base-content/55"
                title={`${t("insight.lossChances", { percent: Math.round(r.loss * 100) })} · ${t("insight.lossPawns", { pawns: (r.cpLoss / 100).toFixed(2) })}`}
              >
                {t("insight.lossShort", { percent: Math.round(r.loss * 100) })}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="btn btn-soft btn-success btn-xs"
              onClick={() =>
                showPreview(
                  parent.id,
                  r.bestLine,
                  t("insight.previewBest", { san: explanation.bestSan ?? "" }),
                  1,
                )
              }
            >
              <Play className="size-3" aria-hidden="true" />
              {t("insight.showBest")}
            </button>
            {explanation.replySan.length > 0 && error && (
              <button
                type="button"
                className="btn btn-soft btn-xs"
                onClick={() =>
                  showPreview(
                    node.id,
                    r.replyLine,
                    t("insight.previewReply", { san: node.san ?? "" }),
                    1,
                  )
                }
              >
                <Swords className="size-3" aria-hidden="true" />
                {t("insight.showPunishment")}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => r.bestMove && playLine(parent.id, [r.bestMove])}
              title={t("insight.tryHint")}
            >
              {t("insight.try", { san: explanation.bestSan ?? "" })}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/** Memoized: re-renders only when its props change, not on every engine update. */
export const MoveInsight = memo(MoveInsightImpl);

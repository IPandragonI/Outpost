"use client";

import { memo, useMemo } from "react";
import { Chess } from "chess.js";
import { Info, Play, Square } from "lucide-react";
import { useAnalysis } from "@/features/analysis/store";
import { ANALYSIS_PRESETS } from "@/features/analysis/game-analysis";
import { type Classification } from "@/features/classification/classification-rules";
import { biggestErrors, type GameReview } from "@/features/classification/game-review";
import { formatScore } from "@/features/engine/evaluation";
import { getNode, mainline } from "@/features/games/variation-tree";
import { useSettings, type PresetId } from "@/features/settings/settings-store";
import { parseUci } from "@/lib/chess/position";
import type { GameReviewState } from "@/hooks/useGameReview";
import { ClassificationBadge } from "./ClassificationBadge";
import { useT } from "@/lib/i18n/useT";

const SHOWN: Classification[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "forced",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
];

function moveLabel(ply: number, san: string) {
  const n = Math.ceil(ply / 2);
  return `${n}${ply % 2 === 1 ? "." : "…"} ${san}`;
}

/** Start / cancel whole-game analysis, with honest progress. */
export function AnalysisRunner() {
  const run = useAnalysis((s) => s.run);
  const tree = useAnalysis((s) => s.tree);
  const plies = useMemo(() => mainline(tree).length - 1, [tree]);
  const { startGameAnalysis, cancelGameAnalysis } = useAnalysis.getState();
  const presetId = useSettings((s) => s.presetId);
  const setSettings = useSettings((s) => s.set);
  const running = run.state === "running";
  const percent = run.total ? Math.round((run.done / run.total) * 100) : 0;
  const t = useT();

  return (
    <div className="flex flex-col gap-2" data-testid="analysis-runner">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="preset">
          {t("report.depthLabel")}
        </label>
        <select
          id="preset"
          className="select w-auto select-sm"
          value={presetId}
          disabled={running}
          onChange={(e) => setSettings({ presetId: e.target.value as typeof presetId })}
        >
          {ANALYSIS_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {t("preset.option", { name: t(`preset.${p.id}`), depth: p.limits.depth ?? 0 })}
            </option>
          ))}
        </select>
        {running ? (
          <button type="button" className="btn btn-sm" onClick={cancelGameAnalysis}>
            <Square className="size-3.5" aria-hidden="true" />
            {t("report.stop")}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => startGameAnalysis(presetId)}
            disabled={plies < 1}
          >
            <Play className="size-3.5" aria-hidden="true" />
            {run.state === "done" && run.presetId === presetId
              ? t("report.again")
              : run.done > 0 && run.presetId === presetId
                ? t("report.resume")
                : t("report.analyze")}
          </button>
        )}
      </div>
      {(running || run.state === "cancelled" || run.state === "error" || run.state === "done") &&
        run.total > 0 && (
          <div className="flex flex-col gap-1">
            <progress
              className={`progress h-1.5 ${run.state === "error" ? "progress-error" : "progress-primary"}`}
              value={run.done}
              max={run.total}
              aria-label={t("report.progress")}
            />
            <p className="tabular text-xs text-base-content/60" aria-live="polite">
              {run.state === "done"
                ? t("report.done", {
                    total: run.total,
                    preset: run.presetId ? t(`preset.${run.presetId as PresetId}`) : "",
                  })
                : running
                  ? t("report.running", { done: run.done, total: run.total, percent })
                  : run.state === "error"
                    ? t("report.error", {
                        done: run.done,
                        total: run.total,
                        error: run.error ?? "",
                      })
                    : t("report.partial", { done: run.done, total: run.total })}
            </p>
          </div>
        )}
    </div>
  );
}

function PlayerColumn({ review, color }: { review: GameReview; color: "w" | "b" }) {
  const summary = color === "w" ? review.white : review.black;
  const name = useAnalysis((s) => (color === "w" ? s.headers.White : s.headers.Black));
  const t = useT();
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">
        <span
          className={`mr-1.5 inline-block size-2.5 rounded-full ring-1 ring-base-content/30 ${color === "w" ? "bg-eval-white" : "bg-eval-black"}`}
          aria-hidden="true"
        />
        {name && name !== "?" ? name : color === "w" ? t("side.white") : t("side.black")}
      </p>
      <p className="tabular mt-1 font-mono text-2xl font-medium">
        {summary.precision === null ? "—" : summary.precision.toFixed(1)}
      </p>
      <p className="text-xs text-base-content/55">
        {t("report.precision")}
        {summary.averageCpLoss !== null &&
          ` · ${t("report.acpl", { n: Math.round(summary.averageCpLoss) })}`}
      </p>
    </div>
  );
}

function GameReportImpl({ state }: { state: GameReviewState }) {
  const { review, nodeIds, opening } = state;
  const goTo = useAnalysis((s) => s.goTo);
  const result = useAnalysis((s) => s.result);
  const headers = useAnalysis((s) => s.headers);
  const t = useT();
  const errors = useMemo(() => (review ? biggestErrors(review, 6) : []), [review]);

  const rootPly = useAnalysis((s) => getNode(s.tree, s.tree.rootId).ply);
  // nodeIds is the main line from the root, one node per ply.
  const nodeOfPly = (ply: number) => nodeIds[ply - rootPly] ?? null;

  return (
    <section
      className="flex flex-col gap-4"
      aria-label={t("report.section")}
      data-testid="game-report"
    >
      <AnalysisRunner />

      <div className="flex flex-col gap-0.5 text-sm">
        {opening && (
          <p>
            <span className="font-mono text-xs text-base-content/55">{opening.eco}</span>{" "}
            {opening.name}
          </p>
        )}
        <p className="text-base-content/60">
          {[headers.Event, headers.Date, result !== "*" ? result : null]
            .filter((v) => v && v !== "?")
            .join(" · ")}
        </p>
      </div>

      {!review ? (
        <p className="text-sm text-base-content/60">{t("report.empty")}</p>
      ) : (
        <>
          {review.pending > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-base-content/60">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {t("report.pending", { n: review.pending })}
            </p>
          )}
          <div className="flex gap-4">
            <PlayerColumn review={review} color="w" />
            <PlayerColumn review={review} color="b" />
          </div>

          <table className="table table-xs">
            <caption className="sr-only">{t("report.tableCaption")}</caption>
            <thead>
              <tr>
                <th scope="col" className="font-normal">
                  <span className="sr-only">{t("report.classification")}</span>
                </th>
                <th scope="col" className="text-right font-normal">
                  {t("side.white")}
                </th>
                <th scope="col" className="text-right font-normal">
                  {t("side.black")}
                </th>
              </tr>
            </thead>
            <tbody>
              {SHOWN.filter((c) => review.white.counts[c] + review.black.counts[c] > 0).map((c) => (
                <tr key={c}>
                  <th scope="row" className="font-normal">
                    <span className="flex items-center gap-2">
                      <ClassificationBadge classification={c} className="size-4 text-[8px]" />
                      {t(`cls.${c}`)}
                    </span>
                  </th>
                  <td className="tabular text-right font-mono">{review.white.counts[c]}</td>
                  <td className="tabular text-right font-mono">{review.black.counts[c]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {errors.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="panel-title">{t("report.biggestErrors")}</h3>
              <ul className="flex flex-col gap-1">
                {errors.map((m) => {
                  const best = m.result.bestMove
                    ? (() => {
                        try {
                          return new Chess(m.fenBefore).move(parseUci(m.result.bestMove!)).san;
                        } catch {
                          return null;
                        }
                      })()
                    : null;
                  const id = nodeOfPly(m.ply);
                  return (
                    <li key={m.ply}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-left text-sm hover:bg-base-200"
                        onClick={() => id && goTo(id)}
                      >
                        <ClassificationBadge
                          classification={m.result.classification}
                          className="size-5 text-[9px]"
                        />
                        <span className="font-mono">{moveLabel(m.ply, m.san)}</span>
                        <span className="tabular text-xs text-base-content/55">
                          {formatScore(m.result.bestScore)} → {formatScore(m.result.playedScore)}
                        </span>
                        {best && (
                          <span className="ml-auto font-mono text-xs text-cls-best">
                            {t("report.bestShort", { san: best })}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {review.turningPoints.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="panel-title">{t("report.turningPoints")}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {review.turningPoints.slice(0, 8).map((tp) => {
                  const move = review.moves.find((m) => m.ply === tp.ply);
                  const id = nodeOfPly(tp.ply);
                  if (!move) return null;
                  return (
                    <li key={tp.ply}>
                      <button
                        type="button"
                        className="btn btn-soft font-mono btn-xs"
                        onClick={() => id && goTo(id)}
                        title={t("report.turningHint", {
                          from: Math.round(tp.from * 100),
                          to: Math.round(tp.to * 100),
                        })}
                      >
                        {moveLabel(tp.ply, move.san)} {tp.to > tp.from ? "↑" : "↓"}
                        {Math.round(Math.abs(tp.to - tp.from) * 100)}%
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="text-xs leading-5 text-base-content/50">{t("report.disclaimer")}</p>
        </>
      )}
    </section>
  );
}

/** Memoized: re-renders only when its props change, not on every engine update. */
export const GameReport = memo(GameReportImpl);

"use client";

import { memo, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Info, Play, RotateCcw, Square } from "lucide-react";
import { useAnalysis } from "@/features/analysis/store";
import { ANALYSIS_PRESETS } from "@/features/analysis/game-analysis";
import { type Classification } from "@/features/classification/classification-rules";
import { criticalMoments } from "@/features/classification/critical-moments";
import { biggestErrors, type GameReview } from "@/features/classification/game-review";
import { formatScore } from "@/features/engine/evaluation";
import { getNode, mainline } from "@/features/games/variation-tree";
import { useSettings, type PresetId } from "@/features/settings/settings-store";
import { parseUci, positionKey, uciLineToSan } from "@/lib/chess/position";
import { useEngineStatus, type LiveAnalysis } from "@/hooks/useLiveAnalysis";
import type { GameReviewState } from "@/hooks/useGameReview";
import { useOpeningBook } from "@/hooks/useOpeningBook";
import { OpeningExplorer } from "@/components/openings/OpeningExplorer";
import { ClassificationBadge } from "./ClassificationBadge";
import { MoveInsight } from "./MoveInsight";
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

/**
 * Start / stop / resume whole-game analysis, with honest progress: the bar counts finished
 * positions (each is one search task) rather than guessing at elapsed time, since book
 * positions are searched shallowly and finish faster than the rest.
 */
export function AnalysisRunner() {
  const run = useAnalysis((s) => s.run);
  const tree = useAnalysis((s) => s.tree);
  const gamePositions = useAnalysis((s) => s.gamePositions);
  const plies = useMemo(() => mainline(tree).length - 1, [tree]);
  const { startGameAnalysis, cancelGameAnalysis } = useAnalysis.getState();
  const presetId = useSettings((s) => s.presetId);
  const setSettings = useSettings((s) => s.set);
  const engine = useEngineStatus();
  const running = run.state === "running";
  const t = useT();

  // The earliest move still waiting for its analysis (searches may finish out of order).
  const pendingMove = useMemo(() => {
    if (!running) return null;
    const line = mainline(tree);
    const node = line.slice(1).find((n, i) => !gamePositions[positionKey(line[i + 1]!.fen)]);
    return node?.san ? moveLabel(node.ply, node.san) : null;
  }, [running, tree, gamePositions]);

  const sameAsRun = run.presetId === presetId;
  const status =
    run.state === "running"
      ? pendingMove
        ? t("review.status.running", { move: pendingMove })
        : t("review.status.finishing")
      : run.state === "done"
        ? t("review.status.done", {
            preset: run.presetId ? t(`preset.${run.presetId as PresetId}`) : "",
          })
        : run.state === "error"
          ? t("review.status.error", { error: run.error ?? "" })
          : run.state === "cancelled"
            ? t(run.userStopped ? "review.status.stopped" : "review.status.incomplete")
            : t("review.status.idle");
  const engineText =
    engine.state === "loading"
      ? t("engine.loading")
      : engine.state === "error"
        ? t("engine.unavailable")
        : running
          ? t("review.engine.busy")
          : t("review.engine.ready");

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
          <button type="button" className="btn btn-sm" onClick={() => cancelGameAnalysis(true)}>
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
            {run.state === "done" && sameAsRun ? (
              <RotateCcw className="size-3.5" aria-hidden="true" />
            ) : (
              <Play className="size-3.5" aria-hidden="true" />
            )}
            {run.state === "done" && sameAsRun
              ? t("report.again")
              : run.done > 0 && run.done < run.total && sameAsRun
                ? t("report.resume")
                : t("report.analyze")}
          </button>
        )}
        <span className="ml-auto text-xs text-base-content/55" aria-live="polite">
          {engineText}
        </span>
      </div>
      <p className="text-xs text-base-content/55">{t(`preset.${presetId}.desc`)}</p>
      {run.total > 0 && (
        <div className="flex flex-col gap-1">
          <progress
            className={`progress h-1.5 ${run.state === "error" ? "progress-error" : "progress-primary"}`}
            value={run.done}
            max={run.total}
            aria-label={t("report.progress")}
          />
          <p
            className="tabular flex flex-wrap justify-between gap-x-3 text-xs text-base-content/65"
            aria-live="polite"
          >
            <span>{status}</span>
            <span>{t("review.progress", { done: run.done, total: run.total })}</span>
          </p>
        </div>
      )}
      {run.total === 0 && <p className="text-xs text-base-content/60">{status}</p>}
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

/** The opening of the position on the board (or of the game), and how theory goes on. */
function OpeningSummary({
  fen,
  gameOpening,
}: {
  fen: string;
  gameOpening: GameReviewState["opening"];
}) {
  const { book } = useOpeningBook();
  const t = useT();
  const { previewFromBoard } = useAnalysis.getState();
  const here = book?.namesAt(fen)[0] ?? null;
  const opening = here ?? gameOpening;
  const theory = useMemo(() => {
    if (!book?.has(fen)) return null;
    const uci = book.mainContinuation(fen, 6);
    if (!uci.length) return null;
    return { uci, san: uciLineToSan(fen, uci) };
  }, [book, fen]);

  if (!opening && !theory) return null;
  return (
    <section className="flex flex-col gap-1" aria-label={t("review.opening")}>
      <h3 className="panel-title">{t("review.opening")}</h3>
      {opening && (
        <p className="text-sm" data-testid="opening-name">
          <span className="font-mono text-xs text-base-content/55">{opening.eco}</span>{" "}
          {opening.name}
          {!here && gameOpening && (
            <span className="text-xs text-base-content/50"> · {t("review.gameOpening")}</span>
          )}
        </p>
      )}
      {theory && (
        <p className="text-xs text-base-content/65">
          {t("review.theory")}{" "}
          <button
            type="button"
            className="rounded font-mono text-[13px] text-base-content hover:bg-base-300"
            onClick={() => previewFromBoard(theory.uci, t("review.theoryLabel"), 1)}
          >
            {theory.san.join(" ")}
          </button>
        </p>
      )}
    </section>
  );
}

/** The opening explorer, one click away; it is only mounted once opened. */
export function ExplorerSection({ fen, live }: { fen: string; live: LiveAnalysis }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <details
      className="rounded-field border border-base-content/10"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="min-h-10 cursor-pointer px-3 py-2 text-sm font-medium select-none">
        {t("review.explorer")}
      </summary>
      {open && (
        <div className="border-t border-base-content/10 p-3">
          <OpeningExplorer
            fen={fen}
            analysis={live.analysis}
            onPreview={(uci, label) => useAnalysis.getState().previewFromBoard(uci, label)}
            onPlay={(uci) => useAnalysis.getState().playFromBoard([uci])}
          />
        </div>
      )}
    </details>
  );
}

function GameReportImpl({ state, fen }: { state: GameReviewState; fen: string }) {
  const { review, nodeIds, opening } = state;
  const goTo = useAnalysis((s) => s.goTo);
  const currentId = useAnalysis((s) => s.currentId);
  const result = useAnalysis((s) => s.result);
  const headers = useAnalysis((s) => s.headers);
  const t = useT();
  const errors = useMemo(() => (review ? biggestErrors(review, 6) : []), [review]);
  const moments = useMemo(() => (review ? criticalMoments(review) : []), [review]);

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

      <p className="text-sm text-base-content/60">
        {[headers.Event, headers.Date, result !== "*" ? result : null]
          .filter((v) => v && v !== "?")
          .join(" · ")}
      </p>

      {/* The assessment of the selected move; keeps its height so the page does not jump. */}
      <div
        className="min-h-24 border-y border-base-content/10 py-2"
        data-testid="move-box"
        aria-label={t("review.selected")}
      >
        <MoveInsight byNode={state.byNode} />
      </div>

      <OpeningSummary fen={fen} gameOpening={opening} />

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

          {moments.length > 0 && (
            <div className="flex flex-col gap-1.5" data-testid="critical-moments">
              <h3 className="panel-title">{t("critical.title")}</h3>
              <ul className="flex flex-col gap-0.5">
                {moments.map((m) => {
                  const id = nodeOfPly(m.ply);
                  const selected = id !== null && id === currentId;
                  return (
                    <li key={m.ply}>
                      <button
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        className={`flex min-h-10 w-full items-center gap-2 rounded-field px-2 text-left text-sm hover:bg-base-200 ${
                          selected ? "bg-base-200" : ""
                        }`}
                        onClick={() => id && goTo(id)}
                      >
                        <ClassificationBadge
                          classification={m.classification}
                          className="size-5 shrink-0 text-[9px]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-base-content/60">
                            {t(`critical.${m.kind}`)} ·{" "}
                            {m.color === "w" ? t("side.white") : t("side.black")}
                          </span>
                          <span className="font-mono">{moveLabel(m.ply, m.san)}</span>
                        </span>
                        <span className="tabular shrink-0 font-mono text-xs text-base-content/60">
                          {m.kind === "swing"
                            ? `${m.swing > 0 ? "↑" : "↓"}${Math.round(Math.abs(m.swing) * 100)}%`
                            : m.loss > 0.005
                              ? `−${Math.round(m.loss * 100)}%`
                              : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

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
                        className="flex min-h-10 w-full items-center gap-2 rounded-field px-2 py-1.5 text-left text-sm hover:bg-base-200"
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

          <p className="text-xs leading-5 text-base-content/50">{t("report.disclaimer")}</p>
        </>
      )}
    </section>
  );
}

/** Memoized: re-renders only when its props change, not on every engine update. */
export const GameReport = memo(GameReportImpl);

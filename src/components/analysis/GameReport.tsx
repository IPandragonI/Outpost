"use client";

import { memo, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Info, Play, RotateCcw, Square } from "lucide-react";
import { useAnalysis } from "@/features/analysis/store";
import { sideOf } from "@/features/analysis/perspective";
import { ANALYSIS_PRESETS } from "@/features/analysis/game-analysis";
import { type Classification } from "@/features/classification/classification-rules";
import { criticalMoments } from "@/features/classification/critical-moments";
import {
  biggestErrors,
  PHASES,
  reviewGame,
  type GameReview,
} from "@/features/classification/game-review";
import { themeSummary } from "@/features/classification/themes";
import { formatScore } from "@/features/engine/evaluation";
import { getNode, mainline } from "@/features/games/variation-tree";
import { useSettings, type PresetId } from "@/features/settings/settings-store";
import { parseUci, positionKey, uciLineToSan } from "@/lib/chess/position";
import { useEngineStatus, type LiveAnalysis } from "@/hooks/useLiveAnalysis";
import type { GameReviewState } from "@/hooks/useGameReview";
import { useOpeningBook } from "@/hooks/useOpeningBook";
import { OpeningExplorer } from "@/components/openings/OpeningExplorer";
import { EvalGraph } from "./EvalGraph";
import { ClassificationBadge } from "./ClassificationBadge";
import type { MessageKey } from "@/lib/i18n/messages";
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

/** Moves by classification for each player; before the review every row shows 0. */
export function ClassificationTable({
  review,
  showAll = false,
}: {
  review: GameReview;
  showAll?: boolean;
}) {
  const t = useT();
  return (
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
        {SHOWN.filter((c) => showAll || review.white.counts[c] + review.black.counts[c] > 0).map(
          (c) => (
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
          ),
        )}
      </tbody>
    </table>
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
      {summary.estimatedRating !== null && (
        <p className="mt-0.5 text-xs text-base-content/65" title={t("report.levelHint")}>
          {t("report.level")} <span className="tabular font-mono">~{summary.estimatedRating}</span>
        </p>
      )}
    </div>
  );
}

/** An empty review: every count is 0 and no precision, for the screen shown before the review. */
const NO_REVIEW: GameReview = reviewGame([], []);

/** The two players with their precision (and estimated level). */
export function PlayersSummary({ review }: { review: GameReview }) {
  return (
    <div className="flex gap-4">
      <PlayerColumn review={review} color="w" />
      <PlayerColumn review={review} color="b" />
    </div>
  );
}

function useSideName(color: "w" | "b") {
  const name = useAnalysis((s) => (color === "w" ? s.headers.White : s.headers.Black));
  const t = useT();
  return name && name !== "?" ? name : color === "w" ? t("side.white") : t("side.black");
}

/**
 * The mini debrief, in a few sentences: the result (from the point of view of the saved
 * Chess.com account when it played the game), who played better, and the costliest mistake.
 * Empty until there is a review to talk about.
 */
function useDebriefLines(review: GameReview | null): string[] {
  const t = useT();
  const white = useSideName("w");
  const black = useSideName("b");
  const result = useAnalysis((s) => s.result);
  const headers = useAnalysis((s) => s.headers);
  const username = useSettings((s) => s.chessComUsername);
  return useMemo(() => {
    if (!review) return [];
    const me = sideOf(headers, username);
    const nameOf = (color: "w" | "b") => (color === "w" ? white : black);
    const lines: string[] = [];

    if (result === "1-0" || result === "0-1") {
      const winner = result === "1-0" ? "w" : "b";
      lines.push(
        me
          ? t(winner === me ? "debrief.youWon" : "debrief.youLost", {
              opponent: nameOf(me === "w" ? "b" : "w"),
            })
          : t("debrief.won", { name: nameOf(winner) }),
      );
    } else if (result === "1/2-1/2") {
      lines.push(t("debrief.drawn"));
    }

    const w = review.white.precision;
    const b = review.black.precision;
    if (w !== null && b !== null) {
      if (me) {
        const mine = me === "w" ? w : b;
        const theirs = me === "w" ? b : w;
        lines.push(
          t("debrief.yours", {
            a: mine.toFixed(1),
            b: theirs.toFixed(1),
            opponent: nameOf(me === "w" ? "b" : "w"),
          }),
        );
      } else if (Math.abs(w - b) < 2) {
        lines.push(t("debrief.even", { a: w.toFixed(1), b: b.toFixed(1) }));
      } else {
        lines.push(
          t("debrief.better", {
            name: w >= b ? white : black,
            a: Math.max(w, b).toFixed(1),
            b: Math.min(w, b).toFixed(1),
          }),
        );
      }
    }

    const errors = biggestErrors(review, 30);
    const worst = me ? errors.find((m) => m.result.mover === me) : errors[0];
    if (worst) {
      lines.push(
        t(me ? "debrief.yourWorst" : "debrief.worst", {
          move: moveLabel(worst.ply, worst.san),
          percent: Math.round(worst.result.loss * 100),
        }),
      );
    } else if (me && review.moves.length > 0) {
      lines.push(t("debrief.clean"));
    }
    return lines;
  }, [review, headers, username, result, white, black, t]);
}

/** The mini debrief of the reviewed game. */
function Debrief({ review }: { review: GameReview }) {
  const lines = useDebriefLines(review);
  if (!lines.length) return null;
  return (
    <p className="rounded-field bg-base-200 px-3 py-2 text-sm leading-5" data-testid="debrief">
      {lines.join(" ")}
    </p>
  );
}

/**
 * What the analysis panel shows while the game is analyzed and until the user opens the
 * review: the analysis starts by itself on arrival, and its numbers (chart, precisions,
 * move table) fill in as positions are done. The debrief is written when it is complete,
 * and only then can the button that opens the detailed review (the three tabs) be pressed.
 * That button starts nothing: it shows what the analysis already computed.
 */
export function ReviewStartPanel({ state, onStart }: { state: GameReviewState; onStart(): void }) {
  const t = useT();
  const white = useSideName("w");
  const black = useSideName("b");
  const tree = useAnalysis((s) => s.tree);
  const run = useAnalysis((s) => s.run);
  const presetId = useSettings((s) => s.presetId);
  const setSettings = useSettings((s) => s.set);
  const engine = useEngineStatus();
  const plies = useMemo(() => mainline(tree).length - 1, [tree]);
  const done = run.state === "done";
  const review = state.review ?? NO_REVIEW;
  const lines = useDebriefLines(done ? state.review : null);
  const failed = run.state === "cancelled" || run.state === "error";

  const changePreset = (value: PresetId) => {
    setSettings({ presetId: value });
    // A different depth restarts the analysis (positions already done at that depth are kept).
    void useAnalysis.getState().startGameAnalysis(value);
  };

  return (
    <div
      className="flex flex-col lg:min-h-0 lg:flex-1"
      role="region"
      aria-label={t("start.title")}
      data-testid="review-start"
    >
      <div className="relative flex flex-col gap-4 p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <section className="flex flex-col gap-1.5 rounded-field bg-base-200 px-3 py-2.5">
          <h2 className="text-sm font-semibold">{t("start.title")}</h2>
          {plies < 1 ? (
            <p className="text-sm leading-5 text-base-content/80">{t("start.noMoves")}</p>
          ) : lines.length > 0 ? (
            <p className="text-sm leading-5 text-base-content/80" data-testid="debrief">
              {lines.join(" ")}
            </p>
          ) : run.state === "running" ? (
            <>
              <p className="text-sm leading-5 text-base-content/80" aria-live="polite">
                {t("start.analyzing", { done: run.done, total: run.total })}
              </p>
              <progress
                className="progress h-1.5 progress-primary"
                value={run.done}
                max={run.total}
                aria-label={t("report.progress")}
              />
            </>
          ) : (
            <p className="text-sm leading-5 text-base-content/80">
              {t("start.message", { white, black })}
            </p>
          )}
          {run.state === "error" && (
            <p role="alert" className="text-xs text-error">
              {t("review.status.error", { error: run.error ?? "" })}
            </p>
          )}
          {state.opening && (
            <p className="text-xs text-base-content/65" data-testid="opening-name">
              <span className="font-mono">{state.opening.eco}</span> {state.opening.name}
            </p>
          )}
        </section>

        <section aria-label={t("graph.title")}>
          <h3 className="panel-title px-1">{t("graph.title")}</h3>
          <EvalGraph byNode={state.byNode} height={84} />
        </section>

        <PlayersSummary review={review} />
        <ClassificationTable review={review} showAll />
      </div>

      <div className="flex flex-col gap-2 border-t border-base-content/10 p-3">
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="start-preset">
            {t("report.depthLabel")}
          </label>
          <select
            id="start-preset"
            className="select w-auto min-w-0 flex-1 select-sm"
            value={presetId}
            onChange={(e) => changePreset(e.target.value as PresetId)}
          >
            {ANALYSIS_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {t("preset.option", { name: t(`preset.${p.id}`), depth: p.limits.depth ?? 0 })}
              </option>
            ))}
          </select>
          <span className="text-xs text-base-content/55" aria-live="polite">
            {engine.state === "loading"
              ? t("engine.loading")
              : engine.state === "error"
                ? t("engine.unavailable")
                : t("review.engine.ready")}
          </span>
        </div>
        {failed && (
          <button
            type="button"
            className="btn w-full btn-soft btn-sm"
            onClick={() => void useAnalysis.getState().startGameAnalysis(presetId)}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {run.state === "cancelled" && run.done > 0 ? t("report.resume") : t("report.again")}
          </button>
        )}
        <button
          type="button"
          className="btn w-full btn-primary"
          disabled={!done || plies < 1}
          onClick={onStart}
        >
          <Play className="size-4" aria-hidden="true" />
          {t("start.button")}
        </button>
        {!done && plies >= 1 && !failed && (
          <p className="text-center text-xs text-base-content/55">{t("start.waiting")}</p>
        )}
      </div>
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
  const run = useAnalysis((s) => s.run);
  const presetId = useSettings((s) => s.presetId);
  const errors = useMemo(() => (review ? biggestErrors(review, 6) : []), [review]);
  const moments = useMemo(() => (review ? criticalMoments(review) : []), [review]);
  const themes = useMemo(() => (review ? themeSummary(review) : null), [review]);

  const rootPly = useAnalysis((s) => getNode(s.tree, s.tree.rootId).ply);
  // nodeIds is the main line from the root, one node per ply.
  const nodeOfPly = (ply: number) => nodeIds[ply - rootPly] ?? null;

  return (
    <section
      className="flex flex-col gap-4"
      aria-label={t("report.section")}
      data-testid="game-report"
    >
      {/* Controls and progress are only needed until the review is complete. */}
      {run.state !== "done" && <AnalysisRunner />}

      <p className="text-sm text-base-content/60">
        {[headers.Event, headers.Date, result !== "*" ? result : null]
          .filter((v) => v && v !== "?")
          .join(" · ")}
      </p>

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
          <PlayersSummary review={review} />

          <table className="table table-xs" data-testid="phase-precision">
            <caption className="sr-only">{t("report.phasesCaption")}</caption>
            <thead>
              <tr>
                <th scope="col" className="panel-title font-semibold">
                  {t("report.phases")}
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
              {PHASES.map((phase) => (
                <tr key={phase}>
                  <th scope="row" className="font-normal">
                    {t(`phase.${phase}` as MessageKey)}
                  </th>
                  {(["white", "black"] as const).map((side) => {
                    const precision = review[side].phases[phase].precision;
                    return (
                      <td key={side} className="tabular text-right font-mono">
                        {precision === null ? "—" : precision.toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {themes && Object.keys(themes.w).length + Object.keys(themes.b).length > 0 && (
            <div className="flex flex-col gap-1.5" data-testid="error-themes">
              <h3 className="panel-title">{t("report.themes")}</h3>
              <div className="flex gap-4">
                {(["w", "b"] as const).map((color) => (
                  <ul
                    key={color}
                    className="flex min-w-0 flex-1 flex-wrap content-start gap-1"
                    aria-label={color === "w" ? t("side.white") : t("side.black")}
                  >
                    {Object.entries(themes[color]).map(([theme, n]) => (
                      <li key={theme} className="badge badge-soft badge-sm badge-warning">
                        {t(`theme.${theme}` as MessageKey)} ×{n}
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            </div>
          )}

          <ClassificationTable review={review} />

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

          {run.state === "done" && (
            <button
              type="button"
              className="btn self-start btn-ghost btn-xs"
              onClick={() => void useAnalysis.getState().startGameAnalysis(presetId)}
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              {t("report.again")}
            </button>
          )}

          <p className="text-xs leading-5 text-base-content/50">{t("report.disclaimer")}</p>

          {/* The debrief closes the report. */}
          <Debrief review={review} />
        </>
      )}
    </section>
  );
}

/** Memoized: re-renders only when its props change, not on every engine update. */
export const GameReport = memo(GameReportImpl);

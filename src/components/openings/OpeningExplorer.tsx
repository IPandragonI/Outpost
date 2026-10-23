"use client";

import { useMemo, useState } from "react";
import { Cpu, Gauge, Play, Plus } from "lucide-react";
import { useAnalysis } from "@/features/analysis/store";
import { getEngineService } from "@/features/engine/browser-engine";
import { formatScore, scoreValueFor, type Score } from "@/features/engine/evaluation";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import type { BookMove } from "@/features/openings/opening-book";
import { positionKey, sideToMove, uciLineToSan } from "@/lib/chess/position";
import { useOpeningBook } from "@/hooks/useOpeningBook";
import { useT } from "@/lib/i18n/useT";

type SortKey = "lines" | "engine" | "name";

interface Candidate extends BookMove {
  /** Engine evaluation of the move (White point of view), when known. */
  score: Score | null;
  depth: number | null;
  /** Stockfish's own first choice in this position. */
  engineChoice: boolean;
}

/**
 * Opening theory for the position `fen`, compared with Stockfish: `analysis` is the live
 * engine result for that position. `onPreview` shows a line on the board without playing
 * it, `onPlay` plays a move; the caller decides what that means (a variation in the
 * analysis workspace, a step in the openings browser…).
 */
export function OpeningExplorer({
  fen,
  analysis,
  onPreview,
  onPlay,
}: {
  fen: string;
  analysis: PositionAnalysis | null;
  onPreview(uci: string[], label: string): void;
  onPlay(uci: string): void;
}) {
  const { book, status, error } = useOpeningBook();
  const livePositions = useAnalysis((s) => s.livePositions);
  const gamePositions = useAnalysis((s) => s.gamePositions);
  const recordLive = useAnalysis((s) => s.recordLive);
  const [sort, setSort] = useState<SortKey>("lines");
  const [evaluating, setEvaluating] = useState(false);
  const t = useT();

  const position = useMemo(() => book?.lookup(fen) ?? null, [book, fen]);
  const turn = sideToMove(fen);

  const candidates = useMemo<Candidate[]>(() => {
    if (!position) return [];
    const engineBest = analysis?.bestMove ?? null;
    const list = position.moves.map((move) => {
      // Prefer the score from the search of this position (same search, comparable);
      // otherwise a search of the position the move leads to.
      const line = analysis?.lines.find((l) => l.pv[0] === move.uci);
      const child = livePositions[positionKey(move.fen)] ?? gamePositions[positionKey(move.fen)];
      const score = line?.score ?? child?.score ?? null;
      const depth = line?.depth ?? child?.depth ?? null;
      return { ...move, score, depth, engineChoice: engineBest === move.uci };
    });
    return list.sort((a, b) => {
      if (sort === "name") return (a.opening?.name ?? "~").localeCompare(b.opening?.name ?? "~");
      if (sort === "engine") {
        if (!a.score) return 1;
        if (!b.score) return -1;
        return scoreValueFor(b.score, turn) - scoreValueFor(a.score, turn);
      }
      return b.lines - a.lines;
    });
  }, [position, analysis, livePositions, gamePositions, sort, turn]);

  const evaluateAll = async () => {
    setEvaluating(true);
    const service = getEngineService();
    try {
      for (const move of candidates.filter((c) => !c.score)) {
        const result = await service.analyze(
          move.fen,
          { depth: 14, multiPv: 1 },
          { priority: "background" },
        ).promise;
        recordLive(result);
      }
    } catch {
      // Cancelled or engine unavailable: the moves already evaluated stay shown.
    } finally {
      setEvaluating(false);
    }
  };

  if (status === "loading") {
    return <p className="text-sm text-base-content/60">{t("book.loading")}</p>;
  }
  if (status === "error") {
    return (
      <p role="alert" className="text-sm text-warning">
        {error && t(error)}
      </p>
    );
  }

  const names = position?.openings ?? [];
  const engineMoves = analysis?.lines ?? [];

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t("explorer.label")}
      data-testid="opening-explorer"
    >
      <div>
        {names.length > 0 ? (
          names.slice(0, 2).map((o) => (
            <p key={o.name} className="text-sm">
              <span className="mr-1.5 font-mono text-xs text-base-content/55">{o.eco}</span>
              <span className="font-medium">{o.family}</span>
              {o.variation && <span className="text-base-content/75">: {o.variation}</span>}
            </p>
          ))
        ) : position ? (
          <p className="text-sm text-base-content/70">{t("explorer.unnamed")}</p>
        ) : (
          <p className="text-sm text-base-content/70">
            {engineMoves.length ? t("explorer.outOfBookEngine") : t("explorer.outOfBook")}
          </p>
        )}
      </div>

      {candidates.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="panel-title">{t("explorer.theoryMoves")}</h3>
            <div className="join ml-auto" role="group" aria-label={t("explorer.sort")}>
              {(
                [
                  ["lines", "explorer.sort.theory"],
                  ["engine", "explorer.sort.engine"],
                  ["name", "explorer.sort.name"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`btn join-item btn-xs ${sort === key ? "btn-active" : ""}`}
                  aria-pressed={sort === key}
                  onClick={() => setSort(key)}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={evaluateAll}
              disabled={evaluating || candidates.every((c) => c.score)}
              title={t("explorer.evaluateHint")}
            >
              <Gauge className="size-3.5" aria-hidden="true" />
              {evaluating ? t("explorer.evaluating") : t("explorer.evaluateAll")}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr className="text-xs">
                  <th scope="col">{t("explorer.col.move")}</th>
                  <th scope="col">{t("explorer.col.leadsTo")}</th>
                  <th scope="col" className="text-right" title={t("explorer.col.linesHint")}>
                    {t("explorer.col.lines")}
                  </th>
                  <th scope="col" className="text-right">
                    Stockfish
                  </th>
                  <th scope="col">
                    <span className="sr-only">{t("explorer.col.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const continuation = book ? [c.uci, ...book.mainContinuation(c.fen, 9)] : [c.uci];
                  return (
                    <tr key={c.uci} className="hover:bg-base-200">
                      <td className="font-mono font-medium whitespace-nowrap">
                        <button
                          type="button"
                          className="rounded px-1 hover:bg-base-300"
                          onClick={() =>
                            onPreview(continuation, t("explorer.previewTheory", { san: c.san }))
                          }
                        >
                          {c.san}
                        </button>
                        {c.engineChoice && (
                          <span
                            className="ml-1 inline-flex items-center rounded bg-cls-best/20 px-1 text-[10px] font-normal text-cls-best"
                            title={t("explorer.sfChoice")}
                          >
                            <Cpu className="size-3" aria-hidden="true" />
                            <span className="ml-0.5">SF</span>
                          </span>
                        )}
                      </td>
                      <td className="max-w-56 truncate text-xs" title={c.opening?.name}>
                        {c.opening ? (
                          <>
                            <span className="font-mono text-base-content/55">{c.opening.eco}</span>{" "}
                            {c.opening.variation ?? c.opening.family}
                            {!c.namedHere && <span className="text-base-content/50"> …</span>}
                          </>
                        ) : (
                          <span className="text-base-content/50">—</span>
                        )}
                      </td>
                      <td className="tabular text-right font-mono text-xs">{c.lines}</td>
                      <td
                        className="tabular text-right font-mono text-xs"
                        title={c.depth ? `depth ${c.depth}` : undefined}
                      >
                        {c.score ? (
                          formatScore(c.score)
                        ) : (
                          <span className="text-base-content/40">—</span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <button
                          type="button"
                          className="btn btn-square btn-ghost btn-xs"
                          onClick={() =>
                            onPreview(continuation, t("explorer.previewTheory", { san: c.san }))
                          }
                          aria-label={t("explorer.previewMain", { san: c.san })}
                          title={t("explorer.mainLine", {
                            line: uciLineToSan(fen, continuation).join(" "),
                          })}
                        >
                          <Play className="size-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-square btn-ghost btn-xs"
                          onClick={() => onPlay(c.uci)}
                          aria-label={t("explorer.play", { san: c.san })}
                        >
                          <Plus className="size-3" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!position && engineMoves.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="panel-title">{t("explorer.suggestions")}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {engineMoves.map((l) => {
              const san = uciLineToSan(fen, l.pv.slice(0, 1))[0];
              return (
                <li key={l.multipv}>
                  <button
                    type="button"
                    className="btn btn-soft font-mono btn-xs"
                    onClick={() => onPreview(l.pv, `Stockfish: ${san}`)}
                  >
                    {san} <span className="text-base-content/60">{formatScore(l.score)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-xs leading-5 text-base-content/50">{t("explorer.disclaimer")}</p>
    </section>
  );
}

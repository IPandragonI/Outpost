"use client";

import { ArrowDownToLine, Cpu, Play, Plus } from "lucide-react";
import { useAnalysis } from "@/features/analysis/store";
import { formatScore } from "@/features/engine/evaluation";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import { useSettings } from "@/features/settings/settings-store";
import { gameEndOf, uciLineToSan } from "@/lib/chess/position";
import { useEngineStatus, type LiveAnalysis } from "@/hooks/useLiveAnalysis";
import type { Translate } from "@/lib/i18n/translate";
import { useT } from "@/lib/i18n/useT";

function formatNodes(t: Translate, nodes?: number): string | null {
  if (!nodes) return null;
  const n =
    nodes >= 1e6
      ? `${(nodes / 1e6).toFixed(1)}M`
      : nodes >= 1e3
        ? `${Math.round(nodes / 1e3)}k`
        : nodes;
  return t("engine.nodes", { n });
}

function EngineLines({ analysis, fen }: { analysis: PositionAnalysis; fen: string }) {
  const { previewFromBoard, playFromBoard } = useAnalysis.getState();
  const t = useT();
  return (
    <ol className="flex flex-col divide-y divide-base-content/8" aria-label={t("engine.lines")}>
      {analysis.lines.map((line, index) => {
        const san = uciLineToSan(fen, line.pv).slice(0, 14);
        const startsBlack = fen.split(" ")[1] === "b";
        const moveNo = Number(fen.split(" ")[5] ?? 1);
        return (
          <li key={line.multipv} className="flex items-start gap-2 py-1.5">
            <span
              className={`tabular mt-0.5 min-w-14 rounded px-1.5 py-0.5 text-center font-mono text-[12.5px] font-medium ${
                (line.score.kind === "cp" ? line.score.cp >= 0 : line.score.winner === "w")
                  ? "bg-eval-white text-eval-black"
                  : "bg-eval-black text-eval-white ring-1 ring-base-content/15"
              }`}
            >
              {formatScore(line.score)}
            </span>
            <p className="min-w-0 flex-1 font-mono text-[13px] leading-6">
              {index === 0 && <span className="sr-only">{t("engine.bestLineSr")} </span>}
              {san.map((move, i) => {
                const ply = i + (startsBlack ? 1 : 0);
                const number = Math.floor(ply / 2) + moveNo;
                const showNumber = ply % 2 === 0 || i === 0;
                return (
                  <span key={i}>
                    {showNumber && (
                      <span className="text-base-content/45">
                        {number}
                        {ply % 2 === 0 ? "." : "…"}
                      </span>
                    )}
                    <button
                      type="button"
                      className={`rounded px-0.5 hover:bg-base-300 ${i === 0 ? "font-semibold" : ""}`}
                      onClick={() =>
                        previewFromBoard(line.pv, t("engine.lineLabel", { n: index + 1 }), i + 1)
                      }
                    >
                      {move}
                    </button>{" "}
                  </span>
                );
              })}
            </p>
            <div className="flex shrink-0 gap-0.5">
              <button
                type="button"
                className="btn btn-square btn-ghost btn-sm"
                onClick={() =>
                  previewFromBoard(line.pv, t("engine.lineLabel", { n: index + 1 }), 1)
                }
                aria-label={t("engine.previewLine", { n: index + 1 })}
                title={t("engine.previewHint")}
              >
                <Play className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn-square btn-ghost btn-sm"
                onClick={() => playFromBoard(line.pv.slice(0, 8))}
                aria-label={t("engine.addLine", { n: index + 1 })}
                title={t("engine.addHint")}
              >
                <Plus className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Live Stockfish analysis of the position on the board. */
export function EnginePanel({ live, fen }: { live: LiveAnalysis; fen: string }) {
  const t = useT();
  const status = useEngineStatus();
  const enabled = useSettings((s) => s.liveEngine);
  const multiPv = useSettings((s) => s.liveMultiPv);
  const setSettings = useSettings((s) => s.set);
  const end = gameEndOf(fen);
  const analysis = live.analysis;

  return (
    <section className="flex flex-col gap-2" aria-label={t("engine.section")}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="toggle toggle-primary toggle-sm"
            checked={enabled}
            onChange={(e) => setSettings({ liveEngine: e.target.checked })}
          />
          <span className="flex items-center gap-1.5">
            <Cpu className="size-4 text-base-content/60" aria-hidden="true" />
            Stockfish
          </span>
        </label>
        <span className="tabular text-xs text-base-content/60" aria-live="polite">
          {!enabled
            ? t("engine.off")
            : status.state === "loading"
              ? t("engine.loading")
              : status.state === "error"
                ? t("engine.unavailable")
                : analysis
                  ? `${t("engine.depth", { n: analysis.depth })}${
                      live.searching || analysis.complete ? "" : ` ${t("engine.stopped")}`
                    }${formatNodes(t, analysis.nodes) ? ` · ${formatNodes(t, analysis.nodes)}` : ""}`
                  : live.searching
                    ? t("engine.thinking")
                    : ""}
        </span>
        {live.searching && enabled && (
          <span className="loading loading-xs loading-dots text-primary" aria-hidden="true" />
        )}
        {live.light && enabled && (
          <span
            className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] text-primary"
            title={t("engine.lightHint")}
          >
            {t("engine.light")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <label className="sr-only" htmlFor="multipv">
            {t("engine.lineCount")}
          </label>
          <select
            id="multipv"
            className="select w-auto select-xs"
            value={multiPv}
            onChange={(e) => setSettings({ liveMultiPv: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {t("engine.nLines", { n })}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={live.deeper}
            disabled={!enabled || live.searching || Boolean(end)}
            title={t("engine.deeperHint")}
          >
            <ArrowDownToLine className="size-3.5" aria-hidden="true" />
            {t("engine.deeper")}
          </button>
        </div>
      </div>

      {status.state === "error" && enabled && (
        <div role="alert" className="alert alert-soft py-2 text-sm alert-error">
          <span>{t("engine.startError", { detail: status.message })}</span>
        </div>
      )}
      {live.error && status.state !== "error" && (
        <div role="alert" className="alert alert-soft py-2 text-sm alert-warning">
          {live.error}
        </div>
      )}

      {end ? (
        <p className="rounded-field bg-base-200 px-3 py-2 text-sm">
          {end.kind === "checkmate"
            ? t(end.winner === "w" ? "end.whiteMates" : "end.blackMates")
            : end.kind === "stalemate"
              ? t("end.stalemate")
              : end.kind === "insufficient-material"
                ? t("end.insufficient")
                : t("end.fiftyMoves")}
        </p>
      ) : analysis && analysis.lines.length > 0 ? (
        <EngineLines analysis={analysis} fen={fen} />
      ) : enabled ? (
        <p className="px-1 py-2 text-sm text-base-content/55">
          {status.state === "error" ? "" : t("engine.searching")}
        </p>
      ) : (
        <p className="px-1 py-2 text-sm text-base-content/55">{t("engine.turnOn")}</p>
      )}
    </section>
  );
}

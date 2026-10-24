"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAnalysis } from "@/features/analysis/store";
import { getEngineService } from "@/features/engine/browser-engine";
import { isAbortError, type EngineStatus } from "@/features/engine/engine-service";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import { useSettings } from "@/features/settings/settings-store";
import { positionKey } from "@/lib/chess/position";

const IDLE: EngineStatus = { state: "idle" };

export function useEngineStatus(): EngineStatus {
  return useSyncExternalStore(
    (callback) => getEngineService().subscribe(callback),
    () => getEngineService().status,
    () => IDLE,
  );
}

/** While the whole game is reviewed, the board gets a short single-line search only. */
const REVIEW_DEPTH = 14;

export interface LiveAnalysis {
  /** Best known analysis of `fen` (live search in progress, or a stored result). */
  analysis: PositionAnalysis | null;
  searching: boolean;
  /** The game review is running: the live search is kept light to leave it the engine. */
  light: boolean;
  error: string | null;
  /** Searches this position again, deeper than before. */
  deeper(): void;
}

/**
 * Analyzes `fen` with the interactive engine priority while it is on the board.
 *
 * While the whole-game review runs, the board's search is cut to one line at a modest
 * depth: interactive searches preempt the review, so a light one hands the engine back
 * quickly and the report is ready sooner.
 *
 * Results are tied to the position they were asked for: when the board changes, the
 * running search is cancelled and its late updates are ignored, so a stale evaluation is
 * never shown for a new position. Each result is also recorded in the store, so going
 * back to a position shows what was already found while the engine works further.
 */
export function useLiveAnalysis(fen: string): LiveAnalysis {
  const enabled = useSettings((s) => s.liveEngine);
  const light = useAnalysis((s) => s.run.state === "running");
  const settingsMultiPv = useSettings((s) => s.liveMultiPv);
  const settingsDepth = useSettings((s) => s.liveDepth);
  const multiPv = light ? 1 : settingsMultiPv;
  const baseDepth = light ? Math.min(settingsDepth, REVIEW_DEPTH) : settingsDepth;
  const recordLive = useAnalysis((s) => s.recordLive);
  const key = positionKey(fen);
  const stored = useAnalysis((s) => s.livePositions[key] ?? s.gamePositions[key] ?? null);

  const [extraDepth, setExtraDepth] = useState({ key, depth: 0 });
  const depth = baseDepth + (extraDepth.key === key ? extraDepth.depth : 0);
  const requestKey = `${fen}|${depth}|${multiPv}`;
  // Each result carries the request it answers; anything else is stale.
  const [state, setState] = useState<{
    requestKey: string;
    fen: string;
    analysis: PositionAnalysis | null;
    done: boolean;
    error: string | null;
  }>({ requestKey: "", fen: "", analysis: null, done: false, error: null });

  useEffect(() => {
    if (!enabled) return;
    const service = getEngineService();
    let active = true;
    const handle = service.analyze(
      fen,
      { depth, multiPv },
      {
        priority: "interactive",
        onUpdate: (analysis) => {
          if (active && analysis.fen === fen) {
            setState({ requestKey, fen, analysis, done: false, error: null });
          }
        },
      },
    );
    handle.promise.then(
      (analysis) => {
        if (!active || analysis.fen !== fen) return;
        setState({ requestKey, fen, analysis, done: true, error: null });
        if (analysis.complete || analysis.depth >= 12) recordLive(analysis);
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        setState({
          requestKey,
          fen,
          analysis: null,
          done: true,
          error: error instanceof Error ? error.message : "The engine failed.",
        });
      },
    );
    return () => {
      active = false;
      handle.cancel();
    };
  }, [enabled, fen, depth, multiPv, requestKey, recordLive]);

  const current = state.requestKey === requestKey ? state : null;
  // While a deeper search of the same position starts, keep showing the previous one.
  const live = state.fen === fen ? state.analysis : null;
  const analysis =
    live &&
    (!stored ||
      live.depth >= stored.depth ||
      stored.lines.length < Math.min(multiPv, live.lines.length))
      ? live
      : (stored ?? live);
  const searching = enabled && !current?.done;

  return {
    analysis,
    searching,
    light,
    error: current?.error ?? null,
    deeper: () =>
      setExtraDepth((d) => ({
        key,
        depth: (d.key === key ? d.depth : 0) + Math.max(4, Math.round(baseDepth / 4)),
      })),
  };
}

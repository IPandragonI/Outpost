"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAnalysis } from "@/features/analysis/store";
import { isValidFen } from "@/lib/chess/position";
import { AnalysisWorkspace } from "./AnalysisWorkspace";
import { useT } from "@/lib/i18n/useT";

/**
 * `/analysis?game=<id>` opens a saved game, `/analysis?fen=<fen>` a position on a fresh
 * board, `/analysis?moves=e2e4,e7e5` a line from the initial position; `/analysis` alone
 * keeps whatever was being analyzed, so moving between pages never loses the position.
 */
export function AnalysisPage() {
  const t = useT();
  const params = useSearchParams();
  const gameParam = params.get("game");
  const fenParam = params.get("fen");
  const movesParam = params.get("moves");
  const gameId = useAnalysis((s) => s.gameId);
  const loading = useAnalysis((s) => s.loading);
  const loadError = useAnalysis((s) => s.loadError);

  useEffect(() => {
    const store = useAnalysis.getState();
    if (gameParam) {
      void store.loadGame(gameParam);
    } else if (fenParam && isValidFen(fenParam)) {
      store.newBoard(fenParam);
    } else if (movesParam !== null) {
      // A line from the openings page: entered as the moves of a new board.
      store.newBoard();
      for (const uci of movesParam.split(",").filter(Boolean)) {
        if (!store.playMove(uci)) break;
      }
      window.history.replaceState(null, "", "/analysis");
    } else if (store.gameId) {
      window.history.replaceState(null, "", `/analysis?game=${store.gameId}`);
    }
  }, [gameParam, fenParam, movesParam]);

  if (loadError) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <p role="alert">{t(loadError.key, loadError.vars)}</p>
        <Link href="/games" className="btn btn-primary btn-sm">
          {t("analysis.backToLibrary")}
        </Link>
      </div>
    );
  }
  if (gameParam && (loading || gameId !== gameParam)) {
    return <div className="p-6 text-sm text-base-content/60">{t("analysis.opening")}</div>;
  }
  return <AnalysisWorkspace />;
}

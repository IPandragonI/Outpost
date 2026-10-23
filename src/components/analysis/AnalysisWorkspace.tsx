"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Download, FilePlus2, Pencil, Save, X } from "lucide-react";
import type { Arrow } from "react-chessboard";
import { ChessBoard, type BoardMove } from "@/components/board/ChessBoard";
import { useAnalysis, useBoardFen } from "@/features/analysis/store";
import { buildAnalysisExport } from "@/features/analysis/analysis-export";
import { exportLine, exportPgn } from "@/features/games/pgn-export";
import { getNode, mainline, pathTo } from "@/features/games/variation-tree";
import { useSettings } from "@/features/settings/settings-store";
import { gameRecordFrom } from "@/features/storage/repositories";
import { describeStorageError } from "@/features/storage/database";
import { formatScore } from "@/features/engine/evaluation";
import { parseUci, uciLineToSan } from "@/lib/chess/position";
import { downloadText, slugify } from "@/lib/download";
import { useGameReview } from "@/hooks/useGameReview";
import { useLiveAnalysis } from "@/hooks/useLiveAnalysis";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useMoveSound } from "@/hooks/useMoveSound";
import { useOpeningBook } from "@/hooks/useOpeningBook";
import { OpeningExplorer } from "@/components/openings/OpeningExplorer";
import { EnginePanel } from "./EnginePanel";
import { EvalBar } from "./EvalBar";
import { EvalGraph } from "./EvalGraph";
import { GameReport } from "./GameReport";
import { MoveInsight } from "./MoveInsight";
import { MoveList } from "./MoveList";
import { NavControls } from "./NavControls";
import { useLocale, useT } from "@/lib/i18n/useT";

type Tab = "moves" | "engine" | "openings" | "report";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest("input, textarea, select, [contenteditable=true]"));
}

/** Arrow keys, Home/End, F to flip, Escape to leave a preview. */
function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTyping(event.target)
      )
        return;
      const s = useAnalysis.getState();
      const actions: Record<string, () => void> = {
        ArrowLeft: s.prev,
        ArrowRight: s.next,
        ArrowUp: s.first,
        Home: s.first,
        ArrowDown: s.last,
        End: s.last,
        f: s.flip,
        Escape: s.closePreview,
      };
      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function PreviewBanner() {
  const preview = useAnalysis((s) => s.preview);
  const { previewStep, closePreview, keepPreview } = useAnalysis.getState();
  const t = useT();
  if (!preview) return null;
  return (
    <div
      className="panel flex flex-col gap-1.5 border-accent/40 px-3 py-2"
      role="region"
      aria-label={t("preview.label")}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-accent">{preview.label}</span>
        <span className="tabular text-xs text-base-content/55">
          {t("preview.step", { step: preview.step, total: preview.uci.length })}
        </span>
        <button
          type="button"
          className="btn ml-auto btn-ghost btn-xs"
          onClick={keepPreview}
          disabled={preview.step === 0}
        >
          {t("preview.keep")}
        </button>
        <button
          type="button"
          className="btn btn-square btn-ghost btn-xs"
          onClick={closePreview}
          aria-label={t("preview.close")}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <p className="font-mono text-[13px] leading-6">
        {preview.san.map((san, i) => (
          <button
            key={i}
            type="button"
            onClick={() => previewStep(i + 1)}
            className={`mr-1 rounded px-1 ${preview.step === i + 1 ? "bg-accent text-accent-content" : "hover:bg-base-300"}`}
          >
            {san}
          </button>
        ))}
      </p>
    </div>
  );
}

function PlayerBar({ color }: { color: "w" | "b" }) {
  const headers = useAnalysis((s) => s.headers);
  const t = useT();
  const tree = useAnalysis((s) => s.tree);
  const currentId = useAnalysis((s) => s.currentId);
  const name = color === "w" ? headers.White : headers.Black;
  const elo = color === "w" ? headers.WhiteElo : headers.BlackElo;
  // Clock after this player's last move on the path to the current position.
  const clock = useMemo(() => {
    const path = pathTo(tree, currentId);
    for (let i = path.length - 1; i > 0; i--) {
      const node = path[i]!;
      const mover = node.ply % 2 === 1 ? "w" : "b";
      if (mover === color && node.clock !== undefined) return node.clock;
    }
    return undefined;
  }, [tree, currentId, color]);
  const known = name && name !== "?";
  return (
    <div className="flex h-7 items-center gap-2 px-0.5 text-sm">
      <span
        className={`inline-block size-3 rounded-sm ring-1 ring-base-content/30 ${color === "w" ? "bg-eval-white" : "bg-eval-black"}`}
        aria-hidden="true"
      />
      <span className="truncate font-medium">
        {known ? name : color === "w" ? t("side.white") : t("side.black")}
      </span>
      {elo && elo !== "?" && <span className="tabular text-xs text-base-content/55">{elo}</span>}
      {clock !== undefined && (
        <span className="tabular ml-auto rounded bg-base-300 px-1.5 font-mono text-xs">
          {Math.floor(clock / 3600) > 0 ? `${Math.floor(clock / 3600)}:` : ""}
          {String(Math.floor((clock % 3600) / 60)).padStart(
            Math.floor(clock / 3600) > 0 ? 2 : 1,
            "0",
          )}
          :{String(Math.floor(clock % 60)).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}

function Toolbar() {
  const title = useAnalysis((s) => s.title);
  const gameId = useAnalysis((s) => s.gameId);
  const saveError = useAnalysis((s) => s.saveError);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [message, setMessage] = useState<string | null>(null);
  const review = useGameReview();
  const locale = useLocale();
  const t = useT();

  const exportGame = (includeExplorations: boolean) => {
    const s = useAnalysis.getState();
    const pgn = exportPgn(s.tree, s.headers, s.result, { includeExplorations });
    downloadText(`${slugify(s.title)}.pgn`, pgn, "application/x-chess-pgn");
  };
  const exportCurrentLine = () => {
    const s = useAnalysis.getState();
    downloadText(
      `${slugify(s.title)}-line.pgn`,
      exportLine(s.tree, s.currentId, s.headers),
      "application/x-chess-pgn",
    );
  };
  const exportAnalysis = () => {
    const s = useAnalysis.getState();
    const data = buildAnalysisExport({
      title: s.title,
      headers: s.headers,
      pgn: s.pgn || exportPgn(s.tree, s.headers, s.result),
      line: mainline(s.tree),
      positions: s.gamePositions,
      review: review.review,
      presetId: s.run.presetId,
    });
    downloadText(
      `${slugify(s.title)}-analysis.json`,
      JSON.stringify(data, null, 2),
      "application/json",
    );
  };
  const saveToLibrary = async () => {
    const s = useAnalysis.getState();
    if (mainline(s.tree).length < 2) {
      setMessage(t("toolbar.saveNeedsMove"));
      return;
    }
    try {
      const record = gameRecordFrom(
        {
          headers: { Event: t("analysis.boardEvent"), ...s.headers },
          tree: s.tree,
          result: s.result,
          source: "",
        },
        review.opening,
      );
      record.title =
        s.title || t("analysis.savedTitle", { date: new Date().toLocaleDateString(locale) });
      await s.saveAsNew(record);
      window.history.replaceState(null, "", `/analysis?game=${record.id}`);
      setMessage(t("toolbar.saved"));
    } catch (error) {
      setMessage(describeStorageError(error, t));
    }
  };

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-2">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void useAnalysis.getState().setTitle(draft);
            setEditing(false);
          }}
        >
          <label htmlFor="title" className="sr-only">
            {t("toolbar.gameName")}
          </label>
          <input
            id="title"
            className="input flex-1 input-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            maxLength={120}
          />
          <button type="submit" className="btn btn-primary btn-sm">
            {t("common.rename")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <h1 className="flex min-w-0 flex-1 items-center gap-1 text-base font-semibold">
          <span className="truncate">{title || t("analysis.untitled")}</span>
          <button
            type="button"
            className="btn btn-square btn-ghost btn-xs"
            onClick={() => {
              setDraft(title || t("analysis.untitled"));
              setEditing(true);
            }}
            aria-label={t("common.rename")}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
        </h1>
      )}
      {!gameId && (
        <button type="button" className="btn btn-soft btn-sm" onClick={saveToLibrary}>
          <Save className="size-4" aria-hidden="true" />
          {t("toolbar.save")}
        </button>
      )}
      <div className="dropdown dropdown-end">
        <button type="button" tabIndex={0} className="btn btn-ghost btn-sm" aria-haspopup="menu">
          <Download className="size-4" aria-hidden="true" />
          {t("toolbar.export")}
        </button>
        <ul
          tabIndex={0}
          className="menu dropdown-content z-20 w-64 rounded-box border border-base-content/10 bg-base-100 p-1 text-sm"
          role="menu"
        >
          <li role="none">
            <button type="button" role="menuitem" onClick={() => exportGame(false)}>
              {t("toolbar.exportGame")}
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={() => exportGame(true)}>
              {t("toolbar.exportWithVariations")}
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={exportCurrentLine}>
              {t("toolbar.exportLine")}
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={exportAnalysis}>
              {t("toolbar.exportAnalysis")}
            </button>
          </li>
        </ul>
      </div>
      <Link href="/games" className="btn btn-ghost btn-sm" title={t("toolbar.importHint")}>
        <FilePlus2 className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{t("toolbar.import")}</span>
      </Link>
      {(message || saveError) && (
        <p role="status" className="w-full text-xs text-base-content/65">
          {saveError ? t(saveError.key, saveError.vars) : message}
        </p>
      )}
    </div>
  );
}

function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: Tab; label: string }[];
  active: Tab;
  onChange(tab: Tab): void;
}) {
  const t = useT();
  return (
    <div
      role="tablist"
      className="flex gap-0.5 border-b border-base-content/10"
      aria-label={t("tabs.label")}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={active === t.id}
          aria-controls={`panel-${t.id}`}
          onClick={() => onChange(t.id)}
          className={`-mb-px min-h-11 flex-1 border-b-2 px-2 text-sm font-medium transition-colors sm:min-h-10 ${
            active === t.id
              ? "border-primary text-base-content"
              : "border-transparent text-base-content/60 hover:text-base-content"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Plays the move sound when the position advances by one move (played or stepped to). */
function useNavigationSound() {
  const tree = useAnalysis((s) => s.tree);
  const currentId = useAnalysis((s) => s.currentId);
  const play = useMoveSound();
  const previous = useRef(currentId);
  useEffect(() => {
    const node = tree.nodes[currentId];
    if (node?.san && node.parentId === previous.current) play({ san: node.san });
    previous.current = currentId;
  }, [currentId, tree, play]);
}

export function AnalysisWorkspace() {
  const t = useT();
  useKeyboardShortcuts();
  useNavigationSound();
  const fen = useBoardFen();
  const tree = useAnalysis((s) => s.tree);
  const currentId = useAnalysis((s) => s.currentId);
  const preview = useAnalysis((s) => s.preview);
  const orientation = useAnalysis((s) => s.orientation);
  const playMove = useAnalysis((s) => s.playMove);
  const bestArrow = useSettings((s) => s.bestMoveArrow);
  const boardBadges = useSettings((s) => s.boardBadges);
  const wide = useMediaQuery("(min-width: 1280px)");
  const desktop = useMediaQuery("(min-width: 1024px)");
  const reviewState = useGameReview();
  const live = useLiveAnalysis(fen);
  useOpeningBook();

  const [tab, setTab] = useState<Tab>("moves");
  const activeTab: Tab = wide && tab === "moves" ? "engine" : tab;

  const node = getNode(tree, currentId);
  const lastMove = useMemo(() => {
    const uci = preview ? (preview.step > 0 ? preview.uci[preview.step - 1] : node.uci) : node.uci;
    return uci ? parseUci(uci) : null;
  }, [preview, node.uci]);

  // Board props stay identical while only the engine's numbers change, so the (memoized)
  // board does not re-render — and its piece animations are not interrupted — on every
  // live update.
  const best = live.analysis?.bestMove ?? null;
  const nextPreviewMove = preview && preview.step < preview.uci.length ? preview.uci[preview.step]! : null;
  const arrows = useMemo<Arrow[]>(() => {
    const list: Arrow[] = [];
    if (bestArrow && best && !preview) {
      const { from, to } = parseUci(best);
      list.push({ startSquare: from, endSquare: to, color: "rgba(140, 197, 106, 0.85)" });
    }
    if (nextPreviewMove) {
      const { from, to } = parseUci(nextPreviewMove);
      list.push({ startSquare: from, endSquare: to, color: "rgba(79, 184, 168, 0.85)" });
    }
    return list;
  }, [bestArrow, best, preview, nextPreviewMove]);

  const classification = !preview ? reviewState.byNode[currentId]?.classification : undefined;
  const badgeSquare = boardBadges && classification && lastMove ? lastMove.to : null;
  const badge = useMemo(
    () => (badgeSquare && classification ? { square: badgeSquare, classification } : null),
    [badgeSquare, classification],
  );

  const onMove = useCallback((move: BoardMove) => {
    playMove(move);
  }, [playMove]);

  const score = live.analysis?.score ?? null;
  const topColor = orientation === "white" ? "b" : "w";
  const bottomColor = orientation === "white" ? "w" : "b";

  const tabs: { id: Tab; label: string }[] = [
    ...(wide ? [] : [{ id: "moves" as Tab, label: t("tabs.moves") }]),
    { id: "engine", label: t("tabs.engine") },
    { id: "openings", label: t("tabs.openings") },
    { id: "report", label: t("tabs.report") },
  ];

  const panels: Record<Tab, ReactNode> = {
    moves: (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {/* The current move's assessment comes first, above the moves. */}
        <div className="px-1">
          <MoveInsight byNode={reviewState.byNode} />
        </div>
        <div className="flex max-h-[50vh] min-h-40 flex-col overflow-hidden rounded-field border border-base-content/8 lg:max-h-none lg:flex-1">
          <MoveList byNode={reviewState.byNode} />
        </div>
      </div>
    ),
    engine: <EnginePanel live={live} fen={fen} />,
    openings: (
      <OpeningExplorer
        fen={fen}
        analysis={live.analysis}
        onPreview={(uci, label) => useAnalysis.getState().previewFromBoard(uci, label)}
        onPlay={(uci) => useAnalysis.getState().playFromBoard([uci])}
      />
    ),
    report: <GameReport state={reviewState} />,
  };

  const pvSan = live.analysis?.lines[0]
    ? uciLineToSan(fen, live.analysis.lines[0].pv.slice(0, 1))[0]
    : null;

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-3 px-2 pt-2 pb-24 sm:px-4 sm:pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:pb-4 xl:grid-cols-[minmax(0,1fr)_300px_minmax(360px,420px)]">
      {/* Board column */}
      <section className="flex min-w-0 flex-col gap-2" aria-label="Board">
        <Toolbar />
        <div className="mx-auto flex w-full flex-col gap-1 lg:max-w-[min(100%,calc(100dvh-10rem))]">
          <PlayerBar color={topColor} />
          <div className="flex gap-2">
            <div className="hidden sm:flex">
              <EvalBar score={score} orientation={orientation} pending={live.searching} />
            </div>
            <div className="min-w-0 flex-1">
              <ChessBoard
                fen={fen}
                orientation={orientation}
                lastMove={lastMove}
                arrows={arrows}
                badge={badge}
                onMove={onMove}
              />
            </div>
          </div>
          <PlayerBar color={bottomColor} />
          <div className="flex items-center gap-2 sm:hidden">
            <EvalBar score={score} orientation={orientation} direction="horizontal" />
            <span className="tabular min-w-24 text-right font-mono text-xs" aria-hidden="true">
              {score ? `${pvSan ? `${pvSan} ` : ""}${formatScore(score)}` : "…"}
            </span>
          </div>
        </div>
        <PreviewBanner />
        {/* Desktop navigation under the board. */}
        <div className="hidden lg:block xl:hidden">
          <NavControls />
        </div>
      </section>

      {/* Wide screens: moves in their own column. */}
      {wide && (
        <aside
          className="panel flex max-h-[calc(100dvh-5.5rem)] min-h-0 flex-col gap-2 p-2"
          aria-label={t("tabs.moves")}
        >
          {/* The current move's assessment comes first, above the moves. */}
          <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-base-content/10 px-1 pb-2">
            <MoveInsight byNode={reviewState.byNode} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-field">
            <MoveList byNode={reviewState.byNode} />
          </div>
          <NavControls />
        </aside>
      )}

      {/* Panels: tabs on every size. */}
      <aside
        className="panel flex min-h-0 flex-col lg:max-h-[calc(100dvh-5.5rem)]"
        aria-label={t("tabs.analysis")}
      >
        {/* The advantage chart stays in view whatever the tab. */}
        <div className="border-b border-base-content/10 px-2 pt-2 pb-1">
          <h2 className="panel-title px-1">{t("graph.title")}</h2>
          <EvalGraph byNode={reviewState.byNode} height={desktop ? 96 : 72} />
        </div>
        <Tabs tabs={tabs} active={activeTab} onChange={setTab} />
        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3"
        >
          {panels[activeTab]}
        </div>
      </aside>

      {/* Phones and tablets: navigation within thumb reach. */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-base-content/10 bg-base-100/95 px-2 pt-1 backdrop-blur lg:hidden">
        <NavControls compact />
      </div>
    </div>
  );
}

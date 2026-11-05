"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, FilePlus2, Keyboard, Pencil, Save, X } from "lucide-react";
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
import type { CapturedPieces as CapturedPiecesData } from "@/features/analysis/captured-pieces";
import { useCapturedPieces } from "@/hooks/useCapturedPieces";
import { useGameReview } from "@/hooks/useGameReview";
import { useLiveAnalysis } from "@/hooks/useLiveAnalysis";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useMoveSound } from "@/hooks/useMoveSound";
import { useOpeningBook } from "@/hooks/useOpeningBook";
import { CapturedPieces } from "./CapturedPieces";
import { EnginePanel } from "./EnginePanel";
import { EvalBar } from "./EvalBar";
import { EvalGraph } from "./EvalGraph";
import { ExplorerSection, GameReport } from "./GameReport";
import { MoveList } from "./MoveList";
import { NavControls } from "./NavControls";
import type { MessageKey } from "@/lib/i18n/messages";
import { useLocale, useT } from "@/lib/i18n/useT";

type Tab = "review" | "engine";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(
    el?.closest(
      "input, textarea, select, [contenteditable=true], [contenteditable=''], dialog[open]",
    ),
  );
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

function PlayerBar({ color, captured }: { color: "w" | "b"; captured: CapturedPiecesData }) {
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
      <CapturedPieces
        pieces={color === "w" ? captured.byWhite : captured.byBlack}
        pieceColor={color === "w" ? "b" : "w"}
        advantage={Math.max(0, color === "w" ? captured.balance : -captured.balance)}
      />
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

const SHORTCUTS: { keys: string[]; label: MessageKey }[] = [
  { keys: ["←"], label: "shortcuts.prev" },
  { keys: ["→"], label: "shortcuts.next" },
  { keys: ["Home", "↑"], label: "shortcuts.first" },
  { keys: ["End", "↓"], label: "shortcuts.last" },
  { keys: ["F"], label: "shortcuts.flip" },
  { keys: ["Esc"], label: "shortcuts.close" },
];

/** A small popover listing the keyboard shortcuts of the analysis board. */
function ShortcutsHelp() {
  const t = useT();
  return (
    <div className="dropdown dropdown-end hidden sm:block">
      <button
        type="button"
        tabIndex={0}
        className="btn btn-square btn-ghost btn-sm"
        aria-haspopup="true"
        aria-label={t("shortcuts.title")}
        title={t("shortcuts.title")}
      >
        <Keyboard className="size-4" aria-hidden="true" />
      </button>
      <div
        tabIndex={0}
        className="dropdown-content z-20 w-60 rounded-box border border-base-content/10 bg-base-100 p-3 text-sm shadow-sm"
      >
        <h2 className="panel-title mb-2">{t("shortcuts.title")}</h2>
        <dl className="flex flex-col gap-1.5">
          {SHORTCUTS.map(({ keys, label }) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <dt className="text-base-content/75">{t(label)}</dt>
              <dd className="flex gap-1">
                {keys.map((k) => (
                  <kbd key={k} className="kbd kbd-sm">
                    {k}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
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
      <ShortcutsHelp />
      {review.opening && (
        <p className="w-full truncate text-xs text-base-content/65" data-testid="game-opening">
          <span className="font-mono text-base-content/55">{review.opening.eco}</span>{" "}
          {review.opening.name}
        </p>
      )}
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

/**
 * Plays the move sound for a move the user makes on the board. Stepping through an
 * existing game is silent unless "sounds when navigating" is on in the settings; either
 * way only forward steps (to a child of the previous position) make a sound.
 */
function useNavigationSound(userMoveRef: { current: boolean }) {
  const tree = useAnalysis((s) => s.tree);
  const currentId = useAnalysis((s) => s.currentId);
  const onNavigate = useSettings((s) => s.soundOnNavigate);
  const play = useMoveSound();
  const previous = useRef(currentId);
  useEffect(() => {
    const node = tree.nodes[currentId];
    const byUser = userMoveRef.current;
    userMoveRef.current = false;
    if (node?.san && node.parentId === previous.current && (byUser || onNavigate)) {
      play({ san: node.san, fen: node.fen });
    }
    previous.current = currentId;
  }, [currentId, tree, play, onNavigate, userMoveRef]);
}

/**
 * Starts the whole-game analysis when a game is opened, unless it was already analyzed
 * (the stored results are loaded before this screen shows) or the user stopped it. A
 * partial analysis from an earlier visit resumes with the preset it was started with.
 * Boards typed in by hand are analyzed on request only: they change with every move.
 */
function useAutoAnalysis() {
  const gameId = useAnalysis((s) => s.gameId);
  const runState = useAnalysis((s) => s.run.state);
  const loading = useAnalysis((s) => s.loading);
  const presetId = useSettings((s) => s.presetId);
  const hydrated = useSettings((s) => s.hydrated);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !hydrated) return;
    const s = useAnalysis.getState();
    if (!s.gameId && !s.pgn) return;
    if (mainline(s.tree).length < 2) return;
    const key = s.gameId ?? s.pgn;
    if (started.current === key) return;
    started.current = key;
    if (s.run.state === "running" || s.run.state === "done") return;
    if (s.run.state === "cancelled" && s.run.userStopped) return;
    void s.startGameAnalysis(s.run.presetId ?? presetId);
  }, [gameId, runState, loading, hydrated, presetId]);
}

export function AnalysisWorkspace() {
  const t = useT();
  useKeyboardShortcuts();
  useAutoAnalysis();
  const userMoveRef = useRef(false);
  useNavigationSound(userMoveRef);
  const playSound = useMoveSound();
  const fen = useBoardFen();
  const tree = useAnalysis((s) => s.tree);
  const currentId = useAnalysis((s) => s.currentId);
  const preview = useAnalysis((s) => s.preview);
  const orientation = useAnalysis((s) => s.orientation);
  const playMove = useAnalysis((s) => s.playMove);
  const bestArrow = useSettings((s) => s.bestMoveArrow);
  const boardBadges = useSettings((s) => s.boardBadges);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const reviewState = useGameReview();
  const live = useLiveAnalysis(fen);
  const captured = useCapturedPieces();
  useOpeningBook();

  // Game Review is what opens first; the engine tab sits right of it.
  const [tab, setTab] = useState<Tab>("review");

  const node = getNode(tree, currentId);
  const lastMove = useMemo(() => {
    const uci = preview ? (preview.step > 0 ? preview.uci[preview.step - 1] : node.uci) : node.uci;
    return uci ? parseUci(uci) : null;
  }, [preview, node.uci]);

  // Board props stay identical while only the engine's numbers change, so the (memoized)
  // board does not re-render — and its piece animations are not interrupted — on every
  // live update.
  const best = live.analysis?.bestMove ?? null;
  const nextPreviewMove =
    preview && preview.step < preview.uci.length ? preview.uci[preview.step]! : null;
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

  const onMove = useCallback(
    (move: BoardMove) => {
      userMoveRef.current = true;
      if (!playMove(move)) userMoveRef.current = false;
    },
    [playMove],
  );
  const onIllegalMove = useCallback(() => playSound("illegal"), [playSound]);

  const score = live.analysis?.score ?? null;
  const topColor = orientation === "white" ? "b" : "w";
  const bottomColor = orientation === "white" ? "w" : "b";

  const tabs: { id: Tab; label: string }[] = [
    { id: "review", label: t("tabs.review") },
    { id: "engine", label: t("tabs.engine") },
  ];

  const pvSan = live.analysis?.lines[0]
    ? uciLineToSan(fen, live.analysis.lines[0].pv.slice(0, 1))[0]
    : null;

  return (
    <div className="mx-auto grid w-full max-w-[1900px] gap-3 px-2 pt-2 pb-24 sm:px-3 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] lg:items-start lg:pb-3">
      {/* Board column */}
      <section className="flex min-w-0 flex-col gap-2" aria-label="Board">
        <Toolbar />
        <div className="mx-auto flex w-full flex-col gap-1 lg:max-w-[min(100%,calc(100dvh-10.5rem))]">
          <PlayerBar color={topColor} captured={captured} />
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
                onIllegalMove={onIllegalMove}
              />
            </div>
          </div>
          <PlayerBar color={bottomColor} captured={captured} />
          <div className="flex items-center gap-2 sm:hidden">
            <EvalBar score={score} orientation={orientation} direction="horizontal" />
            <span className="tabular min-w-24 text-right font-mono text-xs" aria-hidden="true">
              {score ? `${pvSan ? `${pvSan} ` : ""}${formatScore(score)}` : "…"}
            </span>
          </div>
        </div>
        <PreviewBanner />
      </section>

      {/* Analysis panel: graph, the two tabs, then the move list and its controls. */}
      <aside
        className="panel flex min-h-0 flex-col lg:sticky lg:top-3 lg:h-[calc(100dvh-1.5rem)]"
        aria-label={t("tabs.analysis")}
      >
        <div className="border-b border-base-content/10 px-2 pt-2 pb-1">
          <h2 className="panel-title px-1">{t("graph.title")}</h2>
          <EvalGraph byNode={reviewState.byNode} height={desktop ? 84 : 72} />
        </div>
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          className="flex flex-col gap-3 p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        >
          {tab === "review" ? (
            <>
              <GameReport state={reviewState} fen={fen} />
              <ExplorerSection fen={fen} live={live} />
            </>
          ) : (
            <EnginePanel live={live} fen={fen} />
          )}
        </div>

        {/* The move list sits outside the tabs, so switching tabs never moves its scroll. */}
        <section
          className="flex h-72 shrink-0 flex-col border-t border-base-content/10 lg:h-[38%] lg:min-h-52"
          aria-label={t("tabs.moves")}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <MoveList byNode={reviewState.byNode} />
          </div>
          <div className="hidden border-t border-base-content/10 p-1 lg:block">
            <NavControls />
          </div>
        </section>
      </aside>

      {/* Phones and tablets: navigation within thumb reach. */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-base-content/10 bg-base-100/95 px-2 pt-1 backdrop-blur lg:hidden">
        <NavControls compact />
      </div>
    </div>
  );
}

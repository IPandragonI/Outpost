"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight, ExternalLink, RotateCcw, Search } from "lucide-react";
import { ChessBoard, type BoardMove } from "@/components/board/ChessBoard";
import { EvalBar } from "@/components/analysis/EvalBar";
import { toOpeningInfo, type OpeningInfo } from "@/features/openings/opening-book";
import { parseUci, START_FEN, uciOf } from "@/lib/chess/position";
import { useLiveAnalysis } from "@/hooks/useLiveAnalysis";
import { useOpeningBook } from "@/hooks/useOpeningBook";
import { OpeningExplorer } from "./OpeningExplorer";
import { RepertoirePanel } from "./RepertoirePanel";
import { TrainerPanel } from "./TrainerPanel";
import { useT } from "@/lib/i18n/useT";

type Mode = "explore" | "repertoire" | "train";

/** Moves (UCI) from the initial position, and how many of them are on the board. */
interface Line {
  uci: string[];
  step: number;
}

function sanLine(uci: readonly string[]): { san: string[]; fens: string[] } {
  const chess = new Chess();
  const fens = [chess.fen()];
  const san: string[] = [];
  for (const u of uci) {
    san.push(chess.move(parseUci(u)).san);
    fens.push(chess.fen());
  }
  return { san, fens };
}

function OpeningSearch({ onPick }: { onPick(opening: OpeningInfo): void }) {
  const { book } = useOpeningBook();
  const [query, setQuery] = useState("");
  const t = useT();
  const results = useMemo(() => {
    if (!book) return [];
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const words = q.split(/\s+/);
    return book.data.openings
      .map(toOpeningInfo)
      .filter((o) =>
        words.every((w) => o.name.toLowerCase().includes(w) || o.eco.toLowerCase() === w),
      )
      .sort((a, b) => a.moves.split(" ").length - b.moves.split(" ").length)
      .slice(0, 40);
  }, [book, query]);

  return (
    <div className="flex flex-col gap-2">
      <label className="input w-full input-sm">
        <Search className="size-4 text-base-content/50" aria-hidden="true" />
        <span className="sr-only">{t("openings.search")}</span>
        <input
          type="search"
          placeholder={t("openings.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {results.length > 0 && (
        <ul
          className="max-h-64 overflow-y-auto rounded-field border border-base-content/10"
          aria-label={t("openings.found")}
        >
          {results.map((o) => (
            <li key={`${o.eco}-${o.name}-${o.moves}`}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-base-200"
                onClick={() => {
                  onPick(o);
                  setQuery("");
                }}
              >
                <span className="text-sm">
                  <span className="font-mono text-xs text-base-content/55">{o.eco}</span> {o.name}
                </span>
                <span className="truncate font-mono text-xs text-base-content/55">{o.moves}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && results.length === 0 && book && (
        <p className="text-xs text-base-content/55">{t("openings.noMatch")}</p>
      )}
    </div>
  );
}

export function OpeningsStudio() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("explore");
  const t = useT();
  const [line, setLine] = useState<Line>({ uci: [], step: 0 });
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [preview, setPreview] = useState<{ uci: string[]; label: string } | null>(null);
  const [trainerBoard, setTrainerBoard] = useState<{
    fen: string;
    lastMove: string | null;
    orientation: "white" | "black";
    onMove: (move: BoardMove) => void;
  } | null>(null);

  const played = useMemo(() => sanLine(line.uci), [line.uci]);
  const fen = played.fens[line.step] ?? START_FEN;
  const shownFen = mode === "train" && trainerBoard ? trainerBoard.fen : fen;
  const live = useLiveAnalysis(shownFen);

  const playUci = (uci: string) => {
    setPreview(null);
    setLine((l) => {
      // Replaying the next move of the line just steps forward.
      if (l.uci[l.step] === uci) return { ...l, step: l.step + 1 };
      return { uci: [...l.uci.slice(0, l.step), uci], step: l.step + 1 };
    });
  };

  const onBoardMove = (move: BoardMove) => {
    const chess = new Chess(fen);
    try {
      playUci(uciOf(chess.move(move)));
    } catch {
      // Illegal moves never reach here: the board only offers legal ones.
    }
  };

  const loadMoves = (uci: string[]) => {
    setPreview(null);
    setLine({ uci, step: uci.length });
  };

  const pickOpening = (opening: OpeningInfo) => {
    const chess = new Chess();
    const uci = opening.moves.split(" ").map((san) => uciOf(chess.move(san)));
    loadMoves(uci);
  };

  const lastMove = line.step > 0 ? parseUci(line.uci[line.step - 1]!) : null;
  const previewArrow = preview?.uci[0] ? parseUci(preview.uci[0]) : null;

  const tabs: { id: Mode; label: string }[] = [
    { id: "explore", label: t("openings.tab.explore") },
    { id: "repertoire", label: t("openings.tab.repertoire") },
    { id: "train", label: t("openings.tab.train") },
  ];

  const boardProps =
    mode === "train" && trainerBoard
      ? {
          fen: trainerBoard.fen,
          orientation: trainerBoard.orientation,
          lastMove: trainerBoard.lastMove ? parseUci(trainerBoard.lastMove) : null,
          onMove: trainerBoard.onMove,
          arrows: [],
        }
      : {
          fen,
          orientation,
          lastMove,
          onMove: onBoardMove,
          arrows: previewArrow
            ? [
                {
                  startSquare: previewArrow.from,
                  endSquare: previewArrow.to,
                  color: "rgba(79, 184, 168, 0.85)",
                },
              ]
            : [],
        };

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-2 py-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
      <section className="flex min-w-0 flex-col gap-2" aria-label={t("openings.board")}>
        <h1 className="text-base font-semibold">{t("nav.openings")}</h1>
        <div className="mx-auto flex w-full gap-2 lg:max-w-[min(100%,calc(100dvh-12rem))]">
          <div className="hidden sm:flex">
            <EvalBar
              score={mode === "train" ? null : (live.analysis?.score ?? null)}
              orientation={boardProps.orientation}
              pending={live.searching}
            />
          </div>
          <div className="min-w-0 flex-1">
            <ChessBoard id="openings-board" {...boardProps} />
          </div>
        </div>
        {mode !== "train" && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="btn min-h-11 btn-ghost btn-sm sm:min-h-8"
              onClick={() => setLine((l) => ({ ...l, step: Math.max(0, l.step - 1) }))}
              disabled={line.step === 0}
              aria-label={t("nav.prev")}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn min-h-11 btn-ghost btn-sm sm:min-h-8"
              onClick={() => setLine((l) => ({ ...l, step: Math.min(l.uci.length, l.step + 1) }))}
              disabled={line.step >= line.uci.length}
              aria-label={t("nav.next")}
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn min-h-11 btn-ghost btn-sm sm:min-h-8"
              onClick={() => loadMoves([])}
              aria-label={t("openings.reset")}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn min-h-11 btn-ghost btn-sm sm:min-h-8"
              onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
            >
              {t("openings.flip")}
            </button>
            <button
              type="button"
              className="btn ml-auto btn-soft btn-sm"
              disabled={line.step === 0}
              onClick={() =>
                router.push(`/analysis?moves=${line.uci.slice(0, line.step).join(",")}`)
              }
              title={t("openings.analyzeHint")}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {t("openings.analyze")}
            </button>
          </div>
        )}
        {mode !== "train" && (
          <p className="font-mono text-[13px] leading-6" aria-label={t("openings.currentLine")}>
            {played.san.length === 0 && (
              <span className="text-base-content/55">{t("openings.initial")}</span>
            )}
            {played.san.map((san, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setLine((l) => ({ ...l, step: i + 1 }))}
                className={`mr-1 rounded px-1 ${i + 1 === line.step ? "bg-primary text-primary-content" : i >= line.step ? "text-base-content/40 hover:bg-base-300" : "hover:bg-base-300"}`}
              >
                {i % 2 === 0 && <span className="text-base-content/50">{i / 2 + 1}.</span>}
                {san}
              </button>
            ))}
          </p>
        )}
        {preview && mode === "explore" && (
          <div className="panel flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="text-xs font-semibold text-accent">{preview.label}</span>
            <span className="font-mono text-[13px]">
              {(() => {
                try {
                  const chess = new Chess(fen);
                  return preview.uci.map((u) => chess.move(parseUci(u)).san).join(" ");
                } catch {
                  return "";
                }
              })()}
            </span>
            <button
              type="button"
              className="btn ml-auto btn-soft btn-xs"
              onClick={() => loadMoves([...line.uci.slice(0, line.step), ...preview.uci])}
            >
              {t("openings.follow")}
            </button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPreview(null)}>
              {t("common.close")}
            </button>
          </div>
        )}
      </section>

      <aside
        className="panel flex min-h-0 flex-col lg:max-h-[calc(100dvh-5.5rem)]"
        aria-label={t("openings.tools")}
      >
        <div
          role="tablist"
          className="flex border-b border-base-content/10"
          aria-label={t("openings.tools")}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              onClick={() => setMode(tab.id)}
              className={`-mb-px min-h-11 flex-1 border-b-2 px-2 text-sm font-medium sm:min-h-10 ${
                mode === tab.id
                  ? "border-primary"
                  : "border-transparent text-base-content/60 hover:text-base-content"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
          {mode === "explore" && (
            <>
              <OpeningSearch onPick={pickOpening} />
              <OpeningExplorer
                fen={fen}
                analysis={live.analysis}
                onPreview={(uci, label) => setPreview({ uci, label })}
                onPlay={playUci}
              />
            </>
          )}
          {mode === "repertoire" && (
            <RepertoirePanel currentLine={line.uci.slice(0, line.step)} onLoadLine={loadMoves} />
          )}
          {mode === "train" && <TrainerPanel onBoard={setTrainerBoard} />}
        </div>
      </aside>
    </div>
  );
}

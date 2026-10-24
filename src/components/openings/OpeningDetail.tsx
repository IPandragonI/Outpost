"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import {
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pause,
  Play,
  Repeat,
} from "lucide-react";
import type { Arrow } from "react-chessboard";
import { ChessBoard } from "@/components/board/ChessBoard";
import type { CatalogOpening } from "@/features/openings/catalog";
import { uciOf } from "@/lib/chess/position";
import { useLocale, useT } from "@/lib/i18n/useT";
import { useMoveSound } from "@/hooks/useMoveSound";
import { useOpeningBook } from "@/hooks/useOpeningBook";

interface Played {
  fens: string[];
  moves: { san: string; uci: string; from: string; to: string }[];
}

function playLine(moves: readonly string[]): Played {
  const chess = new Chess();
  const fens = [chess.fen()];
  const played: Played["moves"] = [];
  for (const san of moves) {
    const move = chess.move(san);
    fens.push(chess.fen());
    played.push({ san: move.san, uci: uciOf(move), from: move.from, to: move.to });
  }
  return { fens, moves: played };
}

const AUTOPLAY_MS = 1100;

/**
 * One opening: its main line and variations on a board, played move by move (or
 * automatically), with the next move shown as an arrow and the moves that define the
 * opening highlighted in the move list.
 */
export function OpeningDetail({ opening }: { opening: CatalogOpening }) {
  const t = useT();
  const locale = useLocale();
  const { book } = useOpeningBook();
  const play = useMoveSound();
  const [lineIndex, setLineIndex] = useState(0);
  const [step, setStep] = useState(opening.keyPlies);
  const [autoplay, setAutoplay] = useState(false);

  const line = opening.lines[lineIndex]!;
  const { fens, moves } = useMemo(() => playLine(line.moves), [line]);
  const fen = fens[step]!;
  const last = step > 0 ? moves[step - 1]! : null;
  const next = step < moves.length ? moves[step]! : null;
  const name = book?.namesAt(fen)[0] ?? null;

  const goTo = (target: number) => {
    const clamped = Math.max(0, Math.min(moves.length, target));
    if (clamped === step + 1 && moves[step]) play({ san: moves[step]!.san });
    setStep(clamped);
  };

  // Autoplay: one move per tick; it stops by itself at the end of the line.
  const playing = autoplay && step < moves.length;
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      play({ san: moves[step]!.san });
      setStep(step + 1);
    }, AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, step, moves, play]);

  const arrows = useMemo<Arrow[]>(
    () =>
      next
        ? [{ startSquare: next.from, endSquare: next.to, color: "rgba(217, 166, 80, 0.85)" }]
        : [],
    [next],
  );
  const lastMove = useMemo(() => (last ? { from: last.from, to: last.to } : null), [last]);

  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6"
      data-testid="opening-detail"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/openings" className="btn btn-ghost btn-sm">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("openingsHome.back")}
        </Link>
        <Link href={`/trainer?o=${opening.id}`} className="btn ml-auto btn-soft btn-primary btn-sm">
          <Repeat className="size-4" aria-hidden="true" />
          {t("openingsHome.train")}
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <section className="flex flex-col gap-2" aria-label={t("openings.board")}>
          <div className="mx-auto w-full lg:max-w-[min(100%,calc(100dvh-14rem))]">
            <ChessBoard
              id="opening-board"
              fen={fen}
              orientation={opening.side}
              lastMove={lastMove}
              arrows={arrows}
            />
          </div>
          <div
            className="flex items-center justify-center gap-1"
            role="toolbar"
            aria-label={t("nav.moves")}
          >
            <button
              type="button"
              className="btn min-h-11 btn-ghost btn-sm"
              onClick={() => goTo(0)}
              disabled={step === 0}
              aria-label={t("nav.first")}
            >
              <ChevronFirst className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn min-h-11 btn-ghost btn-sm"
              onClick={() => goTo(step - 1)}
              disabled={step === 0}
              aria-label={t("nav.prev")}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn min-h-11 btn-soft btn-primary btn-sm"
              onClick={() => {
                if (step >= moves.length) setStep(0);
                setAutoplay(!playing);
              }}
              aria-label={playing ? t("openingsHome.pause") : t("openingsHome.play")}
            >
              {playing ? (
                <Pause className="size-4" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="btn min-h-11 btn-ghost btn-sm"
              onClick={() => goTo(step + 1)}
              disabled={step >= moves.length}
              aria-label={t("nav.next")}
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn min-h-11 btn-ghost btn-sm"
              onClick={() => goTo(moves.length)}
              disabled={step >= moves.length}
              aria-label={t("nav.last")}
            >
              <ChevronLast className="size-5" aria-hidden="true" />
            </button>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <header>
            <p className="text-xs font-medium tracking-wide text-base-content/55 uppercase">
              {opening.side === "white" ? t("openingsHome.white") : t("openingsHome.black")} ·{" "}
              {opening.eco}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{opening.name[locale]}</h1>
            <p className="mt-1 text-sm leading-6 text-base-content/75">{opening.summary[locale]}</p>
          </header>

          <div
            role="tablist"
            aria-label={t("openingsHome.variations")}
            className="flex flex-wrap gap-1.5"
          >
            {opening.lines.map((l, i) => (
              <button
                key={l.name.en}
                type="button"
                role="tab"
                aria-selected={i === lineIndex}
                className={`btn btn-sm ${i === lineIndex ? "btn-primary" : "btn-soft"}`}
                onClick={() => {
                  setAutoplay(false);
                  setLineIndex(i);
                  setStep(opening.keyPlies);
                }}
              >
                {l.name[locale]}
                {i === 0 && <span className="badge badge-xs">{t("openingsHome.main")}</span>}
              </button>
            ))}
          </div>

          <section className="panel flex flex-col gap-2 p-3" aria-label={line.name[locale]}>
            <p className="text-sm leading-6">{line.note[locale]}</p>
            <p className="font-mono text-[13px] leading-7">
              {moves.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setAutoplay(false);
                    goTo(i + 1);
                  }}
                  className={`mr-1 rounded px-1 ${
                    step === i + 1
                      ? "bg-primary text-primary-content"
                      : i < opening.keyPlies
                        ? "bg-base-300/70 hover:bg-base-300"
                        : "hover:bg-base-300"
                  }`}
                  title={i < opening.keyPlies ? t("openingsHome.keyMove") : undefined}
                >
                  {i % 2 === 0 && <span className="text-base-content/50">{i / 2 + 1}.</span>}
                  {m.san}
                </button>
              ))}
            </p>
            <p className="text-xs text-base-content/60" aria-live="polite">
              {name ? (
                <>
                  <span className="font-mono">{name.eco}</span> {name.name}
                </>
              ) : (
                t("openingsHome.step", { step, total: moves.length })
              )}
            </p>
          </section>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/analysis?moves=${moves
                .slice(0, Math.max(step, 1))
                .map((m) => m.uci)
                .join(",")}`}
              className="btn btn-soft btn-sm"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {t("openingsHome.analyze")}
            </Link>
            <Link href="/openings?view=studio" className="btn btn-ghost btn-sm">
              {t("openingsHome.advanced")}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

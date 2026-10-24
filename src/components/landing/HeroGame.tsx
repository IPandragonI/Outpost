"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Pause, Play } from "lucide-react";
import { ChessBoard } from "@/components/board/ChessBoard";
import type { Classification } from "@/features/classification/classification-rules";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useT } from "@/lib/i18n/useT";

/** Morphy's Opera Game, Paris 1858, played to the final mate. */
const OPERA =
  "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#";

/** Moves worth a badge on the board, by ply: the queen sacrifice and the mate. */
const HIGHLIGHTS: Record<number, Classification> = { 31: "brilliant", 33: "best" };
const SACRIFICE_PLY = 31;

const MOVE_MS = 1150;
const END_PAUSE_MS = 3500;

const GAME = (() => {
  const chess = new Chess();
  const start = chess.fen();
  const plies = OPERA.split(" ").map((san) => {
    const move = chess.move(san);
    return { san: move.san, from: move.from, to: move.to, fen: chess.fen() };
  });
  return { start, plies };
})();

/** The landing page's board: the Opera Game plays itself in a loop, with a pause button. */
export function HeroGame() {
  const t = useT();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [ply, setPly] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = GAME.plies.length;
  // With reduced motion the game does not play by itself: it shows the queen sacrifice.
  const shown = reducedMotion ? SACRIFICE_PLY : ply;
  const playing = !paused && !reducedMotion;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(
      () => setPly((p) => (p >= total ? 0 : p + 1)),
      ply >= total ? END_PAUSE_MS : MOVE_MS,
    );
    return () => clearTimeout(timer);
  }, [playing, ply, total]);

  const current = shown > 0 ? GAME.plies[shown - 1]! : null;
  const lastMove = useMemo(
    () => (current ? { from: current.from, to: current.to } : null),
    [current],
  );
  const highlight = HIGHLIGHTS[shown];
  const badge = useMemo(
    () => (current && highlight ? { square: current.to, classification: highlight } : null),
    [current, highlight],
  );
  const first = Math.max(0, shown - 6);
  const recent = GAME.plies.slice(first, shown).map((p, i) => {
    const index = first + i;
    return { label: index % 2 === 0 ? `${index / 2 + 1}.${p.san}` : p.san, index };
  });

  return (
    <figure className="relative mx-auto w-full max-w-[460px]">
      <div
        className="pointer-events-none absolute -inset-8 -z-10 bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-primary)_22%,transparent),transparent)]"
        aria-hidden="true"
      />
      <div className="panel flex flex-col gap-2 p-2.5 shadow-[0_18px_50px_-24px_color-mix(in_oklab,var(--color-base-content)_45%,transparent)] sm:p-3">
        <div className="flex items-center gap-2 px-0.5 text-sm">
          <span
            className="inline-block size-3 rounded-sm bg-eval-black ring-1 ring-base-content/30"
            aria-hidden="true"
          />
          <span className="truncate font-medium">{t("landing.hero.black")}</span>
        </div>
        <ChessBoard
          id="landing-board"
          fen={current?.fen ?? GAME.start}
          orientation="white"
          lastMove={lastMove}
          badge={badge}
        />
        <div className="flex items-center gap-2 px-0.5 text-sm">
          <span
            className="inline-block size-3 rounded-sm bg-eval-white ring-1 ring-base-content/30"
            aria-hidden="true"
          />
          <span className="truncate font-medium">{t("landing.hero.white")}</span>
          <span className="tabular ml-auto text-xs text-base-content/55">
            {t("landing.hero.progress", { ply: shown, total })}
          </span>
        </div>
        <div className="flex items-center gap-2 border-t border-base-content/10 pt-2">
          <button
            type="button"
            className="btn btn-square btn-ghost btn-sm"
            onClick={() => setPaused((p) => !p)}
            disabled={reducedMotion}
            aria-label={t(playing ? "landing.hero.pause" : "landing.hero.play")}
          >
            {playing ? (
              <Pause className="size-4" aria-hidden="true" />
            ) : (
              <Play className="size-4" aria-hidden="true" />
            )}
          </button>
          <p
            className="flex min-w-0 flex-1 justify-end gap-1.5 overflow-hidden font-mono text-[13px] whitespace-nowrap"
            aria-hidden="true"
          >
            {recent.map((m) => (
              <span
                key={m.index}
                className={
                  m.index === shown - 1
                    ? "rounded bg-primary/15 px-1 font-semibold text-base-content"
                    : "px-1 text-base-content/55"
                }
              >
                {m.label}
                {HIGHLIGHTS[m.index + 1] === "brilliant" ? "!!" : ""}
              </span>
            ))}
          </p>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-base-content/60">
        {t("landing.showcase")}
      </figcaption>
    </figure>
  );
}

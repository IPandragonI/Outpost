"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chess } from "chess.js";
import { ArrowRight, RotateCcw, X } from "lucide-react";
import { ChessBoard, type BoardMove } from "@/components/board/ChessBoard";
import {
  BoardThemePicker,
  LanguageChoice,
  PieceSetPicker,
  ThemeChoice,
  Toggle,
} from "@/components/settings/AppearanceControls";
import { useSettings } from "@/features/settings/settings-store";
import { useMoveSound } from "@/hooks/useMoveSound";
import { useT } from "@/lib/i18n/useT";

/** A lively Italian Game position, so pieces of every kind and a check are visible. */
const PREVIEW = (() => {
  const chess = new Chess();
  let last = null;
  for (const san of "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+".split(" ")) {
    last = chess.move(san);
  }
  return { fen: chess.fen(), lastMove: { from: last!.from, to: last!.to } };
})();

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-base-content/70">{label}</p>
      {children}
    </div>
  );
}

/**
 * Quick appearance settings in a dialog, next to a board that reflects every change at
 * once. Moves can be played on it to try pieces, highlights and animations; the full
 * settings stay one link away.
 */
export function SettingsModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const settings = useSettings();
  const play = useMoveSound();
  const [position, setPosition] = useState(PREVIEW);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const onMove = (move: BoardMove) => {
    const chess = new Chess(position.fen);
    const played = chess.move(move);
    play({ san: played.san });
    setPosition({ fen: chess.fen(), lastMove: { from: played.from, to: played.to } });
  };

  return (
    <dialog
      ref={ref}
      className="modal modal-bottom sm:modal-middle"
      onClose={onClose}
      aria-labelledby="quick-settings-title"
    >
      <div className="modal-box max-h-[92dvh] w-full max-w-3xl bg-base-100 p-0">
        <header className="flex items-center gap-2 border-b border-base-content/10 px-4 py-3">
          <h2 id="quick-settings-title" className="text-base font-semibold">
            {t("quick.title")}
          </h2>
          <button
            type="button"
            className="btn ml-auto btn-square btn-ghost btn-sm"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="grid gap-5 p-4 sm:grid-cols-2">
          <figure className="flex flex-col gap-2">
            <div className="mx-auto w-full max-w-[320px] sm:max-w-none">
              {/* Mounted only while open: no board work for a closed dialog. */}
              {open && (
                <ChessBoard
                  id="preview-board"
                  fen={position.fen}
                  orientation="white"
                  lastMove={position.lastMove}
                  onMove={onMove}
                />
              )}
            </div>
            <figcaption className="flex items-center gap-2 text-xs text-base-content/60">
              {t("quick.previewHint")}
              <button
                type="button"
                className="btn ml-auto btn-ghost btn-xs"
                onClick={() => setPosition(PREVIEW)}
                disabled={position === PREVIEW}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {t("quick.reset")}
              </button>
            </figcaption>
          </figure>

          <div className="flex flex-col gap-4">
            <Row label={t("settings.theme")}>
              <ThemeChoice />
            </Row>
            <Row label={t("settings.language")}>
              <LanguageChoice />
            </Row>
            <Row label={t("settings.board")}>
              <BoardThemePicker />
            </Row>
            <Row label={t("settings.pieces")}>
              <PieceSetPicker />
            </Row>
            <div className="flex flex-col gap-2 text-sm">
              {(
                [
                  ["showCoordinates", "settings.coordinates"],
                  ["animations", "settings.animations"],
                  ["sound", "settings.sound"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  {t(label)}
                  <Toggle
                    label={t(label)}
                    checked={settings[key]}
                    onChange={(v) => settings.set({ [key]: v })}
                  />
                </div>
              ))}
            </div>
            <Link href="/settings" className="btn mt-auto btn-soft btn-sm" onClick={onClose}>
              {t("quick.all")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit" tabIndex={-1}>
          {t("common.close")}
        </button>
      </form>
    </dialog>
  );
}

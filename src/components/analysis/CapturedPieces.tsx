"use client";

import { memo } from "react";
import type { CapturablePiece } from "@/features/analysis/captured-pieces";
import { useSettings } from "@/features/settings/settings-store";
import type { Color } from "@/lib/chess/position";
import { useT } from "@/lib/i18n/useT";

interface Props {
  /** Pieces this player has taken, most valuable first. */
  pieces: readonly CapturablePiece[];
  /** Colour of those pieces (the opponent's). */
  pieceColor: Color;
  /** Material advantage of this player in pawns; shown only when positive. */
  advantage: number;
}

/**
 * Small captured-piece icons in the board's piece set, grouped by kind and slightly
 * overlapped, with the material advantage ("+2") after them. Fixed height, so the board
 * does not move when the first capture happens.
 */
function CapturedPiecesImpl({ pieces, pieceColor, advantage }: Props) {
  const pieceSet = useSettings((s) => s.pieceSet);
  const t = useT();
  const groups: { type: CapturablePiece; count: number }[] = [];
  for (const type of pieces) {
    const last = groups[groups.length - 1];
    if (last?.type === type) last.count++;
    else groups.push({ type, count: 1 });
  }
  const label = pieces.length
    ? t("captured.label", {
        pieces: groups.map((g) => `${g.count} ${t(`piece.${g.type}`)}`).join(", "),
      })
    : t("captured.none");

  return (
    <div
      className="flex h-5 min-w-0 items-center gap-1.5"
      role="img"
      aria-label={advantage > 0 ? `${label} ${t("captured.advantage", { n: advantage })}` : label}
      data-testid="captured-pieces"
    >
      <div className="flex items-center gap-1" aria-hidden="true">
        {groups.map((g) => (
          <span key={g.type} className="flex items-center">
            {Array.from({ length: g.count }, (_, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={`/pieces/${pieceSet}/${pieceColor}${g.type.toUpperCase()}.svg`}
                alt=""
                draggable={false}
                className={`size-5 shrink-0 select-none ${i > 0 ? "-ml-3" : ""}`}
              />
            ))}
          </span>
        ))}
      </div>
      {advantage > 0 && (
        <span
          className="tabular font-mono text-xs font-medium text-base-content/70"
          aria-hidden="true"
          data-testid="material-advantage"
        >
          +{advantage}
        </span>
      )}
    </div>
  );
}

export const CapturedPieces = memo(CapturedPiecesImpl);

"use client";

import { memo } from "react";
import { boardColors, useSettings } from "@/features/settings/settings-store";

/**
 * A static board picture (no interaction, no drag and drop): cheap enough to show many
 * at once, e.g. one per opening card.
 */
function MiniBoardImpl({
  fen,
  orientation = "white",
}: {
  fen: string;
  orientation?: "white" | "black";
}) {
  const pieceSet = useSettings((s) => s.pieceSet);
  const boardTheme = useSettings((s) => s.boardTheme);
  const customLight = useSettings((s) => s.customLight);
  const customDark = useSettings((s) => s.customDark);
  const colors = boardColors({ boardTheme, customLight, customDark });

  const rows = (fen.split(" ")[0] ?? "")
    .split("/")
    .map((row) =>
      row
        .split("")
        .flatMap((ch) => (/\d/.test(ch) ? Array<string | null>(Number(ch)).fill(null) : [ch])),
    );
  const squares = rows.flatMap((row, r) => row.map((piece, f) => ({ piece, r, f })));
  const ordered = orientation === "white" ? squares : [...squares].reverse();

  return (
    <div
      className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-md"
      aria-hidden="true"
    >
      {ordered.map(({ piece, r, f }) => (
        <div
          key={`${r}-${f}`}
          style={{ background: (r + f) % 2 === 0 ? colors.light : colors.dark }}
          className="relative"
        >
          {piece && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/pieces/${pieceSet}/${piece === piece.toUpperCase() ? "w" : "b"}${piece.toUpperCase()}.svg`}
              alt=""
              className="absolute inset-0 size-full"
              loading="lazy"
            />
          )}
        </div>
      ))}
    </div>
  );
}

export const MiniBoard = memo(MiniBoardImpl);

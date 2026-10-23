"use client";

import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Repeat2,
} from "lucide-react";
import { useAnalysis } from "@/features/analysis/store";
import { getNode, isOnMainline, nextInLine } from "@/features/games/variation-tree";
import { useT } from "@/lib/i18n/useT";

/** First / previous / next / last, flip, and "back to the game" when off the main line. */
export function NavControls({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const tree = useAnalysis((s) => s.tree);
  const currentId = useAnalysis((s) => s.currentId);
  const preview = useAnalysis((s) => s.preview);
  const { first, prev, next, last, flip, returnToMainline } = useAnalysis.getState();

  const node = getNode(tree, currentId);
  const atStart = preview ? false : node.parentId === null;
  const atEnd = preview ? preview.step >= preview.uci.length : nextInLine(tree, currentId) === null;
  const offMainline = !preview && !isOnMainline(tree, currentId);
  const size = compact ? "min-h-12 flex-1" : "min-h-10 flex-1";

  return (
    <div className="flex items-stretch gap-1" role="toolbar" aria-label={t("nav.moves")}>
      <button
        type="button"
        className={`btn btn-ghost ${size} px-0`}
        onClick={first}
        disabled={atStart}
        aria-label={t("nav.first")}
      >
        <ChevronFirst className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`btn btn-ghost ${size} px-0`}
        onClick={prev}
        disabled={atStart}
        aria-label={t("nav.prev")}
      >
        <ChevronLeft className="size-6" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`btn btn-ghost ${size} px-0`}
        onClick={next}
        disabled={atEnd}
        aria-label={t("nav.next")}
      >
        <ChevronRight className="size-6" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`btn btn-ghost ${size} px-0`}
        onClick={last}
        disabled={atEnd}
        aria-label={t("nav.last")}
      >
        <ChevronLast className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`btn btn-ghost ${size} px-0`}
        onClick={flip}
        aria-label={t("nav.flip")}
      >
        <Repeat2 className="size-5 rotate-90" aria-hidden="true" />
      </button>
      {offMainline && (
        <button
          type="button"
          className={`btn btn-soft btn-primary ${compact ? "min-h-12" : "min-h-10"} px-3`}
          onClick={returnToMainline}
          title={t("nav.backToGameHint")}
        >
          <CornerUpLeft className="size-4" aria-hidden="true" />
          <span className={compact ? "sr-only" : ""}>{t("nav.backToGame")}</span>
        </button>
      )}
    </div>
  );
}

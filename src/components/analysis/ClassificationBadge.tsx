"use client";

import {
  CLASSIFICATION_INFO,
  type Classification,
} from "@/features/classification/classification-rules";
import { useT } from "@/lib/i18n/useT";

/** Background colour class of each classification (Tailwind needs literal class names). */
export const CLASSIFICATION_BG: Record<Classification, string> = {
  brilliant: "bg-cls-brilliant",
  great: "bg-cls-great",
  best: "bg-cls-best",
  excellent: "bg-cls-excellent",
  good: "bg-cls-good",
  book: "bg-cls-book",
  forced: "bg-cls-forced",
  inaccuracy: "bg-cls-inaccuracy",
  mistake: "bg-cls-mistake",
  miss: "bg-cls-miss",
  blunder: "bg-cls-blunder",
};

export const CLASSIFICATION_TEXT: Record<Classification, string> = {
  brilliant: "text-cls-brilliant",
  great: "text-cls-great",
  best: "text-cls-best",
  excellent: "text-cls-excellent",
  good: "text-cls-good",
  book: "text-cls-book",
  forced: "text-cls-forced",
  inaccuracy: "text-cls-inaccuracy",
  mistake: "text-cls-mistake",
  miss: "text-cls-miss",
  blunder: "text-cls-blunder",
};

/** Round badge with the classification's symbol; its name is given to screen readers. */
export function ClassificationBadge({
  classification,
  className = "size-5 text-[10px]",
}: {
  classification: Classification;
  className?: string;
}) {
  const t = useT();
  const info = CLASSIFICATION_INFO[classification];
  const label = t(`cls.${classification}`);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-mono leading-none font-semibold text-base-200 ${CLASSIFICATION_BG[classification]} ${className}`}
      title={label}
    >
      <span aria-hidden="true">{info.symbol}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

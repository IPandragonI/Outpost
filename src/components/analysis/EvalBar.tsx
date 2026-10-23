"use client";

import { barValue, describeScore, formatScore, type Score } from "@/features/engine/evaluation";
import { useT } from "@/lib/i18n/useT";

/**
 * Evaluation bar on the winning-chances scale (so ±8 and ±15 look alike), White at the
 * bottom when the board shows White at the bottom. Vertical beside the board on wide
 * screens, horizontal above it on phones.
 */
export function EvalBar({
  score,
  orientation,
  direction = "vertical",
  pending = false,
}: {
  score: Score | null;
  orientation: "white" | "black";
  direction?: "vertical" | "horizontal";
  pending?: boolean;
}) {
  const value = score ? barValue(score) : 0;
  const t = useT();
  const whiteShare = (value + 1) / 2;
  const label = score ? formatScore(score) : "…";
  const whiteAhead = value >= 0;
  const flipped = orientation === "black";

  if (direction === "horizontal") {
    return (
      <div
        className="relative h-3 w-full overflow-hidden rounded-full bg-eval-black"
        role="meter"
        aria-label={t("eval.label")}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={Number(value.toFixed(2))}
        aria-valuetext={score ? describeScore(score, t) : t("eval.none")}
      >
        <div
          className="eval-fill absolute inset-0 bg-eval-white"
          style={{
            transform: `scaleX(${whiteShare})`,
            transformOrigin: flipped ? "right" : "left",
          }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px bg-primary/60" />
      </div>
    );
  }

  return (
    <div
      className={`relative h-full w-6 shrink-0 overflow-hidden rounded-md bg-eval-black sm:w-7 ${pending ? "opacity-70" : ""}`}
      role="meter"
      aria-label={t("eval.label")}
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={Number(value.toFixed(2))}
      aria-valuetext={score ? describeScore(score, t) : t("eval.none")}
    >
      <div
        className="eval-fill absolute inset-0 bg-eval-white"
        style={{
          transform: `scaleY(${whiteShare})`,
          transformOrigin: flipped ? "top" : "bottom",
        }}
      />
      <div className="absolute inset-x-0 top-1/2 h-px bg-primary/60" />
      <span
        className={`tabular absolute inset-x-0 text-center font-mono text-[10px] leading-none font-medium ${
          whiteAhead !== flipped ? "bottom-1.5 text-eval-black" : "top-1.5 text-eval-white"
        }`}
        aria-hidden="true"
      >
        {label.replace("+", "").replace("−", "")}
      </span>
    </div>
  );
}

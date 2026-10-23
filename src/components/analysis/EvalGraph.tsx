"use client";

import { memo, useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAnalysis } from "@/features/analysis/store";
import { isError } from "@/features/classification/classification-rules";
import type { MoveClassification } from "@/features/classification/classify-move";
import { barValue, formatScore, type Score } from "@/features/engine/evaluation";
import { mainline, type NodeId } from "@/features/games/variation-tree";
import { positionKey } from "@/lib/chess/position";
import { useT } from "@/lib/i18n/useT";

interface Point {
  index: number;
  ply: number;
  label: string;
  value: number | null;
  score: Score | null;
}

const CLS_VAR: Record<string, string> = {
  inaccuracy: "var(--cls-inaccuracy)",
  mistake: "var(--cls-mistake)",
  miss: "var(--cls-miss)",
  blunder: "var(--cls-blunder)",
  brilliant: "var(--cls-brilliant)",
  great: "var(--cls-great)",
};

/**
 * Evaluation over the game, on the winning-chances scale so that mates and huge scores
 * stay readable. Positions not analyzed yet are gaps, not zeros. Click or tap a point to
 * go to that position.
 */
function EvalGraphImpl({
  byNode,
  height = 120,
}: {
  byNode: Record<NodeId, MoveClassification>;
  height?: number;
}) {
  const tree = useAnalysis((s) => s.tree);
  const currentId = useAnalysis((s) => s.currentId);
  const gamePositions = useAnalysis((s) => s.gamePositions);
  const run = useAnalysis((s) => s.run);
  const goTo = useAnalysis((s) => s.goTo);
  const t = useT();
  const gradientId = useId().replace(/:/g, "");

  const line = useMemo(() => mainline(tree), [tree]);
  const data = useMemo<Point[]>(
    () =>
      line.map((node, index) => {
        const analysis = gamePositions[positionKey(node.fen)];
        const moveNo = Math.ceil(node.ply / 2);
        return {
          index,
          ply: node.ply,
          label: node.san
            ? `${moveNo}${node.ply % 2 === 1 ? "." : "…"} ${node.san}`
            : t("graph.start"),
          value: analysis ? barValue(analysis.score) : null,
          score: analysis?.score ?? null,
        };
      }),
    [line, gamePositions, t],
  );

  const values = data.map((d) => d.value).filter((v): v is number => v !== null);
  const analyzed = values.length;
  // The gradient spans the area's own box: put the white/black boundary at y = 0 in it.
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const zeroOffset = top - bottom > 0 ? top / (top - bottom) : 0.5;
  const currentIndex = line.findIndex((n) => n.id === currentId);

  if (analyzed === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-field border border-dashed border-base-content/15 text-sm text-base-content/55"
        style={{ height }}
      >
        {run.state === "running" ? t("graph.starting") : t("graph.empty")}
      </div>
    );
  }

  const markers = line
    .map((node, index) => ({ node, index, cls: byNode[node.id]?.classification }))
    .filter(
      (m) =>
        m.cls &&
        (isError(m.cls) || m.cls === "brilliant" || m.cls === "great") &&
        data[m.index]?.value != null,
    );

  return (
    <div style={{ height }} className="w-full select-none" data-testid="eval-graph">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
          onClick={(state) => {
            const index = Number(state?.activeTooltipIndex);
            const node = Number.isFinite(index) ? line[index] : undefined;
            if (node) goTo(node.id);
          }}
          style={{ cursor: "pointer" }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset={zeroOffset} stopColor="var(--eval-white)" stopOpacity={0.95} />
              <stop offset={zeroOffset} stopColor="var(--eval-black)" stopOpacity={0.95} />
            </linearGradient>
          </defs>
          <XAxis dataKey="index" hide />
          <YAxis domain={[-1, 1]} hide />
          <ReferenceLine y={0} stroke="var(--color-base-content)" strokeOpacity={0.25} />
          <Tooltip
            cursor={{ stroke: "var(--color-primary)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as Point | undefined;
              if (!active || !point) return null;
              const cls = byNode[line[point.index]?.id ?? ""]?.classification;
              return (
                <div className="panel px-2 py-1 font-mono text-xs">
                  <div>{point.label}</div>
                  <div className="text-base-content/70">
                    {point.score ? formatScore(point.score) : t("graph.notAnalyzed")}
                    {cls ? ` · ${t(`cls.${cls}`)}` : ""}
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            baseValue={0}
            stroke="var(--color-primary)"
            strokeWidth={1.25}
            fill={`url(#${gradientId})`}
            connectNulls={false}
            isAnimationActive={false}
            activeDot={{ r: 3 }}
          />
          {currentIndex >= 0 && (
            <ReferenceLine x={currentIndex} stroke="var(--color-primary)" strokeWidth={1.5} />
          )}
          {markers.map((m) => (
            <ReferenceDot
              key={m.node.id}
              x={m.index}
              y={data[m.index]!.value!}
              r={3.5}
              fill={CLS_VAR[m.cls!]}
              stroke="var(--color-base-100)"
              strokeWidth={1}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Memoized: re-renders only when its props change, not on every engine update. */
export const EvalGraph = memo(EvalGraphImpl);

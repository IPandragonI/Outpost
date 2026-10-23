"use client";

import { memo, Fragment, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useAnalysis } from "@/features/analysis/store";
import type { MoveClassification } from "@/features/classification/classify-move";
import {
  getNode,
  mainline,
  type GameTree,
  type MoveNode,
  type NodeId,
} from "@/features/games/variation-tree";
import { ClassificationBadge, CLASSIFICATION_TEXT } from "./ClassificationBadge";
import { useT } from "@/lib/i18n/useT";

const NAG_SYMBOLS: Record<number, string> = { 1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!" };

function moveNumber(node: MoveNode, force: boolean): string | null {
  const n = Math.ceil(node.ply / 2);
  if (node.ply % 2 === 1) return `${n}.`;
  return force ? `${n}…` : null;
}

interface MoveButtonProps {
  node: MoveNode;
  current: boolean;
  classification?: MoveClassification;
  onSelect(id: NodeId): void;
  inline?: boolean;
}

function MoveButton({ node, current, classification, onSelect, inline }: MoveButtonProps) {
  const nags = (node.nags ?? [])
    .map((n) => NAG_SYMBOLS[n])
    .filter(Boolean)
    .join("");
  const explored = node.origin === "explore";
  const cls = classification?.classification;
  const showBadge =
    cls &&
    cls !== "book" &&
    cls !== "best" &&
    cls !== "excellent" &&
    cls !== "good" &&
    cls !== "forced";
  return (
    <button
      type="button"
      data-node={node.id}
      aria-current={current ? "step" : undefined}
      onClick={() => onSelect(node.id)}
      className={`inline-flex items-center gap-1 rounded px-1.5 text-left font-mono transition-colors ${
        inline ? "min-h-7 text-[13px]" : "min-h-8 w-full text-[13.5px]"
      } ${
        current
          ? "bg-primary text-primary-content"
          : `hover:bg-base-300 ${explored ? "text-accent italic" : ""}`
      }`}
    >
      <span className={!current && cls && showBadge ? CLASSIFICATION_TEXT[cls] : ""}>
        {node.san}
        {nags}
      </span>
      {showBadge && !inline && (
        <ClassificationBadge classification={cls} className="ml-auto size-4 text-[8px]" />
      )}
    </button>
  );
}

/** A variation as flowing text, with its own nested variations in parentheses. */
function VariationLine({
  tree,
  startId,
  currentId,
  onSelect,
  onDelete,
  depth,
}: {
  tree: GameTree;
  startId: NodeId;
  currentId: NodeId;
  onSelect(id: NodeId): void;
  onDelete(id: NodeId): void;
  depth: number;
}) {
  const t = useT();
  const parts: ReactNode[] = [];
  let node: MoveNode | undefined = getNode(tree, startId);
  let force = true;
  while (node) {
    const number = moveNumber(node, force);
    if (node.preComment) {
      parts.push(
        <span key={`${node.id}-pre`} className="text-xs text-base-content/60">
          {node.preComment}
        </span>,
      );
    }
    parts.push(
      <span key={node.id} className="inline-flex items-center">
        {number && (
          <span className="mr-0.5 font-mono text-[12px] text-base-content/50">{number}</span>
        )}
        <MoveButton node={node} current={node.id === currentId} onSelect={onSelect} inline />
      </span>,
    );
    if (node.comment) {
      parts.push(
        <span key={`${node.id}-c`} className="text-xs text-base-content/60">
          {node.comment}
        </span>,
      );
    }
    force = Boolean(node.comment);
    const parent: MoveNode | undefined = node.parentId ? getNode(tree, node.parentId) : undefined;
    // Alternatives to this move, nested.
    if (
      parent &&
      parent.children[0] === node.id &&
      parent.children.length > 1 &&
      node.id !== startId
    ) {
      for (const alt of parent.children.slice(1)) {
        parts.push(
          <span key={`v-${alt}`} className="text-base-content/70">
            (
            <VariationLine
              tree={tree}
              startId={alt}
              currentId={currentId}
              onSelect={onSelect}
              onDelete={onDelete}
              depth={depth + 1}
            />
            )
          </span>,
        );
        force = true;
      }
    }
    const next: NodeId | undefined = node.children[0];
    node = next === undefined ? undefined : getNode(tree, next);
  }
  const start = getNode(tree, startId);
  return (
    <span className="inline">
      {parts.map((p, i) => (
        <Fragment key={i}>{p} </Fragment>
      ))}
      {start.origin === "explore" && depth === 0 && (
        <button
          type="button"
          onClick={() => onDelete(startId)}
          className="ml-1 inline-flex size-6 items-center justify-center rounded align-middle text-base-content/45 hover:bg-base-300 hover:text-error"
          aria-label={t("moves.deleteVariation")}
          title={t("moves.deleteVariation")}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/**
 * The game as a scoresheet: numbered rows of White and Black moves, with variations
 * (imported or explored) shown under the move they branch from.
 */
function MoveListImpl({ byNode }: { byNode: Record<NodeId, MoveClassification> }) {
  const tree = useAnalysis((s) => s.tree);
  const currentId = useAnalysis((s) => s.currentId);
  const result = useAnalysis((s) => s.result);
  const { goTo, deleteVariation } = useAnalysis.getState();
  const container = useRef<HTMLDivElement>(null);
  const t = useT();

  // Keep the current move visible, scrolling only this list (never the page).
  useEffect(() => {
    const box = container.current;
    const el = box?.querySelector<HTMLElement>(`[data-node="${currentId}"]`);
    if (!box || !el) return;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop + 8) box.scrollTop = Math.max(0, top - 40);
    else if (top + el.offsetHeight > box.scrollTop + box.clientHeight - 8) {
      box.scrollTop = top - box.clientHeight + el.offsetHeight + 40;
    }
  }, [currentId]);

  const line = mainline(tree);
  const root = line[0]!;
  const rows: ReactNode[] = [];
  let pendingWhite: MoveNode | null = null;

  const variationsAfter = (node: MoveNode) => {
    const parent = node.parentId ? getNode(tree, node.parentId) : null;
    return parent ? parent.children.filter((c) => c !== node.id) : [];
  };

  const renderRow = (white: MoveNode | null, black: MoveNode | null, key: string) => {
    const number = Math.ceil((white ?? black)!.ply / 2);
    rows.push(
      <div
        key={key}
        className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-x-0.5 odd:bg-base-200/40"
      >
        <span className="tabular pl-2 font-mono text-[12px] text-base-content/45">{number}.</span>
        {white ? (
          <MoveButton
            node={white}
            current={white.id === currentId}
            classification={byNode[white.id]}
            onSelect={goTo}
          />
        ) : (
          <span className="px-1.5 font-mono text-base-content/35">…</span>
        )}
        {black ? (
          <MoveButton
            node={black}
            current={black.id === currentId}
            classification={byNode[black.id]}
            onSelect={goTo}
          />
        ) : (
          <span />
        )}
      </div>,
    );
  };

  const renderVariations = (node: MoveNode) => {
    const alternatives = variationsAfter(node);
    if (!alternatives.length && !node.comment) return;
    rows.push(
      <div
        key={`var-${node.id}`}
        className="border-l-2 border-base-content/10 bg-base-200/60 px-3 py-1.5 text-[13px] leading-7"
      >
        {node.comment && <p className="text-xs leading-5 text-base-content/65">{node.comment}</p>}
        {alternatives.map((alt) => (
          <div key={alt}>
            <VariationLine
              tree={tree}
              startId={alt}
              currentId={currentId}
              onSelect={goTo}
              onDelete={deleteVariation}
              depth={0}
            />
          </div>
        ))}
      </div>,
    );
  };

  for (const node of line.slice(1)) {
    const hasExtras = variationsAfter(node).length > 0 || Boolean(node.comment);
    if (node.ply % 2 === 1) {
      if (hasExtras) {
        renderRow(node, null, `r-${node.id}`);
        renderVariations(node);
      } else {
        pendingWhite = node;
      }
    } else {
      renderRow(pendingWhite, node, `r-${node.id}`);
      pendingWhite = null;
      if (hasExtras) renderVariations(node);
    }
  }
  if (pendingWhite) renderRow(pendingWhite, null, `r-${pendingWhite.id}`);

  // Without main-line moves, everything played from the start is a variation.
  const rootVariations = line.length === 1 ? root.children : [];
  const last = line[line.length - 1]!;
  const afterEnd = line.length > 1 ? last.children : [];

  return (
    <div
      ref={container}
      className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
      data-testid="move-list"
    >
      {root.comment && <p className="px-3 py-2 text-xs text-base-content/65">{root.comment}</p>}
      {line.length === 1 && rootVariations.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-base-content/55">{t("moves.empty")}</p>
      )}
      {line.length === 1 && rootVariations.length > 0 && (
        <div className="px-3 py-1.5 text-[13px] leading-7">
          {rootVariations.map((alt) => (
            <div key={alt}>
              <VariationLine
                tree={tree}
                startId={alt}
                currentId={currentId}
                onSelect={goTo}
                onDelete={deleteVariation}
                depth={0}
              />
            </div>
          ))}
        </div>
      )}
      {rows}
      {afterEnd.length > 0 && (
        <div className="border-l-2 border-accent/40 bg-base-200/60 px-3 py-1.5 text-[13px] leading-7">
          {afterEnd.map((alt) => (
            <div key={alt}>
              <VariationLine
                tree={tree}
                startId={alt}
                currentId={currentId}
                onSelect={goTo}
                onDelete={deleteVariation}
                depth={0}
              />
            </div>
          ))}
        </div>
      )}
      {line.length > 1 && result !== "*" && (
        <p className="px-3 py-2 text-center font-mono text-sm font-medium text-base-content/70">
          {result}
        </p>
      )}
    </div>
  );
}

/** Memoized: re-renders only when its props change, not on every engine update. */
export const MoveList = memo(MoveListImpl);

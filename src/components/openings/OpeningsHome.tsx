"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { ArrowRight, Repeat, Search, Wrench } from "lucide-react";
import {
  CATALOG,
  ECO_FAMILIES,
  ecoFamily,
  firstMove,
  searchCatalog,
  type CatalogOpening,
} from "@/features/openings/catalog";
import { useLocale, useT } from "@/lib/i18n/useT";
import { MiniBoard } from "./MiniBoard";

type Grouping = "side" | "family" | "first";
type SideFilter = "all" | "white" | "black";

function keyPosition(opening: CatalogOpening): string {
  const chess = new Chess();
  for (const san of opening.lines[0]!.moves.slice(0, opening.keyPlies)) chess.move(san);
  return chess.fen();
}

function SideSwatch({
  side,
  className = "size-2.5",
}: {
  side: "white" | "black";
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-sm ring-1 ring-base-content/30 ${className} ${side === "white" ? "bg-eval-white" : "bg-eval-black"}`}
      aria-hidden="true"
    />
  );
}

function OpeningCard({ opening, showSide }: { opening: CatalogOpening; showSide: boolean }) {
  const t = useT();
  const locale = useLocale();
  const fen = useMemo(() => keyPosition(opening), [opening]);
  const keyMoves = opening.lines[0]!.moves.slice(0, opening.keyPlies);
  return (
    <li>
      <Link
        href={`/openings?o=${opening.id}`}
        className="panel group flex h-full flex-col gap-3 p-3 transition-colors hover:border-primary/60"
      >
        <MiniBoard fen={fen} orientation={opening.side} />
        <div className="flex flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span className="font-semibold">{opening.name[locale]}</span>
            <span className="ml-auto hidden shrink-0 font-mono text-[11px] whitespace-nowrap text-base-content/50 sm:inline">
              {opening.eco}
            </span>
          </span>
          <span className="font-mono text-xs text-base-content/60">
            {keyMoves.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : san)).join(" ")}
          </span>
          <span className="text-sm leading-5 text-base-content/70">{opening.summary[locale]}</span>
          <span className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
            {showSide && (
              <span className="mr-1 flex items-center gap-1 font-normal text-base-content/60">
                <SideSwatch side={opening.side} />
                {t(opening.side === "white" ? "side.white" : "side.black")} ·
              </span>
            )}
            {t("openingsHome.lines", { n: opening.lines.length })}
            <ArrowRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </div>
      </Link>
    </li>
  );
}

interface Group {
  id: string;
  title: string;
  intro: string;
  /** Shown before the title: a side's colour, or a short label (ECO letter, first move). */
  marker: { side: "white" | "black" } | { text: string };
  openings: CatalogOpening[];
}

function useGroups(grouping: Grouping, openings: CatalogOpening[]): Group[] {
  const t = useT();
  const locale = useLocale();
  if (grouping === "side") {
    return (["white", "black"] as const).map((side) => ({
      id: side,
      title: t(side === "white" ? "openingsHome.white" : "openingsHome.black"),
      intro: t(side === "white" ? "openingsHome.whiteIntro" : "openingsHome.blackIntro"),
      marker: { side },
      openings: openings.filter((o) => o.side === side),
    }));
  }
  if (grouping === "family") {
    return ECO_FAMILIES.map((family) => ({
      id: family.id,
      title: family.name[locale],
      intro: t("openingsHome.familyIntro", { letter: family.id, moves: family.moves }),
      marker: { text: family.id },
      openings: openings.filter((o) => ecoFamily(o) === family.id),
    }));
  }
  // By White's first move, the most common first.
  const byMove = new Map<string, CatalogOpening[]>();
  for (const o of openings) byMove.set(firstMove(o), [...(byMove.get(firstMove(o)) ?? []), o]);
  return [...byMove.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([move, list]) => ({
      id: move,
      title: t("openingsHome.after", { move }),
      intro: t("openingsHome.afterIntro", { n: list.length }),
      marker: { text: move.slice(2) },
      openings: list,
    }));
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange(value: T): void;
}) {
  return (
    <div className="join" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`btn join-item btn-sm ${value === o.id ? "btn-active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The openings page: every catalogued opening, grouped by side, by ECO family or by
 * White's first move, with a search over names, variations and ECO codes.
 */
export function OpeningsHome() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<SideFilter>("all");
  const [grouping, setGrouping] = useState<Grouping>("side");

  const openings = useMemo(
    () => searchCatalog(query).filter((o) => side === "all" || o.side === side),
    [query, side],
  );
  const groups = useGroups(grouping, openings).filter((g) => g.openings.length > 0);
  const lineCount = CATALOG.reduce((n, o) => n + o.lines.length, 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-8">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("nav.openings")}</h1>
          <p className="max-w-2xl text-sm leading-6 text-base-content/70">
            {t("openingsHome.intro")}{" "}
            {t("openingsHome.count", { openings: CATALOG.length, lines: lineCount })}
          </p>
        </div>
        <Link href="/trainer" className="btn btn-soft btn-primary btn-sm">
          <Repeat className="size-4" aria-hidden="true" />
          {t("nav.trainer")}
        </Link>
        <Link href="/openings?view=studio" className="btn btn-ghost btn-sm">
          <Wrench className="size-4" aria-hidden="true" />
          {t("openingsHome.advanced")}
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="input min-w-0 flex-1 basis-56 input-sm">
          <Search className="size-4 opacity-60" aria-hidden="true" />
          <span className="sr-only">{t("openingsHome.search")}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("openingsHome.searchPlaceholder")}
          />
        </label>
        <Segmented<SideFilter>
          label={t("openingsHome.sideFilter")}
          value={side}
          onChange={setSide}
          options={[
            { id: "all", label: t("openingsHome.all") },
            { id: "white", label: t("side.white") },
            { id: "black", label: t("side.black") },
          ]}
        />
        <Segmented<Grouping>
          label={t("openingsHome.groupBy")}
          value={grouping}
          onChange={setGrouping}
          options={[
            { id: "side", label: t("openingsHome.bySide") },
            { id: "family", label: t("openingsHome.byFamily") },
            { id: "first", label: t("openingsHome.byFirstMove") },
          ]}
        />
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-base-content/65" role="status">
          {t("openingsHome.noMatch", { query })}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-3" aria-labelledby={`g-${group.id}`}>
          <div className="flex items-center gap-2">
            {"side" in group.marker ? (
              <SideSwatch side={group.marker.side} className="size-3.5" />
            ) : (
              <span
                className="flex h-6 min-w-6 items-center justify-center rounded-field bg-primary/12 px-1.5 font-mono text-xs font-semibold text-primary"
                aria-hidden="true"
              >
                {group.marker.text}
              </span>
            )}
            <h2 id={`g-${group.id}`} className="text-lg font-semibold">
              {group.title}
            </h2>
            <span className="tabular text-sm text-base-content/50">{group.openings.length}</span>
          </div>
          <p className="-mt-2 text-sm text-base-content/65">{group.intro}</p>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {group.openings.map((o) => (
              <OpeningCard key={o.id} opening={o} showSide={grouping !== "side"} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

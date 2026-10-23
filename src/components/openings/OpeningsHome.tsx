"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Chess } from "chess.js";
import { ArrowRight, Wrench } from "lucide-react";
import { CATALOG, type CatalogOpening } from "@/features/openings/catalog";
import { useLocale, useT } from "@/lib/i18n/useT";
import { MiniBoard } from "./MiniBoard";

function keyPosition(opening: CatalogOpening): string {
  const chess = new Chess();
  for (const san of opening.lines[0]!.moves.slice(0, opening.keyPlies)) chess.move(san);
  return chess.fen();
}

function OpeningCard({ opening }: { opening: CatalogOpening }) {
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

/** The openings page: a grid of the main openings for White and for Black. */
export function OpeningsHome() {
  const t = useT();
  const sections: { side: "white" | "black"; title: string; intro: string }[] = [
    { side: "white", title: t("openingsHome.white"), intro: t("openingsHome.whiteIntro") },
    { side: "black", title: t("openingsHome.black"), intro: t("openingsHome.blackIntro") },
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:py-8">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("nav.openings")}</h1>
          <p className="max-w-2xl text-sm leading-6 text-base-content/70">
            {t("openingsHome.intro")}
          </p>
        </div>
        <Link href="/openings?view=studio" className="btn btn-ghost btn-sm">
          <Wrench className="size-4" aria-hidden="true" />
          {t("openingsHome.advanced")}
        </Link>
      </header>
      {sections.map((section) => (
        <section
          key={section.side}
          className="flex flex-col gap-3"
          aria-labelledby={`side-${section.side}`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-block size-3.5 rounded-sm ring-1 ring-base-content/30 ${section.side === "white" ? "bg-eval-white" : "bg-eval-black"}`}
              aria-hidden="true"
            />
            <h2 id={`side-${section.side}`} className="text-lg font-semibold">
              {section.title}
            </h2>
          </div>
          <p className="-mt-2 text-sm text-base-content/65">{section.intro}</p>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {CATALOG.filter((o) => o.side === section.side).map((o) => (
              <OpeningCard key={o.id} opening={o} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

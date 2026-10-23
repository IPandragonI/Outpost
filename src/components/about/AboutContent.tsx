"use client";

import Link from "next/link";
import { CLASSIFICATIONS, DEFAULT_RULES } from "@/features/classification/classification-rules";
import { ClassificationBadge } from "@/components/analysis/ClassificationBadge";
import { useT } from "@/lib/i18n/useT";
import { CREDITS } from "./credits";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function AboutContent() {
  const t = useT();
  const thresholds: Partial<Record<(typeof CLASSIFICATIONS)[number], string>> = {
    excellent: t("about.lossUpTo", { pct: pct(DEFAULT_RULES.excellent) }),
    good: t("about.lossUpTo", { pct: pct(DEFAULT_RULES.good) }),
    inaccuracy: t("about.lossUpTo", { pct: pct(DEFAULT_RULES.inaccuracy) }),
    mistake: t("about.lossUpTo", { pct: pct(DEFAULT_RULES.mistake) }),
    blunder: t("about.lossAbove", { pct: pct(DEFAULT_RULES.mistake) }),
    brilliant: t("about.brilliantRule", { n: DEFAULT_RULES.brilliantMinSacrifice }),
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-6 sm:px-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{t("about.title")}</h1>
        <p className="text-sm leading-6 text-base-content/75">{t("about.intro")}</p>
      </header>

      <section className="panel flex flex-col gap-3 p-4" aria-labelledby="method">
        <h2 id="method" className="text-base font-semibold">
          {t("about.methodTitle")}
        </h2>
        <p className="text-sm leading-6 text-base-content/80">{t("about.method")}</p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {CLASSIFICATIONS.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <ClassificationBadge classification={c} className="mt-0.5 size-5 text-[9px]" />
              <span>
                <span className="font-medium">{t(`cls.${c}`)}</span>
                {" — "}
                {t(`cls.${c}.desc`)}
                {thresholds[c] && ` ${thresholds[c]}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm leading-6 text-base-content/80">{t("about.precision")}</p>
        <p className="text-sm leading-6 text-base-content/80">{t("about.limits")}</p>
      </section>

      <section className="panel flex flex-col gap-3 p-4" aria-labelledby="openings">
        <h2 id="openings" className="text-base font-semibold">
          {t("about.openingsTitle")}
        </h2>
        <p className="text-sm leading-6 text-base-content/80">{t("about.openings")}</p>
      </section>

      <section className="panel flex flex-col gap-3 p-4" aria-labelledby="chesscom">
        <h2 id="chesscom" className="text-base font-semibold">
          {t("about.chesscomTitle")}
        </h2>
        <p className="text-sm leading-6 text-base-content/80">{t("about.chesscom")}</p>
      </section>

      <section className="panel flex flex-col gap-3 p-4" aria-labelledby="licenses">
        <h2 id="licenses" className="text-base font-semibold">
          {t("about.licensesTitle")}
        </h2>
        <p className="text-sm leading-6 text-base-content/80">{t("about.licenses")}</p>
        <ul className="flex flex-col divide-y divide-base-content/8 text-sm">
          {CREDITS.map((c) => (
            <li key={c.name} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
              <a href={c.url} className="link font-medium" rel="noreferrer" target="_blank">
                {c.name}
              </a>
              <span className="text-base-content/65">{t(c.what)}</span>
              <span className="ml-auto font-mono text-xs text-base-content/60">{c.license}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-xs text-base-content/55">
        <Link href="/settings" className="link">
          {t("about.back")}
        </Link>
      </p>
    </div>
  );
}

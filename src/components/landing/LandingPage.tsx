"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Cpu,
  GraduationCap,
  Repeat,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { GameRecord } from "@/features/storage/database";
import { games } from "@/features/storage/repositories";
import type { MessageKey } from "@/lib/i18n/translate";
import { useT } from "@/lib/i18n/useT";
import { START_FEN } from "@/lib/chess/position";
import { HeroGame } from "./HeroGame";

const FEATURES: { icon: LucideIcon; title: MessageKey; text: MessageKey }[] = [
  { icon: Cpu, title: "landing.f.engine.title", text: "landing.f.engine.text" },
  { icon: Sparkles, title: "landing.f.review.title", text: "landing.f.review.text" },
  { icon: BookOpen, title: "landing.f.openings.title", text: "landing.f.openings.text" },
  { icon: Repeat, title: "landing.f.trainer.title", text: "landing.f.trainer.text" },
  { icon: GraduationCap, title: "landing.f.learn.title", text: "landing.f.learn.text" },
  { icon: ShieldCheck, title: "landing.f.private.title", text: "landing.f.private.text" },
];

const STEPS: { title: MessageKey; text: MessageKey }[] = [
  { title: "landing.step1.title", text: "landing.step1.text" },
  { title: "landing.step2.title", text: "landing.step2.text" },
  { title: "landing.step3.title", text: "landing.step3.text" },
];

function RecentGames() {
  const t = useT();
  const [recent, setRecent] = useState<GameRecord[]>([]);
  useEffect(() => {
    games.list().then(
      (list) => setRecent(list.slice(0, 3)),
      () => setRecent([]),
    );
  }, []);
  if (!recent.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="recent-title">
      <h2 id="recent-title" className="panel-title">
        {t("landing.recent")}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-3">
        {recent.map((g) => (
          <li key={g.id}>
            <Link
              href={`/analysis?game=${g.id}`}
              className="panel flex h-full flex-col gap-0.5 px-3 py-2 hover:border-primary/50"
            >
              <span className="truncate text-sm font-medium">{g.title}</span>
              <span className="truncate text-xs text-base-content/60">
                {[g.result !== "*" ? g.result : null, g.opening || null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LandingPage() {
  const t = useT();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-4 py-8 sm:py-10">
      <section
        className="grid items-center gap-10 lg:min-h-[calc(100dvh-9rem)] lg:grid-cols-[1.05fr_1fr] lg:gap-14"
        aria-labelledby="hero"
      >
        <div className="flex flex-col gap-6">
          <p className="w-fit rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium tracking-wide text-primary">
            {t("landing.kicker")}
          </p>
          <h1
            id="hero"
            className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.5rem]"
          >
            {t("landing.title")}
          </h1>
          <p className="max-w-xl text-lg leading-8 text-base-content/75">{t("landing.lead")}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/games" className="btn btn-lg btn-primary">
              {t("landing.cta.analyze")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href={`/analysis?fen=${encodeURIComponent(START_FEN)}`}
              className="btn btn-soft btn-lg"
            >
              {t("landing.cta.board")}
            </Link>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-base-content/70">
            <li>
              <Link href="/trainer" className="flex items-center gap-1.5 hover:text-primary">
                <Repeat className="size-4 text-primary" aria-hidden="true" />
                {t("landing.cta.trainer")}
              </Link>
            </li>
            <li>
              <Link href="/learn" className="flex items-center gap-1.5 hover:text-primary">
                <GraduationCap className="size-4 text-primary" aria-hidden="true" />
                {t("landing.cta.learn")}
              </Link>
            </li>
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
              {t("library.privacy")}
            </li>
          </ul>
        </div>
        <HeroGame />
      </section>

      <RecentGames />

      <section className="flex flex-col gap-4" aria-labelledby="features">
        <h2 id="features" className="text-xl font-semibold tracking-tight">
          {t("landing.featuresTitle")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="panel flex flex-col gap-2 p-4">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="font-medium">{t(title)}</h3>
              <p className="text-sm leading-6 text-base-content/70">{t(text)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="how">
        <h2 id="how" className="text-xl font-semibold tracking-tight">
          {t("landing.howTitle")}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-semibold text-primary-content"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-medium">{t(step.title)}</h3>
                <p className="text-sm leading-6 text-base-content/70">{t(step.text)}</p>
              </div>
            </li>
          ))}
        </ol>
        <div>
          <Link href="/games" className="btn btn-primary">
            {t("landing.cta.start")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <p className="text-center text-xs text-base-content/55">
        <Link href="/about" className="link">
          {t("settings.about")}
        </Link>
      </p>
    </div>
  );
}

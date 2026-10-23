"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import {
  ArrowRight,
  BookOpen,
  Cpu,
  Download,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { ChessBoard } from "@/components/board/ChessBoard";
import type { GameRecord } from "@/features/storage/database";
import { games } from "@/features/storage/repositories";
import type { MessageKey } from "@/lib/i18n/translate";
import { useT } from "@/lib/i18n/useT";
import { START_FEN } from "@/lib/chess/position";

/** Morphy's Opera Game, 1858, just after 16. Qb8+!! — the showcase position. */
const SHOWCASE = (() => {
  const chess = new Chess();
  const moves =
    "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+";
  let last = null;
  for (const san of moves.split(" ")) last = chess.move(san);
  return { fen: chess.fen(), lastMove: { from: last!.from, to: last!.to } };
})();

const FEATURES: { icon: LucideIcon; title: MessageKey; text: MessageKey }[] = [
  { icon: Cpu, title: "landing.f.engine.title", text: "landing.f.engine.text" },
  { icon: Sparkles, title: "landing.f.review.title", text: "landing.f.review.text" },
  { icon: BookOpen, title: "landing.f.openings.title", text: "landing.f.openings.text" },
  { icon: GraduationCap, title: "landing.f.learn.title", text: "landing.f.learn.text" },
  { icon: Download, title: "landing.f.import.title", text: "landing.f.import.text" },
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-8 sm:py-12">
      <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]" aria-labelledby="hero">
        <div className="flex flex-col gap-5">
          <p className="text-sm font-medium text-primary">{t("landing.kicker")}</p>
          <h1 id="hero" className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            {t("landing.title")}
          </h1>
          <p className="max-w-xl text-base leading-7 text-base-content/75">{t("landing.lead")}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/games" className="btn btn-primary">
              {t("landing.cta.analyze")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href={`/analysis?fen=${encodeURIComponent(START_FEN)}`} className="btn btn-soft">
              {t("landing.cta.board")}
            </Link>
            <Link href="/learn" className="btn btn-ghost">
              {t("landing.cta.learn")}
            </Link>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-base-content/60">
            <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
            {t("library.privacy")}
          </p>
        </div>
        <figure className="mx-auto w-full max-w-md">
          <ChessBoard
            id="landing-board"
            fen={SHOWCASE.fen}
            orientation="white"
            lastMove={SHOWCASE.lastMove}
            badge={{ square: "b8", classification: "brilliant" }}
          />
          <figcaption className="mt-2 text-center text-xs text-base-content/60">
            {t("landing.showcase")}
          </figcaption>
        </figure>
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

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Puzzle } from "lucide-react";
import { ENDGAME_GROUPS, LESSONS, TOPICS, lessonById, type Lesson } from "@/features/learn/lessons";
import { useSettings } from "@/features/settings/settings-store";
import { useLocale, useT } from "@/lib/i18n/useT";
import { LessonView } from "./LessonView";

/** `/learn` lists the lessons by topic; `/learn?lesson=<id>` opens one. */
export function LearnPage() {
  const params = useSearchParams();
  const lesson = lessonById(params.get("lesson") ?? "");
  if (lesson) return <LessonView lesson={lesson} />;
  return <LessonIndex />;
}

function LessonCards({ lessons, solved }: { lessons: Lesson[]; solved: string[] }) {
  const t = useT();
  const locale = useLocale();
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {lessons.map((l) => (
        <li key={l.id}>
          <Link
            href={`/learn?lesson=${l.id}`}
            className="panel flex h-full flex-col gap-1.5 p-4 hover:border-primary/50"
          >
            <span className="flex items-center gap-2 font-medium">
              {l.title[locale]}
              {l.exercise &&
                (solved.includes(l.id) ? (
                  <CheckCircle2
                    className="ml-auto size-4 shrink-0 text-success"
                    aria-label={t("learn.solved")}
                  />
                ) : (
                  <Puzzle
                    className="ml-auto size-4 shrink-0 text-base-content/45"
                    aria-label={t("learn.hasExercise")}
                  />
                ))}
            </span>
            <span className="text-sm leading-6 text-base-content/70">{l.summary[locale]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function LessonIndex() {
  const t = useT();
  const locale = useLocale();
  const solved = useSettings((s) => s.solvedLessons);
  const exercises = LESSONS.filter((l) => l.exercise);
  const done = exercises.filter((l) => solved.includes(l.id)).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("learn.title")}</h1>
        <p className="max-w-2xl text-sm leading-6 text-base-content/70">{t("learn.intro")}</p>
        <p className="text-sm text-base-content/65" aria-live="polite">
          {t("learn.progress", { done, total: exercises.length })}
        </p>
      </header>
      {TOPICS.map((topic) => (
        <section
          key={topic.id}
          className="flex flex-col gap-3"
          aria-labelledby={`topic-${topic.id}`}
        >
          <div>
            <h2 id={`topic-${topic.id}`} className="text-lg font-semibold">
              {topic.title[locale]}
            </h2>
            <p className="text-sm text-base-content/65">{topic.intro[locale]}</p>
          </div>
          {topic.id === "endgames" ? (
            ENDGAME_GROUPS.map((group) => (
              <div key={group.id} className="flex flex-col gap-2">
                <h3 className="panel-title">{group.title[locale]}</h3>
                <LessonCards
                  lessons={LESSONS.filter((l) => l.group === group.id)}
                  solved={solved}
                />
              </div>
            ))
          ) : (
            <LessonCards lessons={LESSONS.filter((l) => l.topic === topic.id)} solved={solved} />
          )}
        </section>
      ))}
      <p className="text-sm text-base-content/65">
        {t("learn.moreOpenings")}{" "}
        <Link href="/openings" className="link">
          {t("nav.openings")}
        </Link>
      </p>
    </div>
  );
}

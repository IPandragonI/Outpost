"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lightbulb,
} from "lucide-react";
import { ChessBoard, type BoardMove } from "@/components/board/ChessBoard";
import { LESSONS, type Exercise, type Lesson } from "@/features/learn/lessons";
import { useSettings } from "@/features/settings/settings-store";
import { useLocale, useT } from "@/lib/i18n/useT";
import { useMoveSound } from "@/hooks/useMoveSound";

/** Positions along a lesson's line: fens[0] is the lesson position. */
function lineOf(lesson: Lesson) {
  const chess = new Chess(lesson.fen);
  const fens = [chess.fen()];
  const moves: { san: string; from: string; to: string }[] = [];
  for (const san of lesson.line ?? []) {
    const move = chess.move(san);
    fens.push(chess.fen());
    moves.push({ san: move.san, from: move.from, to: move.to });
  }
  return { fens, moves };
}

type Attempt =
  | { state: "idle" }
  | { state: "wrong"; san: string }
  | { state: "solved"; san: string; fen: string; from: string; to: string };

/** Accepts the expected move, or any other mate when the exercise asks for a mate. */
export function checkExerciseMove(exercise: Exercise, move: BoardMove): Attempt {
  const chess = new Chess(exercise.fen);
  let played;
  try {
    played = chess.move(move);
  } catch {
    return { state: "idle" };
  }
  const correct =
    played.san === exercise.solution || (exercise.solution.endsWith("#") && chess.isCheckmate());
  return correct
    ? { state: "solved", san: played.san, fen: chess.fen(), from: played.from, to: played.to }
    : { state: "wrong", san: played.san };
}

function ExercisePanel({ lesson, exercise }: { lesson: Lesson; exercise: Exercise }) {
  const t = useT();
  const locale = useLocale();
  const solvedLessons = useSettings((s) => s.solvedLessons);
  const set = useSettings((s) => s.set);
  const [attempt, setAttempt] = useState<Attempt>({ state: "idle" });
  const play = useMoveSound();
  const [hint, setHint] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const turn = exercise.fen.split(" ")[1] === "b" ? "black" : "white";

  const onMove = (move: BoardMove) => {
    const result = checkExerciseMove(exercise, move);
    if (result.state === "solved") play({ san: result.san });
    else if (result.state === "wrong") play("error");
    setAttempt(result);
    if (result.state === "solved" && !solvedLessons.includes(lesson.id)) {
      set({ solvedLessons: [...solvedLessons, lesson.id] });
    }
  };

  const solution = useMemo(() => {
    const chess = new Chess(exercise.fen);
    const move = chess.move(exercise.solution);
    return { fen: chess.fen(), from: move.from, to: move.to };
  }, [exercise]);

  const shown =
    attempt.state === "solved"
      ? attempt
      : revealed
        ? { fen: solution.fen, from: solution.from, to: solution.to }
        : null;

  return (
    <section
      className="panel flex flex-col gap-3 p-4"
      aria-labelledby="exercise-title"
      data-testid="exercise"
    >
      <h2 id="exercise-title" className="panel-title">
        {t("learn.exercise")}
      </h2>
      <p className="font-medium">{exercise.prompt[locale]}</p>
      <div className="mx-auto w-full max-w-md">
        <ChessBoard
          id="exercise-board"
          fen={shown ? shown.fen : exercise.fen}
          orientation={turn}
          lastMove={shown ? { from: shown.from, to: shown.to } : null}
          {...(shown ? {} : { onMove })}
        />
      </div>
      <div aria-live="polite" className="flex flex-col gap-1 text-sm">
        {attempt.state === "wrong" && (
          <p className="text-cls-mistake">{t("learn.wrong", { san: attempt.san })}</p>
        )}
        {attempt.state === "solved" && (
          <p className="font-medium text-cls-best">{t("learn.correct", { san: attempt.san })}</p>
        )}
        {(attempt.state === "solved" || revealed) && <p>{exercise.explanation[locale]}</p>}
        {hint && attempt.state !== "solved" && !revealed && (
          <p className="text-base-content/75">{exercise.hint[locale]}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {attempt.state !== "solved" && !revealed && (
          <>
            <button
              type="button"
              className="btn btn-soft btn-sm"
              onClick={() => setHint(true)}
              disabled={hint}
            >
              <Lightbulb className="size-4" aria-hidden="true" />
              {t("learn.hint")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setRevealed(true)}
            >
              {t("learn.showSolution")}
            </button>
          </>
        )}
        {(attempt.state === "solved" || revealed) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setAttempt({ state: "idle" });
              setRevealed(false);
              setHint(false);
            }}
          >
            {t("learn.retry")}
          </button>
        )}
      </div>
    </section>
  );
}

export function LessonView({ lesson }: { lesson: Lesson }) {
  const t = useT();
  const locale = useLocale();
  const { fens, moves } = useMemo(() => lineOf(lesson), [lesson]);
  const [step, setStep] = useState(0);
  const index = LESSONS.indexOf(lesson);
  const previous = LESSONS[index - 1];
  const next = LESSONS[index + 1];
  const startsBlack = lesson.fen.split(" ")[1] === "b";
  const moveNo = Number(lesson.fen.split(" ")[5] ?? 1);
  const last = step > 0 ? moves[step - 1]! : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6" key={lesson.id}>
      <Link href="/learn" className="btn self-start btn-ghost btn-sm">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("learn.back")}
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{lesson.title[locale]}</h1>
          <p className="font-medium text-base-content/80">{lesson.summary[locale]}</p>
          {lesson.body[locale].map((p) => (
            <p key={p} className="leading-7 text-base-content/80">
              {p}
            </p>
          ))}
          <Link
            href={`/analysis?fen=${encodeURIComponent(fens[step]!)}`}
            className="btn self-start btn-soft btn-sm"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {t("learn.analyze")}
          </Link>
        </article>

        <div className="flex flex-col gap-3">
          {lesson.line && (
            <section className="flex flex-col gap-2" aria-label={t("learn.line")}>
              <div className="mx-auto w-full max-w-md">
                <ChessBoard
                  id="lesson-board"
                  fen={fens[step]!}
                  orientation={lesson.orientation ?? "white"}
                  lastMove={last ? { from: last.from, to: last.to } : null}
                />
              </div>
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  className="btn min-h-11 btn-ghost btn-sm"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  aria-label={t("nav.prev")}
                >
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </button>
                <span className="tabular min-w-20 text-center text-sm text-base-content/65">
                  {step} / {moves.length}
                </span>
                <button
                  type="button"
                  className="btn min-h-11 btn-ghost btn-sm"
                  onClick={() => setStep((s) => Math.min(moves.length, s + 1))}
                  disabled={step === moves.length}
                  aria-label={t("nav.next")}
                >
                  <ChevronRight className="size-5" aria-hidden="true" />
                </button>
              </div>
              <p className="font-mono text-[13px] leading-6">
                {moves.map((m, i) => {
                  const ply = i + (startsBlack ? 1 : 0);
                  const number = Math.floor(ply / 2) + moveNo;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setStep(i + 1)}
                      className={`mr-1 rounded px-1 ${step === i + 1 ? "bg-primary text-primary-content" : "hover:bg-base-300"}`}
                    >
                      {(ply % 2 === 0 || i === 0) && (
                        <span className="text-base-content/50">
                          {number}
                          {ply % 2 === 0 ? "." : "…"}
                        </span>
                      )}
                      {m.san}
                    </button>
                  );
                })}
              </p>
            </section>
          )}
          {lesson.exercise && (
            <ExercisePanel key={lesson.id} lesson={lesson} exercise={lesson.exercise} />
          )}
        </div>
      </div>

      <nav
        className="flex flex-wrap justify-between gap-2 border-t border-base-content/10 pt-4"
        aria-label={t("learn.lessonNav")}
      >
        {previous ? (
          <Link href={`/learn?lesson=${previous.id}`} className="btn btn-ghost btn-sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {previous.title[locale]}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/learn?lesson=${next.id}`} className="btn btn-ghost btn-sm">
            {next.title[locale]}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </nav>
    </div>
  );
}

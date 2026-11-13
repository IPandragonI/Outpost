"use client";

import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import type { Behavior, HistorySummary } from "@/features/stats/behavior";
import type { StyleId, StyleProfile, Trait } from "@/features/stats/style";
import type { MessageKey } from "@/lib/i18n/messages";
import type { Translate } from "@/lib/i18n/translate";
import { useLocale, useT } from "@/lib/i18n/useT";

/** Progress and outcome of reading the Chess.com archives. */
export type SyncState =
  | { status: "idle" }
  | { status: "loading"; done: number; total: number }
  | { status: "error"; message: string };

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel flex flex-col gap-3 p-4 ${className}`} aria-label={title}>
      <h2 className="panel-title">{title}</h2>
      {children}
    </section>
  );
}

export function timeClassName(t: Translate, timeClass: string): string {
  return ["bullet", "blitz", "rapid", "daily"].includes(timeClass)
    ? t(`chesscom.timeClass.${timeClass}` as MessageKey)
    : timeClass;
}

/**
 * What was read from Chess.com, and the button to read it: the history is what anchors the
 * level estimate to the real rating and shows the results over all the games.
 */
export function HistoryCard({
  history,
  sync,
  online,
  onSync,
}: {
  history: HistorySummary | null;
  sync: SyncState;
  online: boolean;
  onSync(): void;
}) {
  const t = useT();
  const locale = useLocale();
  const date = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const loading = sync.status === "loading";
  return (
    <Card title={t("coach.history.title")} className="md:col-span-2">
      {history ? (
        <>
          <p className="text-sm" data-testid="history-summary">
            {t("coach.history.summary", {
              n: history.games,
              date: history.since ? date.format(history.since) : "—",
              updated: date.format(history.fetchedAt),
            })}
          </p>
          {history.byClass.length > 0 && (
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-base-content/75">
              {history.byClass.map((c) =>
                c.current !== null ? (
                  <li key={c.timeClass} className="tabular">
                    {t("coach.history.rating", {
                      tc: timeClassName(t, c.timeClass),
                      current: c.current,
                      best: c.best ?? c.current,
                    })}
                  </li>
                ) : null,
              )}
            </ul>
          )}
          {!history.complete && (
            <p className="text-xs text-warning">{t("coach.history.partial")}</p>
          )}
        </>
      ) : (
        <p className="text-sm leading-5 text-base-content/80">{t("coach.history.why")}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={`btn btn-sm ${history ? "btn-ghost" : "btn-primary"}`}
          disabled={loading || !online}
          onClick={onSync}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          {history ? t("coach.history.refresh") : t("coach.history.load")}
        </button>
        {loading && (
          <span className="text-xs text-base-content/65" aria-live="polite">
            {t("coach.history.loading", { done: sync.done, total: sync.total })}
          </span>
        )}
      </div>
      {!online && <p className="text-xs text-base-content/60">{t("coach.history.offline")}</p>}
      {sync.status === "error" && (
        <div role="alert" className="alert alert-soft py-2 text-sm alert-error">
          {sync.message}
        </div>
      )}
      <p className="text-xs text-base-content/50">{t("coach.history.privacy")}</p>
    </Card>
  );
}

const STYLES: StyleId[] = ["tactical", "positional", "chaotic", "endgame", "theory"];
const TONE = {
  good: "border-success",
  bad: "border-error",
  neutral: "border-base-content/30",
} as const;

function traitText(t: Translate, trait: Trait): string {
  return t(`coach.trait.${trait.id}` as MessageKey, trait.vars);
}

const pct = (value: number) => Math.round(value * 100);

function BehaviorLines({ behavior }: { behavior: Behavior }) {
  const t = useT();
  const lines: { key: string; tone: keyof typeof TONE; text: string }[] = [];
  if (behavior.afterLoss && behavior.baseline !== null) {
    lines.push({
      key: "afterLoss",
      tone: behavior.tilt ? "bad" : "neutral",
      text: t("coach.behavior.afterLoss", {
        a: pct(behavior.afterLoss.score),
        n: behavior.afterLoss.games,
        b: pct(behavior.baseline),
      }),
    });
  }
  if (behavior.tilt) {
    lines.push({ key: "tilt", tone: "bad", text: t("coach.behavior.tilt") });
  }
  if (behavior.afterWin) {
    lines.push({
      key: "afterWin",
      tone: "neutral",
      text: t("coach.behavior.afterWin", {
        a: pct(behavior.afterWin.score),
        n: behavior.afterWin.games,
      }),
    });
  }
  const part = (id: Behavior["best"]) => behavior.dayParts.find((d) => d.part === id);
  if (behavior.best && part(behavior.best)) {
    lines.push({
      key: "best",
      tone: "good",
      text: t("coach.behavior.dayBest", {
        part: t(`coach.part.${behavior.best}` as MessageKey),
        score: pct(part(behavior.best)!.score),
      }),
    });
  }
  if (behavior.worst && part(behavior.worst)) {
    lines.push({
      key: "worst",
      tone: "bad",
      text: t("coach.behavior.dayWorst", {
        part: t(`coach.part.${behavior.worst}` as MessageKey),
        score: pct(part(behavior.worst)!.score),
      }),
    });
  }
  if (!lines.length) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="behavior">
      <h3 className="panel-title">{t("coach.behavior.title")}</h3>
      <ul className="flex flex-col gap-2">
        {lines.map((line) => (
          <li key={line.key} className={`border-l-2 pl-3 text-sm leading-5 ${TONE[line.tone]}`}>
            {line.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The player's style and what stands out in how they play: the style with a short
 * description, how strongly each style shows, the habits found in their games, and, with the
 * Chess.com history, how they react to a loss and when they play best.
 */
export function StyleCard({
  style,
  behavior,
}: {
  style: StyleProfile | null;
  behavior: Behavior | null;
}) {
  const t = useT();
  return (
    <Card title={t("coach.style.title")} className="md:col-span-2">
      {!style ? (
        <p className="text-sm text-base-content/65">{t("coach.style.needGames")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <p className="text-lg font-medium" data-testid="style-primary">
              {t("coach.style.primary", {
                style: t(`coach.style.${style.primary}` as MessageKey),
              })}
            </p>
            <p className="text-sm leading-5 text-base-content/80">
              {t(`coach.style.${style.primary}.desc` as MessageKey)}
              {style.secondary && (
                <>
                  {" "}
                  {t("coach.style.secondary", {
                    style: t(`coach.style.${style.secondary}` as MessageKey).toLowerCase(),
                  })}
                </>
              )}
            </p>
            <h3 className="panel-title mt-1">{t("coach.style.profile")}</h3>
            <ul className="flex flex-col gap-2">
              {STYLES.map((id) => (
                <li key={id} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span>{t(`coach.style.${id}` as MessageKey)}</span>
                    <span className="tabular font-mono">{style.scores[id]}</span>
                  </div>
                  <progress
                    className="progress h-2 w-full progress-primary"
                    value={style.scores[id]}
                    max={100}
                    aria-label={t(`coach.style.${id}` as MessageKey)}
                  />
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4">
            {style.traits.length > 0 && (
              <ul className="flex flex-col gap-2" data-testid="traits">
                {style.traits.map((trait) => (
                  <li
                    key={trait.id}
                    className={`border-l-2 pl-3 text-sm leading-5 ${TONE[trait.tone]}`}
                  >
                    {traitText(t, trait)}
                  </li>
                ))}
              </ul>
            )}
            {behavior && <BehaviorLines behavior={behavior} />}
          </div>
        </div>
      )}
      {!style && behavior && <BehaviorLines behavior={behavior} />}
    </Card>
  );
}

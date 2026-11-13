"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { ClassificationBadge } from "@/components/analysis/ClassificationBadge";
import type { Classification } from "@/features/classification/classification-rules";
import { PHASES } from "@/features/classification/game-review";
import { useSettings } from "@/features/settings/settings-store";
import { loadProfileGames } from "@/features/stats/load-profile";
import {
  buildProfile,
  scoreOf,
  type Insight,
  type OpeningRow,
  type Profile,
  type ProfileGame,
  type Tally,
  type TimeClass,
} from "@/features/stats/profile";
import type { MessageKey } from "@/lib/i18n/messages";
import type { Translate } from "@/lib/i18n/translate";
import { useT } from "@/lib/i18n/useT";

const percent = (value: number) => Math.round(value * 100);
const one = (value: number | null) => (value === null ? "—" : value.toFixed(1));

function timeClassLabel(t: Translate, timeClass: TimeClass): string {
  switch (timeClass) {
    case "bullet":
    case "blitz":
    case "rapid":
    case "daily":
      return t(`chesscom.timeClass.${timeClass}` as MessageKey);
    case "classical":
      return t("coach.tc.classical");
    default:
      return t("coach.tc.unknown");
  }
}

function insightText(t: Translate, insight: Insight): string {
  const v = insight.vars;
  const vars: Record<string, string | number> = { ...v };
  if (typeof v.phase === "string") vars.phase = t(`phase.${v.phase}` as MessageKey).toLowerCase();
  if (typeof v.theme === "string") vars.theme = t(`theme.${v.theme}` as MessageKey).toLowerCase();
  if (typeof v.color === "string") vars.color = t(v.color === "w" ? "side.white" : "side.black");
  if (typeof v.tc === "string") vars.tc = timeClassLabel(t, v.tc as TimeClass);
  return t(`coach.insight.${insight.id}` as MessageKey, vars);
}

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

/** Wins, draws and losses as one bar, with their counts. */
function ResultBar({ tally }: { tally: Pick<Tally, "win" | "draw" | "loss"> }) {
  const t = useT();
  const total = tally.win + tally.draw + tally.loss;
  const width = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex h-3 overflow-hidden rounded-full bg-base-300"
        role="img"
        aria-label={`${t("coach.win")} ${tally.win}, ${t("coach.draw")} ${tally.draw}, ${t("coach.loss")} ${tally.loss}`}
      >
        <span className="bg-success" style={{ width: width(tally.win) }} />
        <span className="bg-base-content/30" style={{ width: width(tally.draw) }} />
        <span className="bg-error" style={{ width: width(tally.loss) }} />
      </div>
      <p className="tabular flex flex-wrap gap-x-3 text-xs text-base-content/70">
        <span>
          {t("coach.win")} <b className="font-mono text-success">{tally.win}</b>
        </span>
        <span>
          {t("coach.draw")} <b className="font-mono">{tally.draw}</b>
        </span>
        <span>
          {t("coach.loss")} <b className="font-mono text-error">{tally.loss}</b>
        </span>
      </p>
    </div>
  );
}

function ScoreLine({ label, tally }: { label: string; tally: Tally }) {
  const t = useT();
  const score = scoreOf(tally);
  return (
    <li className="flex flex-col gap-1.5 py-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular text-xs text-base-content/60">
          {t("coach.games", { n: tally.games })}
          {score !== null && ` · ${t("coach.score", { n: percent(score) })}`}
        </span>
      </div>
      <ResultBar tally={tally} />
    </li>
  );
}

function LevelCard({ profile }: { profile: Profile }) {
  const t = useT();
  const { level, actualRating } = profile;
  return (
    <Card title={t("coach.level.title")}>
      {level.estimate === null ? (
        <p className="text-sm text-base-content/65">{t("coach.level.none")}</p>
      ) : (
        <>
          <p className="flex items-baseline gap-2" data-testid="level-estimate">
            <span className="tabular font-mono text-4xl font-medium">~{level.estimate}</span>
            {level.trend !== null && level.trend !== 0 && (
              <span
                className={`flex items-center gap-1 text-sm ${level.trend > 0 ? "text-success" : "text-error"}`}
              >
                {level.trend > 0 ? (
                  <TrendingUp className="size-4" aria-hidden="true" />
                ) : (
                  <TrendingDown className="size-4" aria-hidden="true" />
                )}
                {level.trend > 0 ? "+" : ""}
                {level.trend}
              </span>
            )}
          </p>
          {level.low !== null && level.high !== null && level.low !== level.high && (
            <p className="text-sm text-base-content/80">
              {t("coach.level.range", { low: level.low, high: level.high })}
            </p>
          )}
          {level.trend !== null && level.trend !== 0 && (
            <p className="text-sm text-base-content/80">
              {t(level.trend > 0 ? "coach.level.up" : "coach.level.down", {
                n: Math.abs(level.trend),
              })}
            </p>
          )}
          {level.provisional && (
            <p className="text-xs text-warning">{t("coach.level.provisional")}</p>
          )}
          {actualRating.recent !== null && (
            <p className="text-sm text-base-content/80">
              {t("coach.level.actual", { n: actualRating.recent })}
              {actualRating.delta !== null && Math.abs(actualRating.delta) >= 50 && (
                <>
                  {" "}
                  {t(actualRating.delta > 0 ? "coach.level.above" : "coach.level.below", {
                    n: Math.abs(actualRating.delta),
                  })}
                </>
              )}
            </p>
          )}
        </>
      )}
      <p className="text-xs leading-5 text-base-content/55">{t("coach.level.hint")}</p>
    </Card>
  );
}

function ResultsCard({ profile }: { profile: Profile }) {
  const t = useT();
  const score = scoreOf(profile.record);
  return (
    <Card title={t("coach.results.title")}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm">{t("coach.games", { n: profile.games })}</p>
        {score !== null && (
          <p className="tabular font-mono text-lg">{t("coach.score", { n: percent(score) })}</p>
        )}
      </div>
      <ResultBar tally={profile.record} />
      <h3 className="panel-title mt-1">{t("coach.byColor")}</h3>
      <ul className="divide-y divide-base-content/8">
        <ScoreLine label={t("side.white")} tally={profile.byColor.w} />
        <ScoreLine label={t("side.black")} tally={profile.byColor.b} />
      </ul>
      <h3 className="panel-title mt-1">{t("coach.byTime")}</h3>
      <ul className="divide-y divide-base-content/8">
        {profile.byTimeClass.map((c) => (
          <ScoreLine key={c.timeClass} label={timeClassLabel(t, c.timeClass)} tally={c} />
        ))}
      </ul>
    </Card>
  );
}

function AccuracyCard({ profile }: { profile: Profile }) {
  const t = useT();
  const { precision } = profile;
  return (
    <Card title={t("coach.accuracy.title")}>
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-base-content/75">{t("coach.accuracy.overall")}</span>
        <span className="tabular font-mono text-3xl font-medium">{one(precision.overall)}</span>
      </p>
      <h3 className="panel-title">{t("coach.accuracy.byPhase")}</h3>
      <ul className="flex flex-col gap-2">
        {PHASES.map((phase) => (
          <li key={phase} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span>{t(`phase.${phase}` as MessageKey)}</span>
              <span className="tabular font-mono">{one(precision.byPhase[phase])}</span>
            </div>
            <progress
              className="progress h-2 w-full progress-primary"
              value={precision.byPhase[phase] ?? 0}
              max={100}
              aria-label={t(`phase.${phase}` as MessageKey)}
            />
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-3 border-t border-base-content/10 pt-3 text-sm">
        <div>
          <dt className="text-xs text-base-content/60">{t("coach.accuracy.wins")}</dt>
          <dd className="tabular font-mono text-lg">{one(precision.whenWinning)}</dd>
        </div>
        <div>
          <dt className="text-xs text-base-content/60">{t("coach.accuracy.losses")}</dt>
          <dd className="tabular font-mono text-lg">{one(precision.whenLosing)}</dd>
        </div>
      </dl>
    </Card>
  );
}

const QUALITY: Classification[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
];

function QualityCard({ profile }: { profile: Profile }) {
  const t = useT();
  return (
    <Card title={t("coach.quality.title")}>
      <ul className="flex flex-col">
        {QUALITY.map((c) => (
          <li
            key={c}
            className="flex items-center gap-2 border-b border-base-content/8 py-1.5 text-sm last:border-0"
          >
            <ClassificationBadge classification={c} className="size-5 text-[9px]" />
            <span className="flex-1">{t(`cls.${c}` as MessageKey)}</span>
            <span className="tabular font-mono">{profile.per100[c].toFixed(1)}</span>
          </li>
        ))}
      </ul>
      {profile.themes.length > 0 && (
        <>
          <h3 className="panel-title mt-1">{t("report.themes")}</h3>
          <ul className="flex flex-col">
            {profile.themes.map((theme) => (
              <li
                key={theme.theme}
                className="flex items-baseline gap-2 border-b border-base-content/8 py-1.5 text-sm last:border-0"
              >
                <span className="flex-1">{t(`theme.${theme.theme}` as MessageKey)}</span>
                <span className="tabular text-xs text-base-content/60">
                  {t("coach.perGame", { n: theme.perGame.toFixed(1) })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function InsightsCard({ profile }: { profile: Profile }) {
  const t = useT();
  const strong = profile.insights.filter((i) => i.kind === "strong");
  const weak = profile.insights.filter((i) => i.kind === "weak");
  const list = (items: Insight[], tone: string) => (
    <ul className="flex flex-col gap-2">
      {items.map((insight) => (
        <li key={insight.id} className={`border-l-2 pl-3 text-sm leading-5 ${tone}`}>
          {insightText(t, insight)}
        </li>
      ))}
    </ul>
  );
  return (
    <Card title={t("coach.insights.title")} className="md:col-span-2">
      {profile.insights.length === 0 ? (
        <p className="text-sm text-base-content/65">{t("coach.insights.none")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2" data-testid="insights-strong">
            <h3 className="panel-title text-success">{t("coach.insights.strong")}</h3>
            {list(strong, "border-success")}
          </div>
          <div className="flex flex-col gap-2" data-testid="insights-weak">
            <h3 className="panel-title text-error">{t("coach.insights.weak")}</h3>
            {list(weak, "border-error")}
          </div>
        </div>
      )}
    </Card>
  );
}

function OpeningsTable({ title, rows }: { title: string; rows: OpeningRow[] }) {
  const t = useT();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="panel-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-base-content/65">{t("coach.openings.none")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-xs">
            <thead>
              <tr>
                <th scope="col">{t("coach.col.opening")}</th>
                <th scope="col" className="text-right">
                  {t("coach.col.games")}
                </th>
                <th scope="col" className="text-right">
                  {t("coach.win")[0]}-{t("coach.draw")[0]}-{t("coach.loss")[0]}
                </th>
                <th scope="col" className="text-right">
                  {t("coach.col.score")}
                </th>
                <th scope="col" className="text-right">
                  {t("coach.col.precision")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row) => {
                const score = scoreOf(row);
                return (
                  <tr key={row.name}>
                    <th scope="row" className="max-w-40 truncate font-normal" title={row.name}>
                      {row.name}
                    </th>
                    <td className="tabular text-right font-mono">{row.games}</td>
                    <td className="tabular text-right font-mono">
                      {row.win}-{row.draw}-{row.loss}
                    </td>
                    <td className="tabular text-right font-mono">
                      {score === null ? "—" : `${percent(score)}%`}
                    </td>
                    <td className="tabular text-right font-mono">{one(row.openingPrecision)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TrendCard({ profile }: { profile: Profile }) {
  const t = useT();
  const data = profile.series.map((point, i) => ({ n: i + 1, precision: point.precision }));
  if (data.length < 2) return null;
  return (
    <Card title={t("coach.trend.title")} className="md:col-span-2">
      <p className="text-xs text-base-content/60">{t("coach.trend.caption", { n: data.length })}</p>
      <div className="h-40 w-full" role="img" aria-label={t("coach.trend.title")}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <XAxis dataKey="n" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} width={40} />
            {profile.precision.overall !== null && (
              <ReferenceLine
                y={profile.precision.overall}
                stroke="currentColor"
                strokeOpacity={0.25}
                strokeDasharray="4 4"
              />
            )}
            <Tooltip
              formatter={(value) => [Number(value).toFixed(1), t("coach.accuracy.overall")]}
            />
            <Line
              type="monotone"
              dataKey="precision"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function UsernameForm({ initial, onSave }: { initial: string; onSave(name: string): void }) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) onSave(draft.trim());
      }}
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-base-content/65">
        {t("coach.username")}
        <input
          className="input w-full input-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={40}
        />
      </label>
      <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.trim()}>
        {t("coach.save")}
      </button>
    </form>
  );
}

/**
 * The player's profile, built from the analyses stored on this device: an estimated level,
 * results, accuracy by phase, move quality, recurring mistakes, strengths and weaknesses,
 * and how each opening went. Which side of a game is the player's comes from the saved
 * username (the Chess.com account).
 */
export function CoachPage() {
  const t = useT();
  const username = useSettings((s) => s.chessComUsername);
  const hydrated = useSettings((s) => s.hydrated);
  const setSettings = useSettings((s) => s.set);
  const [loaded, setLoaded] = useState<{ username: string; games: ProfileGame[] } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [editing, setEditing] = useState(false);
  const name = username.trim();

  useEffect(() => {
    if (!hydrated || !name) return;
    let cancelled = false;
    void loadProfileGames(name, (done, total) => {
      if (!cancelled) setProgress({ done, total });
    }).then((games) => {
      if (!cancelled) setLoaded({ username: name, games });
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, name]);

  const ready = loaded !== null && loaded.username === name;
  const loading = hydrated && Boolean(name) && !ready;
  const profile = useMemo(() => (ready ? buildProfile(loaded.games) : null), [ready, loaded]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("coach.title")}</h1>
        <p className="flex items-center gap-1.5 text-sm text-base-content/65">
          <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
          {t("coach.subtitle")}
        </p>
      </header>

      {!name || editing ? (
        <section className="panel flex flex-col gap-2 p-4">
          <UsernameForm
            initial={username}
            onSave={(value) => {
              setSettings({ chessComUsername: value });
              setEditing(false);
            }}
          />
          <p className="text-xs text-base-content/55">{t("coach.usernameHelp")}</p>
        </section>
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium" data-testid="coach-username">
            {name}
          </span>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>
            {t("coach.change")}
          </button>
        </p>
      )}

      {loading && (
        <p className="text-sm text-base-content/65" aria-live="polite">
          {t("coach.loading", { done: progress.done, total: progress.total })}
        </p>
      )}

      {profile && profile.games === 0 && (
        <div
          className="panel flex flex-col items-start gap-3 p-4 text-sm"
          data-testid="coach-empty"
        >
          <p>{t("coach.empty", { name })}</p>
          <Link href="/games" className="btn btn-primary btn-sm">
            {t("coach.emptyAction")}
          </Link>
        </div>
      )}

      {profile && profile.games > 0 && (
        <div className="grid gap-4 md:grid-cols-2" data-testid="coach-profile">
          <LevelCard profile={profile} />
          <ResultsCard profile={profile} />
          <AccuracyCard profile={profile} />
          <QualityCard profile={profile} />
          <InsightsCard profile={profile} />
          <Card title={t("coach.openings.title")} className="md:col-span-2">
            <div className="grid gap-4 lg:grid-cols-2">
              <OpeningsTable title={t("coach.openings.white")} rows={profile.openings.w} />
              <OpeningsTable title={t("coach.openings.black")} rows={profile.openings.b} />
            </div>
          </Card>
          <TrendCard profile={profile} />
          <p className="text-xs leading-5 text-base-content/50 md:col-span-2">
            {t("coach.disclaimer")}
          </p>
        </div>
      )}
    </div>
  );
}

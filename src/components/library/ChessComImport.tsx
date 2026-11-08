"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Play, RefreshCw, RotateCcw } from "lucide-react";
import {
  ChessComError,
  fetchRecentGames,
  isValidUsername,
  openingFromPgn,
  outcomeFor,
  parseTimeControl,
  type ChessComGame,
} from "@/features/chesscom/chesscom";
import { parsePgn } from "@/features/games/pgn";
import { useSettings } from "@/features/settings/settings-store";
import { describeStorageError, type GameRecord } from "@/features/storage/database";
import type { MessageKey } from "@/lib/i18n/translate";
import { useLocale, useT } from "@/lib/i18n/useT";
import { useOnline } from "@/hooks/useOnline";
import { saveParsedGames } from "./import-games";

const OUTCOME_STYLE = {
  win: "bg-success/20 text-success",
  loss: "bg-error/20 text-error",
  draw: "bg-base-300 text-base-content/75",
} as const;

/** Whether a game's analysis exists: shown on every row so analyzed games stand out. */
function AnalysisBadge({ record }: { record: GameRecord | undefined }) {
  const t = useT();
  const state = record?.analysis.state ?? "none";
  if (state === "complete") {
    return (
      <span className="badge hidden badge-soft badge-sm badge-success sm:inline-flex">
        {t("library.analyzed")}
      </span>
    );
  }
  if (state === "partial" && record) {
    const { analyzed, total } = record.analysis;
    return (
      <span className="badge hidden badge-soft badge-sm badge-warning sm:inline-flex">
        {t("library.partial", { percent: total ? Math.round((analyzed / total) * 100) : 0 })}
      </span>
    );
  }
  return (
    <span className="badge hidden badge-ghost badge-sm sm:inline-flex">
      {t("library.notAnalyzed")}
    </span>
  );
}

/**
 * Recent games of a Chess.com account, fetched from Chess.com's public API in the
 * browser. Only the username is sent; a game is imported like any PGN when its Analyze
 * button is pressed, and an analyzed game reopens its stored analysis.
 */
export function ChessComImport({
  records,
  onImported,
}: {
  records: GameRecord[] | null;
  onImported(): void;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const online = useOnline();
  const savedUsername = useSettings((s) => s.chessComUsername);
  const setSettings = useSettings((s) => s.set);
  const [username, setUsername] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [list, setList] = useState<ChessComGame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openingUuid, setOpeningUuid] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const name = username ?? savedUsername;

  // Games already in the library, by their Chess.com link.
  const known = useMemo(() => {
    const map = new Map<string, GameRecord>();
    for (const r of records ?? []) {
      if (r.headers.Link) map.set(r.headers.Link, r);
    }
    return map;
  }, [records]);

  const fetchGames = async () => {
    const trimmed = name.trim();
    if (!isValidUsername(trimmed)) {
      setError(t("chesscom.error.invalid-username"));
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState("loading");
    setError(null);
    try {
      const games = await fetchRecentGames(trimmed, {
        limit: 40,
        maxMonths: 3,
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      setSettings({ chessComUsername: trimmed });
      setList(games);
      setState("done");
    } catch (e) {
      if (abort.signal.aborted) return;
      setState("idle");
      setError(
        e instanceof ChessComError
          ? t(`chesscom.error.${e.code}` as MessageKey)
          : t("chesscom.error.unexpected"),
      );
    }
  };

  /** Imports the game when it is new, then opens it: the analysis starts there. */
  const analyzeGame = async (game: ChessComGame, rerun = false) => {
    const existing = known.get(game.url);
    if (existing) {
      router.push(`/analysis?game=${existing.id}${rerun ? "&rerun=1" : ""}`);
      return;
    }
    setOpeningUuid(game.uuid);
    setError(null);
    try {
      const parsed = parsePgn(game.pgn).games[0];
      if (!parsed) {
        setError(t("chesscom.error.unexpected"));
        return;
      }
      // The link identifies the game for later visits.
      parsed.headers.Link ??= game.url;
      const [saved] = await saveParsedGames([parsed]);
      onImported();
      if (saved) router.push(`/analysis?game=${saved.id}`);
    } catch (e) {
      setError(describeStorageError(e, t));
    } finally {
      setOpeningUuid(null);
    }
  };

  const dateFormat = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-3" data-testid="chesscom-import">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void fetchGames();
        }}
      >
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-base-content/65">
          {t("chesscom.username")}
          <input
            className="input w-full input-sm"
            value={name}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("chesscom.usernamePlaceholder")}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={25}
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={state === "loading" || !name.trim() || !online}
        >
          <RefreshCw
            className={`size-4 ${state === "loading" ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {state === "loading" ? t("chesscom.loading") : t("chesscom.fetch")}
        </button>
      </form>
      <p className="text-xs text-base-content/55">
        {online ? t("chesscom.privacy") : t("chesscom.offline")}
      </p>

      {error && (
        <div role="alert" className="alert alert-soft py-2 text-sm alert-error">
          {error}
        </div>
      )}
      {state === "done" && list.length === 0 && (
        <p className="text-sm text-base-content/60">{t("chesscom.none")}</p>
      )}

      {list.length > 0 && (
        <>
          <p className="text-sm text-base-content/70">{t("chesscom.found", { n: list.length })}</p>
          <ul
            className="max-h-96 divide-y divide-base-content/8 overflow-y-auto rounded-field border border-base-content/10"
            aria-label={t("chesscom.listLabel")}
            data-testid="chesscom-games"
          >
            {list.map((g) => {
              const outcome = outcomeFor(g, name);
              const meWhite = g.white.username.toLowerCase() === name.trim().toLowerCase();
              const opponent = meWhite ? g.black : g.white;
              const record = known.get(g.url);
              const analyzed = record?.analysis.state === "complete";
              const control = parseTimeControl(g.timeControl);
              const opening = record?.opening || openingFromPgn(g.pgn);
              const meta = [
                dateFormat.format(new Date(g.endTime * 1000)),
                t(`chesscom.timeClass.${g.timeClass}` as MessageKey) +
                  (control
                    ? ` ${"label" in control ? control.label : t("chesscom.day", { n: control.days })}`
                    : ""),
                g.rated ? t("chesscom.rated") : t("chesscom.casual"),
                opening,
              ].filter(Boolean);
              return (
                <li key={g.uuid} className="flex items-center gap-2 px-2 py-1.5">
                  {outcome && (
                    <span
                      className={`w-6 shrink-0 rounded text-center font-mono text-xs font-semibold ${OUTCOME_STYLE[outcome]}`}
                      title={t(`chesscom.outcome.${outcome}`)}
                    >
                      {t(`chesscom.outcomeShort.${outcome}`)}
                    </span>
                  )}
                  <span
                    className={`inline-block size-2.5 shrink-0 rounded-full ring-1 ring-base-content/30 ${meWhite ? "bg-eval-white" : "bg-eval-black"}`}
                    title={meWhite ? t("side.white") : t("side.black")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {t("chesscom.vs", { opponent: opponent.username })}{" "}
                      <span className="tabular text-xs text-base-content/55">
                        ({opponent.rating})
                      </span>
                    </span>
                    <span className="block truncate text-xs text-base-content/55">
                      {meta.join(" · ")}
                    </span>
                  </span>
                  <AnalysisBadge record={record} />
                  {analyzed ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-soft btn-xs"
                        aria-label={t("chesscom.openFor", { opponent: opponent.username })}
                        onClick={() => void analyzeGame(g)}
                      >
                        {t("chesscom.open")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-square btn-ghost btn-xs"
                        aria-label={t("chesscom.rerunFor", { opponent: opponent.username })}
                        title={t("chesscom.rerun")}
                        onClick={() => void analyzeGame(g, true)}
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      disabled={openingUuid !== null}
                      aria-label={t("chesscom.analyzeFor", { opponent: opponent.username })}
                      onClick={() => void analyzeGame(g)}
                    >
                      <Play className="size-3" aria-hidden="true" />
                      {openingUuid === g.uuid ? t("chesscom.analyzing") : t("chesscom.analyze")}
                    </button>
                  )}
                  <a
                    href={g.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-square btn-ghost btn-xs"
                    aria-label={t("chesscom.viewOnSite")}
                    title={t("chesscom.viewOnSite")}
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

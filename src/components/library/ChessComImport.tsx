"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  ChessComError,
  fetchRecentGames,
  isValidUsername,
  outcomeFor,
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

/**
 * Recent games of a Chess.com account, fetched from Chess.com's public API in the
 * browser. Only the username is sent; the chosen games are imported like any PGN.
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const name = username ?? savedUsername;

  // Games already in the library, by their Chess.com link.
  const known = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records ?? []) {
      if (r.headers.Link) map.set(r.headers.Link, r.id);
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
    setMessage(null);
    try {
      const games = await fetchRecentGames(trimmed, {
        limit: 40,
        maxMonths: 3,
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      setSettings({ chessComUsername: trimmed });
      setList(games);
      setSelected(
        new Set(
          games
            .filter((g) => !known.has(g.url))
            .slice(0, 10)
            .map((g) => g.uuid),
        ),
      );
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

  const importGames = async (games: ChessComGame[], open: boolean) => {
    setImporting(true);
    setError(null);
    setMessage(null);
    try {
      const parsed = games.flatMap((g) => {
        const result = parsePgn(g.pgn).games[0];
        if (!result) return [];
        // The link identifies the game for later imports.
        result.headers.Link ??= g.url;
        return [result];
      });
      const saved = await saveParsedGames(parsed);
      onImported();
      if (open && saved[0]) {
        router.push(`/analysis?game=${saved[0].id}`);
        return;
      }
      setSelected(new Set());
      setMessage(t("import.imported", { n: saved.length }));
    } catch (e) {
      setError(describeStorageError(e, t));
    } finally {
      setImporting(false);
    }
  };

  const chosen = list.filter((g) => selected.has(g.uuid) && !known.has(g.url));
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
      {message && (
        <div role="status" className="alert alert-soft py-2 text-sm alert-success">
          {message}
        </div>
      )}

      {state === "done" && list.length === 0 && (
        <p className="text-sm text-base-content/60">{t("chesscom.none")}</p>
      )}

      {list.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-base-content/70">
              {t("chesscom.found", { n: list.length })}
            </p>
            <button
              type="button"
              className="btn ml-auto btn-ghost btn-xs"
              onClick={() =>
                setSelected(
                  chosen.length === list.filter((g) => !known.has(g.url)).length
                    ? new Set()
                    : new Set(list.filter((g) => !known.has(g.url)).map((g) => g.uuid)),
                )
              }
            >
              {t("chesscom.toggleAll")}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={importing || chosen.length === 0}
              onClick={() => void importGames(chosen, false)}
            >
              {importing
                ? t("import.importing")
                : t("chesscom.importSelected", { n: chosen.length })}
            </button>
          </div>
          <ul
            className="max-h-96 divide-y divide-base-content/8 overflow-y-auto rounded-field border border-base-content/10"
            aria-label={t("chesscom.listLabel")}
          >
            {list.map((g) => {
              const outcome = outcomeFor(g, name);
              const meWhite = g.white.username.toLowerCase() === name.trim().toLowerCase();
              const opponent = meWhite ? g.black : g.white;
              const existing = known.get(g.url);
              return (
                <li key={g.uuid} className="flex items-center gap-2 px-2 py-1.5">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={!existing && selected.has(g.uuid)}
                    disabled={Boolean(existing)}
                    aria-label={t("chesscom.selectGame", { opponent: opponent.username })}
                    onChange={(e) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(g.uuid);
                        else next.delete(g.uuid);
                        return next;
                      })
                    }
                  />
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
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {t("chesscom.vs", { opponent: opponent.username })}{" "}
                    <span className="tabular text-xs text-base-content/55">
                      ({opponent.rating})
                    </span>
                  </span>
                  <span className="hidden text-xs text-base-content/55 sm:inline">
                    {t(`chesscom.timeClass.${g.timeClass}` as MessageKey)}
                  </span>
                  <span className="tabular hidden text-xs text-base-content/55 sm:inline">
                    {dateFormat.format(new Date(g.endTime * 1000))}
                  </span>
                  {existing ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => router.push(`/analysis?game=${existing}`)}
                    >
                      {t("chesscom.open")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-soft btn-xs"
                      disabled={importing}
                      onClick={() => void importGames([g], true)}
                    >
                      {t("chesscom.analyze")}
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

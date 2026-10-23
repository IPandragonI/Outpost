"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Download, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { exportPgn } from "@/features/games/pgn-export";
import type { GameRecord } from "@/features/storage/database";
import { games } from "@/features/storage/repositories";
import { describeStorageError } from "@/features/storage/database";
import { downloadText, slugify } from "@/lib/download";
import type { MessageKey } from "@/lib/i18n/translate";
import { useT } from "@/lib/i18n/useT";

type SortKey = "recent" | "date" | "white" | "black" | "result" | "opening";

const SORTS: { id: SortKey; label: MessageKey }[] = [
  { id: "recent", label: "library.sort.recent" },
  { id: "date", label: "library.sort.date" },
  { id: "white", label: "side.white" },
  { id: "black", label: "side.black" },
  { id: "result", label: "library.sort.result" },
  { id: "opening", label: "library.sort.opening" },
];

function compare(a: GameRecord, b: GameRecord, key: SortKey): number {
  switch (key) {
    case "recent":
      return b.updatedAt - a.updatedAt;
    case "date":
      // Unknown dates last; "1858.??.??" sorts by its known part.
      return (b.date || "0").localeCompare(a.date || "0");
    case "white":
      return (a.white || "~").localeCompare(b.white || "~");
    case "black":
      return (a.black || "~").localeCompare(b.black || "~");
    case "result":
      return a.result.localeCompare(b.result);
    case "opening":
      return (a.opening || "~").localeCompare(b.opening || "~");
  }
}

function AnalysisStatus({ game }: { game: GameRecord }) {
  const { state, analyzed, total } = game.analysis;
  const t = useT();
  if (state === "complete")
    return <span className="badge badge-soft badge-sm badge-success">{t("library.analyzed")}</span>;
  if (state === "partial") {
    return (
      <span
        className="badge badge-soft badge-sm badge-warning"
        title={t("library.partialHint", { done: analyzed, total })}
      >
        {t("library.partial", { percent: total ? Math.round((analyzed / total) * 100) : 0 })}
      </span>
    );
  }
  return <span className="badge badge-ghost badge-sm">{t("library.notAnalyzed")}</span>;
}

export function GameLibrary({
  records,
  error,
  onChange,
}: {
  records: GameRecord[] | null;
  error: string | null;
  onChange(): void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [result, setResult] = useState<"all" | "1-0" | "0-1" | "1/2-1/2" | "*">("all");
  const [renaming, setRenaming] = useState<GameRecord | null>(null);
  const [deleting, setDeleting] = useState<GameRecord | null>(null);
  const [draft, setDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const renameDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const t = useT();

  const visible = useMemo(() => {
    if (!records) return [];
    const q = query.trim().toLowerCase();
    return records
      .filter((g) => result === "all" || g.result === result)
      .filter(
        (g) =>
          !q ||
          [g.title, g.white, g.black, g.event, g.opening, g.eco, g.date].some((v) =>
            v.toLowerCase().includes(q),
          ),
      )
      .sort((a, b) => compare(a, b, sort));
  }, [records, query, sort, result]);

  const run = async (action: () => Promise<void>) => {
    setActionError(null);
    try {
      await action();
      onChange();
    } catch (e) {
      setActionError(
        e instanceof Error && e.message === "A game needs a name."
          ? t("library.nameRequired")
          : describeStorageError(e, t),
      );
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="library-title">
      <div className="flex flex-wrap items-end gap-2">
        <h2 id="library-title" className="mr-auto text-base font-semibold">
          {t("library.title")}{" "}
          {records && (
            <span className="tabular text-sm font-normal text-base-content/55">
              ({records.length})
            </span>
          )}
        </h2>
        <label className="input w-full input-sm sm:w-64">
          <Search className="size-4 text-base-content/50" aria-hidden="true" />
          <span className="sr-only">{t("library.search")}</span>
          <input
            type="search"
            placeholder={t("library.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="sr-only" htmlFor="result-filter">
          {t("library.sort.result")}
        </label>
        <select
          id="result-filter"
          className="select w-auto select-sm"
          value={result}
          onChange={(e) => setResult(e.target.value as typeof result)}
        >
          <option value="all">{t("library.filter.all")}</option>
          <option value="1-0">{t("library.filter.white")}</option>
          <option value="0-1">{t("library.filter.black")}</option>
          <option value="1/2-1/2">{t("library.filter.draw")}</option>
          <option value="*">{t("library.filter.unfinished")}</option>
        </select>
        <label className="sr-only" htmlFor="sort">
          {t("library.sortBy")}
        </label>
        <select
          id="sort"
          className="select w-auto select-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {t(s.label)}
            </option>
          ))}
        </select>
      </div>

      {(error || actionError) && (
        <div role="alert" className="alert alert-soft py-2 text-sm alert-error">
          {error ?? actionError}
        </div>
      )}

      {records === null && !error ? (
        <p className="text-sm text-base-content/60">{t("library.loading")}</p>
      ) : records && records.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-base-content/65">
          {t("library.empty")}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-base-content/60">{t("library.noMatch")}</p>
      ) : (
        <ul className="panel divide-y divide-base-content/8" data-testid="game-list">
          {visible.map((game) => (
            <li key={game.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-base-200/60">
              <Link href={`/analysis?game=${game.id}`} className="min-w-0 flex-1 rounded-field">
                <p className="truncate text-sm font-medium">{game.title}</p>
                <p className="truncate text-xs text-base-content/60">
                  {[
                    game.result !== "*" ? game.result : null,
                    game.date || null,
                    game.opening ? `${game.eco ? `${game.eco} ` : ""}${game.opening}` : null,
                    t("library.moves", { n: Math.ceil(game.plies / 2) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Link>
              <AnalysisStatus game={game} />
              <div className="dropdown dropdown-end">
                <button
                  type="button"
                  tabIndex={0}
                  className="btn btn-square min-h-11 min-w-11 btn-ghost btn-sm sm:min-h-8 sm:min-w-8"
                  aria-label={t("library.actions", { title: game.title })}
                  aria-haspopup="menu"
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </button>
                <ul
                  tabIndex={0}
                  role="menu"
                  className="menu dropdown-content z-20 w-48 rounded-box border border-base-content/10 bg-base-100 p-1 text-sm"
                >
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setRenaming(game);
                        setDraft(game.title);
                        renameDialog.current?.showModal();
                      }}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      {t("common.rename")}
                    </button>
                  </li>
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        downloadText(
                          `${slugify(game.title)}.pgn`,
                          game.pgn || exportPgn(game.tree, game.headers, game.result),
                          "application/x-chess-pgn",
                        )
                      }
                    >
                      <Download className="size-4" aria-hidden="true" />
                      {t("library.exportPgn")}
                    </button>
                  </li>
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="text-error"
                      onClick={() => {
                        setDeleting(game);
                        deleteDialog.current?.showModal();
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      {t("common.delete")}
                    </button>
                  </li>
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}

      <dialog ref={renameDialog} className="modal" aria-labelledby="rename-title">
        <form
          method="dialog"
          className="modal-box flex flex-col gap-3"
          onSubmit={() => renaming && void run(() => games.rename(renaming.id, draft))}
        >
          <h3 id="rename-title" className="font-semibold">
            {t("library.renameTitle")}
          </h3>
          <input
            className="input w-full"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={120}
            aria-label={t("toolbar.gameName")}
          />
          <div className="modal-action mt-0">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => renameDialog.current?.close()}
            >
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
              {t("common.rename")}
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={deleteDialog} className="modal" aria-labelledby="delete-title">
        <div className="modal-box flex flex-col gap-3">
          <h3 id="delete-title" className="font-semibold">
            {t("library.deleteTitle")}
          </h3>
          <p className="text-sm text-base-content/75">
            {t("library.deleteBody", { title: deleting?.title ?? "" })}
          </p>
          <div className="modal-action mt-0">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => deleteDialog.current?.close()}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={() => {
                if (deleting) void run(() => games.remove(deleting.id));
                deleteDialog.current?.close();
              }}
            >
              {t("common.delete")}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}

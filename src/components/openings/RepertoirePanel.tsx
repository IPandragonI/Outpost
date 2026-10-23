"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { RepertoireRecord } from "@/features/storage/database";
import { describeStorageError } from "@/features/storage/database";
import { newId, repertoires } from "@/features/storage/repositories";
import {
  addLine,
  emptyRepertoire,
  removeMove,
  repertoireLines,
} from "@/features/openings/repertoire";
import { uciLineToSan, START_FEN } from "@/lib/chess/position";
import { useT } from "@/lib/i18n/useT";

export function useRepertoires() {
  const [list, setList] = useState<RepertoireRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const refresh = useCallback(() => {
    repertoires.list().then(
      (items) => {
        setList(items);
        setError(null);
      },
      (e: unknown) => {
        setList([]);
        setError(describeStorageError(e, t));
      },
    );
  }, [t]);
  useEffect(refresh, [refresh]);
  return { list, error, refresh };
}

/** Personal repertoires: create them, add the line on the board, review and prune lines. */
export function RepertoirePanel({
  currentLine,
  onLoadLine,
}: {
  currentLine: string[];
  onLoadLine(uci: string[]): void;
}) {
  const { list, error, refresh } = useRepertoires();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<"w" | "b">("w");
  const [message, setMessage] = useState<string | null>(null);
  const t = useT();

  const selected = list?.find((r) => r.id === selectedId) ?? list?.[0] ?? null;

  const save = async (record: RepertoireRecord) => {
    try {
      await repertoires.save(record);
      refresh();
    } catch (e) {
      setMessage(describeStorageError(e, t));
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = Date.now();
    const record: RepertoireRecord = {
      id: newId(),
      name: trimmed,
      color,
      tree: emptyRepertoire(),
      createdAt: now,
      updatedAt: now,
    };
    await save(record);
    setSelectedId(record.id);
    setName("");
  };

  const addCurrent = async () => {
    if (!selected || !currentLine.length) return;
    const { tree } = addLine(selected.tree, currentLine);
    await save({ ...selected, tree });
    setMessage(t("repertoire.added", { line: uciLineToSan(START_FEN, currentLine).join(" ") }));
  };

  const lines = selected ? repertoireLines(selected.tree) : [];

  return (
    <section className="flex flex-col gap-4" aria-label={t("openings.tab.repertoire")}>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-base-content/65">
          {t("repertoire.new")}
          <input
            className="input w-full input-sm"
            placeholder={t("repertoire.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-base-content/65">
          {t("repertoire.side")}
          <select
            className="select w-auto select-sm"
            value={color}
            onChange={(e) => setColor(e.target.value as "w" | "b")}
          >
            <option value="w">{t("side.white")}</option>
            <option value="b">{t("side.black")}</option>
          </select>
        </label>
        <button type="submit" className="btn btn-sm" disabled={!name.trim()}>
          <Plus className="size-4" aria-hidden="true" />
          {t("repertoire.create")}
        </button>
      </form>

      {(error || message) && (
        <p role="status" className="text-xs text-base-content/70">
          {error ?? message}
        </p>
      )}

      {list && list.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="repertoire">
              {t("openings.tab.repertoire")}
            </label>
            <select
              id="repertoire"
              className="select flex-1 select-sm"
              value={selected?.id ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {list.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.color === "w" ? t("side.white") : t("side.black")})
                </option>
              ))}
            </select>
            {selected && (
              <button
                type="button"
                className="btn btn-ghost text-error btn-sm"
                onClick={async () => {
                  if (!window.confirm(t("repertoire.confirmDelete", { name: selected.name })))
                    return;
                  try {
                    await repertoires.remove(selected.id);
                    setSelectedId(null);
                    refresh();
                  } catch (e) {
                    setMessage(describeStorageError(e, t));
                  }
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                <span className="sr-only">{t("repertoire.delete")}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={addCurrent}
            disabled={!selected || currentLine.length === 0}
          >
            {t("repertoire.addLine")}
          </button>
          <p className="text-xs text-base-content/55">{t("repertoire.addHint")}</p>

          <div className="flex flex-col gap-1">
            <h3 className="panel-title">{t("repertoire.lineCount", { n: lines.length })}</h3>
            {lines.length === 0 ? (
              <p className="text-sm text-base-content/55">{t("repertoire.noLine")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-base-content/8">
                {lines.map((l) => {
                  const leaf = l[l.length - 1]!;
                  return (
                    <li key={leaf.id} className="flex items-center gap-2 py-1">
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate rounded px-1 text-left font-mono text-[13px] hover:bg-base-200"
                        onClick={() => onLoadLine(l.map((n) => n.uci!))}
                        title={t("repertoire.show")}
                      >
                        {l.map((n) => n.san).join(" ")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-square btn-ghost btn-xs"
                        aria-label={t("repertoire.removeLast")}
                        title={t("repertoire.removeLast")}
                        onClick={() =>
                          selected &&
                          void save({ ...selected, tree: removeMove(selected.tree, leaf.id) })
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
      {list && list.length === 0 && (
        <p className="text-sm text-base-content/60">{t("repertoire.empty")}</p>
      )}
    </section>
  );
}

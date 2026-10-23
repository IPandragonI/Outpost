"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { GameRecord } from "@/features/storage/database";
import { describeStorageError } from "@/features/storage/database";
import { games } from "@/features/storage/repositories";
import { GameLibrary } from "./GameLibrary";
import { ImportPanel } from "./ImportPanel";
import { useT } from "@/lib/i18n/useT";

export function LibraryPage() {
  const [records, setRecords] = useState<GameRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  const refresh = useCallback(() => {
    games.list().then(
      (list) => {
        setRecords(list);
        setError(null);
      },
      (e: unknown) => {
        setRecords([]);
        setError(describeStorageError(e, t));
      },
    );
  }, [t]);

  useEffect(refresh, [refresh]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("library.heading")}</h1>
        <p className="flex items-center gap-1.5 text-sm text-base-content/65">
          <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
          {t("library.privacy")}
        </p>
      </div>
      <ImportPanel onImported={refresh} records={records} />
      <GameLibrary records={records} error={error} onChange={refresh} />
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, FileUp, LayoutGrid } from "lucide-react";
import { parsePgn, type PgnError } from "@/features/games/pgn";
import { describeStorageError, type GameRecord } from "@/features/storage/database";
import { isValidFen, START_FEN } from "@/lib/chess/position";
import { useT } from "@/lib/i18n/useT";
import { ChessComImport } from "./ChessComImport";
import { pgnErrorMessage, saveParsedGames } from "./import-games";

type Mode = "paste" | "file" | "chesscom" | "board";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

interface ImportOutcome {
  imported: number;
  errors: PgnError[];
  warnings: number;
}

function ChessComMark({ className }: { className?: string }) {
  // A plain pawn: no Chess.com logo is used.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <circle cx="12" cy="6.5" r="3.5" />
      <path d="M9.5 10.5h5l1.5 7h-8zM6 19h12v2.5H6z" />
    </svg>
  );
}

/** Imports PGN text, files or Chess.com games into the library, or opens an empty board. */
export function ImportPanel({
  onImported,
  records,
}: {
  onImported(): void;
  records: GameRecord[] | null;
}) {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("paste");
  const [text, setText] = useState("");
  const [fen, setFen] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const importText = async (pgn: string) => {
    setBusy(true);
    setFailure(null);
    setOutcome(null);
    try {
      const { games: parsed, errors } = parsePgn(pgn);
      if (!parsed.length) {
        setOutcome({ imported: 0, errors, warnings: 0 });
        return;
      }
      const saved = await saveParsedGames(parsed);
      const warnings = parsed.reduce((n, g) => n + g.warnings.length, 0);
      onImported();
      if (saved.length === 1 && errors.length === 0) {
        router.push(`/analysis?game=${saved[0]!.id}`);
        return;
      }
      setOutcome({ imported: saved.length, errors, warnings });
      setText("");
    } catch (error) {
      setFailure(describeStorageError(error, t));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFailure(t("import.fileTooLarge"));
      return;
    }
    await importText(await file.text());
    if (fileInput.current) fileInput.current.value = "";
  };

  const tabs: {
    id: Mode;
    label: string;
    icon: (props: { className?: string }) => React.ReactNode;
  }[] = [
    { id: "paste", label: t("import.tab.paste"), icon: ClipboardPaste },
    { id: "file", label: t("import.tab.file"), icon: FileUp },
    { id: "chesscom", label: "Chess.com", icon: ChessComMark },
    { id: "board", label: t("import.tab.board"), icon: LayoutGrid },
  ];

  return (
    <section className="panel flex flex-col gap-3 p-4" aria-labelledby="import-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="import-title" className="text-base font-semibold">
          {t("import.title")}
        </h2>
        <div role="tablist" className="join ml-auto" aria-label={t("import.methods")}>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={`btn join-item btn-sm ${mode === id ? "btn-active" : ""}`}
              onClick={() => {
                setMode(id);
                setFailure(null);
                setOutcome(null);
              }}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sr-only sm:hidden">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === "paste" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void importText(text);
          }}
        >
          <label htmlFor="pgn-text" className="sr-only">
            {t("import.pgnText")}
          </label>
          <textarea
            id="pgn-text"
            className="textarea min-h-36 w-full font-mono text-[13px]"
            placeholder={'[Event "…"]\n\n1. e4 e5 2. Nf3 Nc6 …'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          <div className="flex items-center gap-2">
            <p className="text-xs text-base-content/55">{t("import.pasteHint")}</p>
            <button
              type="submit"
              className="btn ml-auto btn-primary btn-sm"
              disabled={busy || !text.trim()}
            >
              {busy ? t("import.importing") : t("import.import")}
            </button>
          </div>
        </form>
      )}

      {mode === "file" && (
        <div
          className="flex flex-col items-center gap-2 rounded-field border border-dashed border-base-content/20 p-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFile(e.dataTransfer.files[0]);
          }}
        >
          <FileUp className="size-6 text-base-content/50" aria-hidden="true" />
          <p className="text-sm">{t("import.drop")}</p>
          <label className="btn btn-sm">
            {t("import.chooseFile")}
            <input
              ref={fileInput}
              type="file"
              accept=".pgn,application/x-chess-pgn,text/plain"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
              disabled={busy}
            />
          </label>
          <p className="text-xs text-base-content/55">{t("import.fileLocal")}</p>
        </div>
      )}

      {mode === "chesscom" && <ChessComImport records={records} onImported={onImported} />}

      {mode === "board" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = fen.trim() || START_FEN;
            if (!isValidFen(value)) {
              setFailure(t("import.badFen"));
              return;
            }
            router.push(`/analysis?fen=${encodeURIComponent(value)}`);
          }}
        >
          <p className="text-sm text-base-content/75">{t("import.boardHint")}</p>
          <label htmlFor="fen" className="sr-only">
            {t("import.fen")}
          </label>
          <input
            id="fen"
            className="input w-full font-mono text-[13px] input-sm"
            placeholder={t("import.fen")}
            value={fen}
            onChange={(e) => setFen(e.target.value)}
            spellCheck={false}
          />
          <button type="submit" className="btn self-end btn-primary btn-sm">
            {t("import.openBoard")}
          </button>
        </form>
      )}

      {failure && (
        <div role="alert" className="alert alert-soft py-2 text-sm alert-error">
          {failure}
        </div>
      )}
      {outcome && (
        <div
          role="status"
          className={`alert alert-soft py-2 text-sm ${outcome.imported ? "alert-success" : "alert-error"}`}
        >
          <div className="flex flex-col gap-1">
            <p>
              {outcome.imported
                ? t("import.imported", { n: outcome.imported })
                : t("import.noneImported")}
              {outcome.warnings > 0 && ` ${t("import.warnings", { n: outcome.warnings })}`}
            </p>
            {outcome.errors.slice(0, 5).map((e) => (
              <p key={e.gameIndex + e.message} className="text-xs">
                {t("import.gameError", { n: e.gameIndex, error: pgnErrorMessage(t, e) })}
              </p>
            ))}
            {outcome.errors.length > 5 && (
              <p className="text-xs">{t("import.moreErrors", { n: outcome.errors.length - 5 })}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

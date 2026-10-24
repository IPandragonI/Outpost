"use client";

import {
  BOARD_THEMES,
  PIECE_SETS,
  useSettings,
  type BoardTheme,
  type PieceSet,
  type ThemeSetting,
} from "@/features/settings/settings-store";
import { useLocale, useT } from "@/lib/i18n/useT";

/**
 * Appearance pickers shared by the settings page and the quick settings dialog, so both
 * always offer the same choices.
 */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      className="toggle toggle-primary"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
    />
  );
}

export function LanguageChoice() {
  const t = useT();
  const locale = useLocale();
  const set = useSettings((s) => s.set);
  return (
    <div className="join" role="radiogroup" aria-label={t("settings.language")}>
      {(["fr", "en"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          role="radio"
          lang={lang}
          aria-checked={locale === lang}
          className={`btn join-item btn-sm ${locale === lang ? "btn-active" : ""}`}
          onClick={() => set({ locale: lang })}
        >
          {lang === "fr" ? "Français" : "English"}
        </button>
      ))}
    </div>
  );
}

export function ThemeChoice() {
  const t = useT();
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  return (
    <div className="join" role="radiogroup" aria-label={t("settings.theme")}>
      {(["dark", "light", "system"] as ThemeSetting[]).map((th) => (
        <button
          key={th}
          type="button"
          role="radio"
          aria-checked={theme === th}
          className={`btn join-item btn-sm ${theme === th ? "btn-active" : ""}`}
          onClick={() => set({ theme: th })}
        >
          {t(`settings.theme.${th}`)}
        </button>
      ))}
    </div>
  );
}

export function BoardThemePicker({ className = "" }: { className?: string }) {
  const t = useT();
  const boardTheme = useSettings((s) => s.boardTheme);
  const customLight = useSettings((s) => s.customLight);
  const customDark = useSettings((s) => s.customDark);
  const set = useSettings((s) => s.set);
  return (
    <div
      className={`flex flex-wrap gap-2 ${className}`}
      role="radiogroup"
      aria-label={t("settings.boardColours")}
    >
      {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((key) => {
        const theme =
          key === "custom" ? { light: customLight, dark: customDark } : BOARD_THEMES[key];
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={boardTheme === key}
            aria-label={t(`settings.boardTheme.${key}`)}
            title={t(`settings.boardTheme.${key}`)}
            onClick={() => set({ boardTheme: key })}
            className={`grid size-11 grid-cols-2 overflow-hidden rounded-field ring-offset-2 ring-offset-base-100 ${
              boardTheme === key ? "ring-2 ring-primary" : "ring-1 ring-base-content/15"
            }`}
          >
            <span style={{ background: theme.light }} />
            <span style={{ background: theme.dark }} />
            <span style={{ background: theme.dark }} />
            <span style={{ background: theme.light }} />
          </button>
        );
      })}
    </div>
  );
}

export function PieceSetPicker({ className = "" }: { className?: string }) {
  const t = useT();
  const pieceSet = useSettings((s) => s.pieceSet);
  const set = useSettings((s) => s.set);
  return (
    <div
      className={`flex flex-wrap gap-2 ${className}`}
      role="radiogroup"
      aria-label={t("settings.pieceSet")}
    >
      {(Object.keys(PIECE_SETS) as PieceSet[]).map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={pieceSet === key}
          aria-label={PIECE_SETS[key].label}
          title={PIECE_SETS[key].label}
          onClick={() => set({ pieceSet: key })}
          className={`flex size-11 items-center justify-center rounded-field bg-base-300 p-1 ${
            pieceSet === key ? "ring-2 ring-primary" : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/pieces/${key}/wN.svg`} alt="" className="size-full" />
        </button>
      ))}
    </div>
  );
}

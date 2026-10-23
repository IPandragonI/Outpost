"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { settingsStore } from "@/features/storage/repositories";

export type ThemeSetting = "dark" | "light" | "system";
export type BoardTheme =
  | "slate"
  | "walnut"
  | "sage"
  | "mono"
  | "ocean"
  | "rose"
  | "olive"
  | "midnight"
  | "custom";
export type PieceSet = "cburnett" | "merida" | "chessnut" | "fantasy" | "spatial" | "celtic";
export type AnimationSpeed = "fast" | "normal" | "slow";
/** How strictly moves are judged (scales the loss thresholds, see rulesFor). */
export type Sensitivity = "lenient" | "standard" | "strict";
export type PresetId = "quick" | "standard" | "deep";
export type Locale = "fr" | "en";

export interface Settings {
  locale: Locale;
  theme: ThemeSetting;
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  /** Square colours of the "custom" board theme. */
  customLight: string;
  customDark: string;
  showCoordinates: boolean;
  animations: boolean;
  animationSpeed: AnimationSpeed;
  sound: boolean;
  /** 0 to 1. */
  soundVolume: number;
  sensitivity: Sensitivity;
  /** Analyze the position on the board continuously. */
  liveEngine: boolean;
  liveMultiPv: number;
  liveDepth: number;
  bestMoveArrow: boolean;
  /** Show the move's classification symbol on the board. */
  boardBadges: boolean;
  presetId: PresetId;
  /** null: chosen for the device (see detectEngineConfig). */
  engineThreads: number | null;
  engineHashMb: number | null;
  /** Chess.com username whose recent games are offered for import. */
  chessComUsername: string;
  /** Ids of the theory lessons whose exercise was solved. */
  solvedLessons: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  locale: "fr",
  theme: "light",
  boardTheme: "slate",
  pieceSet: "cburnett",
  customLight: "#e8e4d8",
  customDark: "#6d8a74",
  showCoordinates: true,
  animations: true,
  animationSpeed: "normal",
  sound: true,
  soundVolume: 0.6,
  sensitivity: "standard",
  liveEngine: true,
  liveMultiPv: 3,
  liveDepth: 22,
  bestMoveArrow: true,
  boardBadges: true,
  presetId: "standard",
  engineThreads: null,
  engineHashMb: null,
  chessComUsername: "",
  solvedLessons: [],
};

/** Read before first paint (layout.tsx) to apply the theme without a flash. */
export const THEME_STORAGE_KEY = "outpost-theme";
/** Mirror of the language, read before first paint and before settings are loaded. */
export const LOCALE_STORAGE_KEY = "outpost-locale";

interface SettingsState extends Settings {
  hydrated: boolean;
  set: (patch: Partial<Settings>) => void;
  reset: () => void;
}

/**
 * Settings live in IndexedDB with the rest of the user's data. During server rendering
 * there is no IndexedDB: the defaults are used and the browser rehydrates them.
 */
const hasIndexedDb = () => typeof indexedDB !== "undefined";
const indexedDbStorage: StateStorage = {
  getItem: async (name) =>
    hasIndexedDb() ? ((await settingsStore.get<string>(name)) ?? null) : null,
  setItem: async (name, value) => {
    if (hasIndexedDb()) await settingsStore.set(name, value);
  },
  removeItem: async (name) => {
    if (hasIndexedDb()) await settingsStore.set(name, undefined);
  },
};

function mirror(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    if (key === LOCALE_STORAGE_KEY) window.dispatchEvent(new Event("outpost-locale"));
  } catch {
    // Storage blocked: the setting still applies for this visit.
  }
}
const mirrorTheme = (theme: ThemeSetting) => mirror(THEME_STORAGE_KEY, theme);
const mirrorLocale = (locale: Locale) => mirror(LOCALE_STORAGE_KEY, locale);

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      hydrated: false,
      set: (patch) => {
        set(patch);
        if (patch.theme) mirrorTheme(patch.theme);
        if (patch.locale) mirrorLocale(patch.locale);
      },
      reset: () => {
        set(DEFAULT_SETTINGS);
        mirrorTheme(DEFAULT_SETTINGS.theme);
        mirrorLocale(DEFAULT_SETTINGS.locale);
      },
    }),
    {
      name: "settings",
      version: 1,
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: (state) =>
        Object.fromEntries(
          (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).map((k) => [k, state[k]]),
        ) as unknown as Settings,
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<Settings>) }),
      onRehydrateStorage: () => (state) => {
        useSettings.setState({ hydrated: true });
        if (state?.theme) mirrorTheme(state.theme);
        if (state?.locale) mirrorLocale(state.locale);
      },
    },
  ),
);

export const BOARD_THEMES: Record<BoardTheme, { label: string; light: string; dark: string }> = {
  slate: { label: "Slate", light: "#d9d5c8", dark: "#7a8898" },
  walnut: { label: "Walnut", light: "#ecdcbd", dark: "#a57c55" },
  sage: { label: "Sage", light: "#e4e7da", dark: "#86a07c" },
  mono: { label: "Graphite", light: "#d2d2d2", dark: "#8a8d91" },
  ocean: { label: "Ocean", light: "#dee6ea", dark: "#5f86a0" },
  rose: { label: "Rose", light: "#f2e1df", dark: "#b07a7f" },
  olive: { label: "Olive", light: "#e9e6cc", dark: "#8c8c5a" },
  midnight: { label: "Midnight", light: "#9aa4b1", dark: "#4b5563" },
  custom: { label: "Custom", light: "#e8e4d8", dark: "#6d8a74" },
};

/** Square colours of a theme, the custom one taken from the settings. */
export function boardColors(
  settings: Pick<Settings, "boardTheme" | "customLight" | "customDark">,
): { light: string; dark: string } {
  if (settings.boardTheme === "custom") {
    return { light: settings.customLight, dark: settings.customDark };
  }
  return BOARD_THEMES[settings.boardTheme] ?? BOARD_THEMES.slate;
}

export const ANIMATION_MS: Record<AnimationSpeed, number> = { fast: 100, normal: 180, slow: 320 };

export const PIECE_SETS: Record<PieceSet, { label: string; author: string; license: string }> = {
  cburnett: { label: "Classic", author: "Colin M.L. Burnett", license: "GPL-2.0-or-later" },
  merida: { label: "Merida", author: "Armando Hernandez Marroquin", license: "GPL-2.0-or-later" },
  chessnut: { label: "Chessnut", author: "Alexis Luengas", license: "Apache-2.0" },
  fantasy: { label: "Fantasy", author: "Maurizio Monge", license: "MIT" },
  spatial: { label: "Spatial", author: "Maurizio Monge", license: "MIT" },
  celtic: { label: "Celtic", author: "Maurizio Monge", license: "MIT" },
};

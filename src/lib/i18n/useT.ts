"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_SETTINGS,
  LOCALE_STORAGE_KEY,
  useSettings,
  type Locale,
} from "@/features/settings/settings-store";
import { translate, type Translate } from "./translate";

function subscribe(callback: () => void) {
  window.addEventListener("outpost-locale", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("outpost-locale", callback);
    window.removeEventListener("storage", callback);
  };
}

function storedLocale(): Locale {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    return value === "en" || value === "fr" ? value : DEFAULT_SETTINGS.locale;
  } catch {
    return DEFAULT_SETTINGS.locale;
  }
}

/**
 * The interface language. Pages are prerendered in French (the default); in the browser,
 * the copy mirrored in localStorage applies until settings are loaded from IndexedDB.
 */
export function useLocale(): Locale {
  const hydrated = useSettings((s) => s.hydrated);
  const setting = useSettings((s) => s.locale);
  const mirrored = useSyncExternalStore(subscribe, storedLocale, () => DEFAULT_SETTINGS.locale);
  return hydrated ? setting : mirrored;
}

export function useT(): Translate {
  const locale = useLocale();
  return useCallback((key, vars) => translate(locale, key, vars), [locale]);
}
